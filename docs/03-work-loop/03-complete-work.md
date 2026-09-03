---
title: "completeWork 详解"
---



> 对应源码：[`packages/react-reconciler/src/ReactFiberCompleteWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCompleteWork.js)

## 1. completeWork 的职责

`completeWork` 是"归"阶段的处理函数，在 `completeUnitOfWork` 内部调用。当 `beginWork` 返回 null（没有子节点）时，处理流程从"递"切换到"归"。[Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) 对 completeUnitOfWork 的向上冒泡做了逐行解析。

```javascript
function completeWork(
  current: Fiber | null,       // 上一次渲染的 Fiber
  workInProgress: Fiber,        // 本次渲染的 Fiber
  renderLanes: Lanes,
): Fiber | null
```

完成时执行职责：

1. 创建真实 DOM 节点（首次渲染/mount）
2. 准备 DOM 更新队列（更新时）
3. 将子节点的 DOM 挂载到当前 DOM 上（`appendAllChildren`）
4. 收集子树的 flags 到父节点的 `subtreeFlags`（冒泡副作用）

## 2. HostComponent 的 completeWork

```javascript
// packages/react-reconciler/src/ReactFiberCompleteWork.js（简化）

function completeWork(current, workInProgress, renderLanes) {
  const newProps = workInProgress.pendingProps;

  switch (workInProgress.tag) {
    case HostComponent: {  // <div>, <span> 等 DOM 元素
      const type = workInProgress.type;

      if (current !== null && workInProgress.stateNode != null) {
        // === 更新场景 ===
        // current 存在 && DOM 节点已创建
        updateHostComponent(current, workInProgress, type, newProps, renderLanes);
        // updateHostComponent 内部（mutation 模式）：
        //   const oldProps = current.memoizedProps;
        //   if (oldProps === newProps) return;  // props 没变 → 跳过
        //   markUpdate(workInProgress);  // props 变了 → 标记 Update flag
        // 注意：props diff 不在这里做，而是在 commit 阶段的 commitUpdate 中完成
        bubbleProperties(workInProgress);
        return null;
      }

      // === 首次渲染场景 ===
      // 创建真实 DOM 节点
      const instance = createInstance(type, newProps, ...);

      // 关键：将子节点的 DOM 挂载到当前 DOM 上
      appendAllChildren(instance, workInProgress);

      // 设置 stateNode 指向真实 DOM
      workInProgress.stateNode = instance;

      // 设置初始 DOM 属性
      finalizeInitialChildren(instance, type, newProps, ...);

      // 标记 Placement
      workInProgress.flags |= Placement;

      bubbleProperties(workInProgress);
      return null;
    }

    case HostText: {  // 纯文本节点
      const newText = newProps;

      if (current !== null && workInProgress.stateNode != null) {
        // 更新：比较新旧文本
        const oldText = current.memoizedProps;
        if (oldText !== newText) {
          workInProgress.flags |= Update;
        }
        bubbleProperties(workInProgress);
        return null;
      }

      // 首次渲染：创建 TextNode
      const instance = createTextInstance(newText, ...);
      workInProgress.stateNode = instance;
      workInProgress.flags |= Placement;
      bubbleProperties(workInProgress);
      return null;
    }

    case FunctionComponent: {
      // 函数组件在 completeWork 中几乎不做事
      // 主要是 bubbleProperties（冒泡子树 flags）
      bubbleProperties(workInProgress);
      return null;
    }
  }
}
```

## 3. appendAllChildren：构建 DOM 树结构

这是 completeWork 最关键的操作之一。在首次渲染时，需要把子孙节点的 DOM 挂接到当前节点的 DOM 上，形成真实的 DOM 树。

```
Fiber 树 :                    DOM 树 :
App                          (还没有 DOM)
div                         <div>                ← 正在 completeWork
span                    <span>               ← 子节点 DOM 已创建
"Hi"                "Hi"                 ← 孙节点 DOM 已创建
button                  <button>             ← 子节点 DOM 已创建
completeWork(div) 调用 appendAllChildren(div_DOM):
遍历 div 的所有子孙 Fiber
把它们的 stateNode (DOM 节点) appendChild 到 div_DOM
结果 DOM 树:
<div>
<span>Hi</span>
<button>...</button>
</div>
```

`appendAllChildren` 要遍历整个子树（不只是直接子节点），因为中间可能有 Fragment 或其他不产生 DOM 节点的类型：

```
Fiber 树:
  div (HostComponent)
    Fragment                  ← 不产生 DOM
      span (HostComponent)    ← 产生 DOM
      span (HostComponent)    ← 产生 DOM

appendAllChildren(div_DOM):
  跳过 Fragment（不产生 DOM）
  找到 span → appendChild 到 div_DOM
  找到 span → appendChild 到 div_DOM
```

## 4. bubbleProperties：冒泡副作用

`completeWork` 的最后一步是 `bubbleProperties`——将子树的 flags 冒泡到父节点的 `subtreeFlags`。[React 技术揭秘 - completeWork](https://react.iamkasong.com/render/completeWork.html) 详细分析了 bubbleProperties 如何优化 Commit 阶段的遍历。

```javascript
// 简化版
function bubbleProperties(completedWork) {
  let subtreeFlags = NoFlags;

  let child = completedWork.child;
  while (child !== null) {
    subtreeFlags |= child.flags;
    subtreeFlags |= child.subtreeFlags;

    // 注意：deletions 不在 bubbleProperties 中收集
    // deletions 在 beginWork 的 reconcileChildren 阶段通过 deleteChild 直接设置
    // （见 ReactChildFiber.js 的 deleteChild 函数 → returnFiber.deletions.push(childToDelete)）

    child = child.sibling;
  }

  completedWork.subtreeFlags = subtreeFlags;
}
```

冒泡效果（示例）：

```
         div
  flags: NoFlags
  subtreeFlags: Placement | Passive ← 冒泡收集
  deletions: null
     │ child              │ sibling
     ▼                    ▼
   span                 button
  flags: Placement     flags: Passive
  subtree: NoFlags      subtree: NoFlags

div.subtreeFlags = span.flags | button.flags
                 = Placement | Passive

Commit 阶段遍历到 div：
  看到 subtreeFlags 有 Passive
  → 知道子树有 useEffect 需要执行
  → 但不需要检查 div 本身（div.flags = NoFlags）
```

## 5. 首次渲染 vs 更新的区别

```
首次渲染（mount）：
  completeWork 主要做两件事：
  1. createInstance / createTextInstance → 创建真实 DOM 节点
  2. appendAllChildren → 组装 DOM 树结构
  3. finalizeInitialChildren → 设置初始属性
  4. 标记 Placement flag（Commit 阶段插入 DOM）

更新（update）：
  completeWork 主要做：
  1. 比较 oldProps === newProps → 相等则跳过
  2. 不等 → markUpdate（标记 Update flag）
  3. 实际的 props diff 在 Commit 阶段的 commitUpdate 中完成
  4. 不需要创建新 DOM（复用 stateNode）
  5. 不需要 appendAllChildren（DOM 结构已存在）
```

## 6. `createInstance` 的实际实现

`createInstance` 不是在 `react-reconciler` 中定义的——它由 HostConfig 注入。对 ReactDOM 来说：

```javascript
// packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js（简化）

function createInstance(type, props, rootContainer, hostContext, internalHandle) {
  // 创建真实 DOM 元素
  const domElement = createElement(type, props, rootContainer);

  // 预处理特殊属性
  precacheFiberNode(internalHandle, domElement);
  updateFiberProps(domElement, props);

  return domElement;
}

function createElement(type, props, rootContainer) {
  // 最终调用 document.createElement
  const domElement = document.createElement(type);
  return domElement;
}
```

这就是 React 与平台解耦的关键——`createInstance` 在 DOM 环境下创建 `HTMLElement`，在 Native 下创建原生 View，在 Test Renderer 下创建 mock 对象。

## 下一步

- [Diff 算法](/03-work-loop/04-reconcile-children) — beginWork 中调用的 Diff 算法
- [Commit 阶段](/03-work-loop/05-commit-phase) — completeWork 产出的 flags 如何在 Commit 阶段执行
- [错误边界与恢复](/03-work-loop/06-error-handling) — completeWork 出错时的 unwind 流程

## 参考资料

- [Inside Fiber (Max Koretskyi) - completeWork phase](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/)
- [React 技术揭秘 - completeWork (卡颂)](https://react.iamkasong.com/render/completeWork.html)
- [React 源码 ReactFiberCompleteWork.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCompleteWork.js)
