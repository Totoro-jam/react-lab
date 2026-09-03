---
title: "beginWork 详解"
---



> 对应源码：[`packages/react-reconciler/src/ReactFiberBeginWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js)

## 1. beginWork 的职责

`beginWork` 是"递"阶段的处理函数。[Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) 将其称为工作循环中最重要的函数。它接收三个参数：

```javascript
function beginWork(
  current: Fiber | null,      // 上一次渲染的 Fiber（alternate）
  workInProgress: Fiber,       // 本次渲染的 Fiber
  renderLanes: Lanes,          // 本次渲染的优先级
): Fiber | null
```

它的职责：

1. 检查是否可以 **bailout**（跳过不需要更新的子树）
2. 根据 `tag` 分发到对应的处理函数
3. 调用组件函数/render 方法，获取返回的 React Element
4. 调用 `reconcileChildren()` 将 Element 转换为子 Fiber
5. 返回子 Fiber（继续向下处理），或返回 null（无子节点，进入 completeWork）

## 2. bailout：跳过优化的核心

```javascript
// ReactFiberBeginWork.js（简化）

function beginWork(current, workInProgress, renderLanes) {
  if (current !== null) {
    // 不是首次渲染（current 存在）
    const oldProps = current.memoizedProps;
    const newProps = workInProgress.pendingProps;

    if (
      oldProps !== newProps ||           // props 变了
      hasLegacyContextChanged()          // legacy context 变了
    ) {
      didReceiveUpdate = true;           // 标记有更新
    } else {
      // props 和 context 都没变 → 检查是否有调度更新
      const hasScheduledUpdateOrContext =
        checkScheduledUpdateOrContext(current, renderLanes);

      if (
        !hasScheduledUpdateOrContext &&           // 没有调度更新
        (workInProgress.flags & DidCapture) === NoFlags  // 没有错误捕获
      ) {
        // === bailout：跳过整个子树 ===
        didReceiveUpdate = false;
        return attemptEarlyBailoutIfNoScheduledUpdate(
          current, workInProgress, renderLanes,
        );
        // → bailoutOnAlreadyFinishedWork → cloneChildFibers
      }
    }
  }

  // 正常处理：根据 tag 分发
  switch (workInProgress.tag) {
    case FunctionComponent:
      return updateFunctionComponent(...);
    // ...
  }
}
```

bailout 的效果：

```
组件树：
  <App>
    <Header data={staticData} />    ← props 引用不变
    <Main state={changed} />        ← state 变了
    <Footer />                      ← 没有任何变化
  </App>

只有 <Main> 需要更新时：
  beginWork(App)   → 有子树更新 → 继续
  beginWork(Header)→ props 没变 → bailout（跳过整个 Header 子树）
  beginWork(Main)  → 有更新 → 正常处理
  beginWork(Footer)→ 没变化 → bailout（跳过整个 Footer 子树）

节省了 Header 和 Footer 子树的全部 beginWork + completeWork！
```

注意 `oldProps === newProps` 用的是**引用相等**，不是浅比较。这就是为什么 `React.memo` 有效——它阻止 props 引用变化，让 React 能命中 bailout。[React 技术揭秘 - beginWork](https://react.iamkasong.com/render/beginWork.html) 对 bailout 的条件做了更细致的拆解。

### didReceiveUpdate 的三阶段生命周期

上面的代码中出现了一个关键变量 `didReceiveUpdate`，它控制着"渲染后是否跳过子树"。但它的生命周期比看起来复杂——它是一个**模块级变量**（`ReactFiberBeginWork.js:317`），不是 per-fiber 的，而是在每个 Fiber 的 beginWork 执行期间经历三个阶段：

```
阶段 1：beginWork 入口 — 根据外部输入设置初始值
─────────────────────────────────────────────────
  current !== null（非首次渲染）：
    props 变了 / context 变了  →  true（必须渲染）
    没有调度更新              →  false + 立即 bailout（不渲染）
    有调度更新但 props 没变    →  false（先渲染，看 hooks 是否翻转）

  current === null（首次渲染）：
    →  false（mount 不需要"是否更新"判断）

阶段 2：组件渲染期间 — hooks 可能翻转为 true
─────────────────────────────────────────────────
  renderWithHooks 执行你的函数组件期间：
    useState reducer 计算出新 state ≠ 旧 state
      → markWorkInProgressReceivedUpdate()  →  didReceiveUpdate = true
    useSyncExternalStore snapshot 变了
      → markWorkInProgressReceivedUpdate()  →  didReceiveUpdate = true
    useMemo 重新计算后值不同
      → markWorkInProgressReceivedUpdate()  →  didReceiveUpdate = true
    Context 消费者检测到 context 变化
      → markWorkInProgressReceivedUpdate()  →  didReceiveUpdate = true

阶段 3：渲染后检查 — 决定是否跳过子树
─────────────────────────────────────────────────
  if (current !== null && !didReceiveUpdate) {
    → bailoutOnAlreadyFinishedWork  // 跳过整个子树
  } else {
    → reconcileChildren             // 正常 Diff 子节点
  }
```

这个设计的关键洞察是：**有调度更新 ≠ 真的需要重新渲染子树**。比如 `setState(x)` 但 `x` 的值和当前 state 相同时（`Object.is` 比较），hook 不会调用 `markWorkInProgressReceivedUpdate()`，`didReceiveUpdate` 保持 `false`，子树被跳过。这就是为什么 React 19 中 `useState` 的 eager state 优化能减少不必要的渲染——它在 `dispatchSetState` 内部就做了 `Object.is` 比较。

## 3. 函数组件的处理：updateFunctionComponent

```javascript
// ReactFiberBeginWork.js（简化）

function updateFunctionComponent(current, workInProgress, Component, nextProps, renderLanes) {
  // 设置当前渲染的 Fiber 和 Lane
  // 让 hooks 能找到正确的 Fiber
  nextCurrentHook = current !== null ? current.memoizedState : null;

  // 调用 renderWithHooks 执行你的函数组件
  const nextChildren = renderWithHooks(
    current,
    workInProgress,
    Component,
    nextProps,
    renderLanes,
  );

  // 检查是否可以 bailout（函数执行后，didReceiveUpdate 仍为 false）
  if (current !== null && !didReceiveUpdate) {
    bailoutHooks(current, workInProgress, renderLanes);
    return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
    // → 跳过子树
  }

  // reconcileChildren：将返回的 Element 转为子 Fiber
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}
```

关键步骤：`renderWithHooks` 会真正调用你的函数组件函数，期间 React 会执行所有的 `useState`、`useEffect` 等[hooks](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)，获取 hooks 返回的值。

## 4. 类组件的处理：updateClassComponent

```javascript
// ReactFiberBeginWork.js + ReactFiberClassComponent.js（简化）

function updateClassComponent(current, workInProgress, Component, nextProps, renderLanes) {
  // 获取/创建类实例
  const instance = workInProgress.stateNode;
  if (instance === null) {
    // 首次渲染：创建实例
    constructClassInstance(workInProgress, Component, nextProps);
    mountClassInstance(workInProgress, Component, nextProps, renderLanes);
  } else if (current === null) {
    // 特殊情况：resume mount
    resumeMountClassInstance(workInProgress, Component, nextProps, renderLanes);
  } else {
    // 更新：处理 props 变化和生命周期
    updateClassInstance(current, workInProgress, Component, nextProps, renderLanes);
  }

  // 调用 render() 方法获取子 Element
  const nextChildren = instance.render();

  // reconcileChildren
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}
```

类组件比函数组件多了 instance 生命周期管理。

## 5. HostComponent 的处理：updateHostComponent

```javascript
function updateHostComponent(current, workInProgress, renderLanes) {
  // DOM 元素没有渲染函数
  // 直接把 pendingProps.children 传给 reconcileChildren
  const nextChildren = workInProgress.pendingProps.children;

  // 特殊处理：某些 host 元素需要特殊 context（如 <select>）
  const type = workInProgress.type;
  // ...

  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}
```

HostComponent 的 beginWork 非常简单——不需调用任何函数，直接处理 children。

## 6. 输入到输出的完整流程

```
beginWork 输入：
  current = 上一次渲染的 Fiber（含上一轮的 props/state/子 Fiber）
  workInProgress = 本次渲染的 Fiber（含新的 pendingProps）
  renderLanes = 本次渲染的 Lane 优先级

beginWork 执行流程（以函数组件为例）：

  1. bailout 检查
     moderate: 有alternate? memoizedProps===pendingProps? 有更新?
     no → 正常处理

  2. 准备 hooks 环境
     nextCurrentHook = current.memoizedState  ← 上一轮的 hooks 链表

  3. 调用函数组件
     renderWithHooks(current, workInProgress, Component, props, lanes)
       → 执行你的函数：const [count, setCount] = useState(0)
       → React 内部从 hooks 链表取出对应的 hook
       → 返回 count 的最新值
       → 函数返回 JSX（React Element 树）

  4. reconcileChildren
     将返回的 Element 与 current 的子 Fiber 比较
     → 复用/创建/删除子 Fiber
     → 设置 flags（Placement/Update/ChildDeletion）

  5. 返回
     workInProgress.child（第一个子 Fiber）
     → performUnitOfWork 将 workInProgress 设为 child
     → 下一轮循环处理子组件

beginWork 输出：
  子 Fiber（Fiber | null）
```

## 7. reconcileChildren：发生在 beginWork 中的 Diff

每个组件类型的处理函数最后都会调用 `reconcileChildren`。这是 Diff 算法入口，定义在 [`ReactChildFiber.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactChildFiber.js) 中：

```javascript
// packages/react-reconciler/src/ReactChildFiber.js（简化）

function reconcileChildren(current, workInProgress, nextChildren, renderLanes) {
  if (current === null) {
    // 首次渲染：没有 current → 全部是 mount
    workInProgress.child = mountChildFibers(workInProgress, null, nextChildren, renderLanes);
  } else {
    // 更新：有 current → 需要比较 old vs new
    workInProgress.child = reconcileChildFibers(workInProgress, current.child, nextChildren, renderLanes);
  }
}
```

`mountChildFibers` 和 `reconcileChildFibers` 几乎一样，区别是 mount 不会标记 Placement（批量在 completeWork 阶段处理），而 update 会逐个标记。

Diff 算法的详细分析见 **04-reconcile-children.md**。

## 下一步

- [completeWork 详解](/03-work-loop/03-complete-work) — completeWork 如何创建 DOM 节点
- [Diff 算法](/03-work-loop/04-reconcile-children) — Diff 算法详解
- [Commit 阶段](/03-work-loop/05-commit-phase) — Commit 阶段如何执行 DOM 操作

## 参考资料

- [Inside Fiber (Max Koretskyi) - General algorithm, beginWork](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — 最详细的 beginWork 分析
- [React 技术揭秘 - beginWork (卡颂)](https://react.iamkasong.com/render/beginWork.html) — 中文 beginWork 分析
- [React 源码 ReactFiberBeginWork.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js) — 官方源码
