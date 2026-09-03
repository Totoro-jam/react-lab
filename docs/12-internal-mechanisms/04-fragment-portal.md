---
title: "Fragment 与 Portal 的 Fiber 表示"
---


> 对应源码：[`packages/react-reconciler/src/ReactWorkTags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactWorkTags.js), [`packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js)

## 如果 Fiber 只是一个树结构

React 的 Fiber 树对应 DOM 树——大部分情况下，一个 Fiber 节点对应一个 DOM 节点。但有两个例外：Fragment 和 Portal。它们不产生 DOM 节点，但它们在 Fiber 树中有自己的位置。

## Fragment：不产生 DOM 容器的"透明分组"

```jsx
function Items() {
  return (
    <Fragment>
      <li>One</li>
      <li>Two</li>
      <li>Three</li>
    </Fragment>
  );
}
```

`<Fragment>` 在 DOM 中不产生任何额外节点——三个 `<li>` 直接挂载在父节点下。但在 Fiber 树中，Fragment 有自己的 Fiber 节点。

### Fragment 的 WorkTag

```javascript
// ReactWorkTags.js
const Fragment = 7;
```

Fragment Fiber 的特殊之处：

```
普通 Fiber（如 HostComponent <div>）：
  beginWork → 创建 Fiber
  completeWork → 创建真实 DOM 元素
  commitMount → 把 DOM 插入父节点

Fragment Fiber：
  beginWork → 创建 Fiber
  completeWork → 不创建任何 DOM 元素
  commitMount → 不做任何事（子节点的 DOM 会自己挂载）
```

Fragment 的 `completeWork` 是**空操作**——它不创建 DOM 节点。子节点的 DOM 元素会在 commit 阶段直接插入到 Fragment 的父 DOM 节点中。

### key 的作用

```jsx
// 有 key 的 Fragment——列表中的每一个 Fragment 可以被 Diff
{items.map(item => (
  <Fragment key={item.id}>
    <dt>{item.term}</dt>
    <dd>{item.desc}</dd>
  </Fragment>
))}

// 短语法 <></> 不支持 key——需要用 <Fragment key={...}>
```

## Portal：DOM 树之外的子树

```jsx
function Modal({ children }) {
  return ReactDOM.createPortal(
    children,
    document.getElementById('modal-root')
  );
}
```

Portal 把子节点渲染到 DOM 树的另一个位置——而不是当前 Fiber 树的位置。但**React 的事件系统仍然遵循 Fiber 树结构**，不是 DOM 树结构。

### Portal 的 WorkTag

```javascript
// ReactWorkTags.js
const HostPortal = 4;
```

```
Fiber 树：                    DOM 树：
<App>                         <div id="app">
  <div>                         <div>
    <Portal → modal-root>         <h1>标题</h1>
      <ModalContent>            </div>
        <h1>标题</h1>           <div id="modal-root">
      </ModalContent>             <div>  ← ModalContent 的 DOM
    </Portal>                       <h1>标题</h1>
  </div>                          </div>
</App>                         </div>
```

### completeWork 中的 Portal 处理

```javascript
// ReactFiberCompleteWork.js: completeWork（简化）

function completeWork(current, workInProgress, renderLanes) {
  switch (workInProgress.tag) {
    case HostPortal: {
      // Portal 不创建 DOM 容器
      // 但它需要记录 portal 的目标容器
      // 子节点的 DOM 会在 commit 阶段插入到 portal 容器中
      if (!current && workInProgress.stateNode == null) {
        // 首次挂载：获取 portal 容器
        workInProgress.stateNode = getPortalContainer(workInProgress);
      }
      // 不创建 DOM 节点
      return null;
    }

    case HostComponent: {
      // 正常的 DOM 元素
      if (!current) {
        // 创建真实 DOM 元素
        const instance = createInstance(workInProgress.type, ...);
        workInProgress.stateNode = instance;
      }
      // ... 更新属性等
      return null;
    }
  }
}
```

### 事件冒泡的特殊性

```
DOM 树中的事件冒泡：
  <h1> → <div id="modal-root"> → <body>

React 事件系统中的冒泡（遵循 Fiber 树）：
  <h1>(ModalContent) → <Portal> → <div>(App) → <App>

这意味着：
  → <App> 上的 onClick 能捕获 Modal 内的点击
  → 即使 Modal 的 DOM 不在 App 的 DOM 子树内
  → context 也能跨 Portal 传递（因为遵循 Fiber 树）
```

> [React 官方文档 Portal](https://react.dev/reference/react-dom/createPortal)说明了事件冒泡的特殊性。这也是 React 事件系统不直接使用 DOM 冒泡、而是自己做 Fiber 树遍历的原因之一。

## Commit 阶段的插入逻辑

```javascript
// ReactFiberCommitHostEffects.js: commitPlacement（简化）

function commitPlacement(finishedWork) {
  const parentFiber = getParent(finishedWork);
  const parentDom = getParentDomContainer(parentFiber);

  // 需要处理 Portal 等特殊情况
  if (parentFiber.tag === HostPortal) {
    // 父节点是 Portal → 插入到 Portal 的容器
    const portalContainer = parentFiber.stateNode;
    insertChildToContainer(portalContainer, finishedWork.stateNode);
  } else {
    // 正常情况 → 插入到父 DOM 节点
    insertChildToContainer(parentDom, finishedWork.stateNode);
  }

  // 如果子节点是 Fragment → 它的子节点的 DOM 也直接插入
  if (finishedWork.tag === Fragment) {
    // Fragment 自身没有 DOM → 递归处理子节点
    // 子节点的 DOM 直接插入到 parentDom
  }
}
```

## 三个"无 DOM 但有 Fiber"的节点对比

```
Fragment (tag=7)：
  → 不产生 DOM
  → 子节点 DOM 直接挂载到 Fragment 的父容器
  → 用途：分组列表项、条件渲染多个元素

Portal (tag=4)：
  → 不产生自身的 DOM
  → 子节点 DOM 挂载到指定的外部容器
  → 用途：Modal、Tooltip、浮层

Suspense (tag=13)：
  → 不产生自身 DOM（它的 fallback/content 产生 DOM）
  → 子节点挂载时先显示 fallback，ready 后切换到 content
  → 用途：异步加载、代码分割
```

## 下一步

- [WorkTag 类型体系](/02-fiber-architecture/02-work-tags) — 所有 WorkTag 的完整列表
- [Commit 阶段](/03-work-loop/05-commit-phase) — Commit 阶段的 DOM 插入逻辑
- [事件派发](/07-event-system/03-event-dispatch) — 事件系统为什么不遵循 DOM 树

## 参考资料

- [React 源码 ReactWorkTags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactWorkTags.js) — 所有 WorkTag 定义
- [React 源码 ReactFiberCompleteWork.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCompleteWork.js) — completeWork 中的 Fragment/Portal 处理
- [React Portal (官方文档)](https://react.dev/reference/react-dom/createPortal) — createPortal API 和事件冒泡说明
- [React Fragment (官方文档)](https://react.dev/reference/react/Fragment) — Fragment API 和 key 使用
- [Portals (React 旧文档)](https://legacy.reactjs.org/docs/portals.html) — Portal 的事件冒泡解释
