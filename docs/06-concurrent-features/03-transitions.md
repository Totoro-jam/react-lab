---
title: "过渡更新（Transitions）"
---



> 对应源码：[ReactStartTransition.js](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactStartTransition.js), [ReactFiberTransition.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberTransition.js)

## 1. 紧急 vs 过渡

> [React v18.0 博客](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)首次正式引入了 Transition 概念，将更新区分为紧急和过渡两类。

```
紧急更新（不能延迟）：
  输入框文字、按钮点击反馈、拖拽位置
  → 必须在几毫秒内反映到 UI
  → SyncLane / InputContinuousLane

过渡更新（可以延迟）：
  搜索结果、列表过滤、页面切换
  → 用户不期望立刻看到
  → TransitionLanes
  → 可以被紧急更新打断
```

## 2. startTransition 的机制

```javascript
function startTransition(scope) {
  const prevTransition = ReactSharedInternals.T;
  ReactSharedInternals.T = {};
  try {
    scope();
  } finally {
    ReactSharedInternals.T = prevTransition;
  }
}
```

`ReactSharedInternals.T` 是全局 Transition 上下文（定义在 [ReactStartTransition.js](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactStartTransition.js) 中）。在 `dispatchSetState` 中，`requestUpdateLane` 会检查这个上下文：

```
requestUpdateLane(fiber):
  if (ReactSharedInternals.T !== null) {
    // 在 transition 中 → 分配 TransitionLane
    return requestTransitionLane();
  } else {
    // 不在 transition 中 → 根据 event 类型分配
    return requestEventLane();
  }
```

## 3. useTransition 的 isPending

> [useTransition 官方文档](https://react.dev/reference/react/useTransition)详细介绍了 API 用法。

```jsx
const [isPending, startTransition] = useTransition();

startTransition(() => {
  setSearchQuery(value);  // 这个 state 更新是低优先级的
});
// isPending 在过渡渲染期间为 true
```

`isPending` 通过一个内部 `useState` 实现。从源码角度看，`mountTransition` 使用的是 `mountStateImpl`（内部实现，不直接暴露 dispatch）：

```javascript
function mountTransition() {
  // 用 mountStateImpl 而非 mountState——不需要 expose dispatch 给用户
  const stateHook = mountStateImpl(false);
  // 内部 startTransition 的签名：(fiber, queue, pendingState, finishedState, callback)
  // 它会在 transition 开始时 dispatch pendingState(true)，结束后 dispatch finishedState(false)
  const start = startTransition.bind(
    null,
    currentlyRenderingFiber,
    stateHook.queue,
    true,   // transition 开始 → isPending = true
    false,  // transition 结束 → isPending = false
  );
  // hook.memoizedState 存储 start 函数（不变，跨渲染复用）
  const hook = mountWorkInProgressHook();
  hook.memoizedState = start;
  return [false, start];  // mount 时 isPending = false
}
```

## 4. React 19 的 async transition

React 19 支持 [async 函数在 transition](https://react.dev/reference/react/useTransition) 中：

```jsx
startTransition(async () => {
  await fetchNewData();   // 等待异步操作
  setPage(data);          // 更新状态
});
```

异步 transition 在 await 期间保持低优先级，不会阻塞用户交互。

## 下一步

- [useTransition / useDeferredValue](/04-hooks-internals/07-concurrent-hooks) — useTransition/useDeferredValue 的 Hook 实现
- [自动批量更新](/06-concurrent-features/04-batching) — 批量更新

## 参考资料

- [React v18.0 - Transitions](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)
- [React 19 - useTransition async](https://react.dev/reference/react/useTransition)
