---
title: "useTransition / useDeferredValue"
---



> 对应源码：[`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js), [`ReactStartTransition.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactStartTransition.js)

## 1. 紧急更新 vs 过渡更新

React 18 引入了区分更新优先级的能力，详见 [React v18.0 官方博文](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)：

```
紧急更新（Urgent）              过渡更新（Transition）
──────────────────────         ──────────────────────────
直接响应用户交互                 UI 从一个视图过渡到另一个视图
例：输入框文字、按钮点击          例：搜索结果、标签页切换
优先级：SyncLane /              优先级：TransitionLane（14个并发）
       InputContinuousLane
特点：必须立即响应，              特点：可以稍慢，用户不期望立即看到
      否则用户感觉卡顿                   可以被紧急更新中断
```

## 2. useTransition

```jsx
const [isPending, startTransition] = useTransition();

const handleChange = (e) => {
  // 紧急：立刻更新输入框
  setInputValue(e.target.value);

  // 过渡：稍后更新搜索结果
  startTransition(() => {
    setSearchQuery(e.target.value);
  });
};
```

### 内部实现

```javascript
// mountTransition 内部实现（ReactFiberHooks.js:3425）
function mountTransition() {
  // 注意：用的是 mountStateImpl（不创建 dispatch），不是 mountState！
  const stateHook = mountStateImpl(false);
  // 内部 startTransition 的签名与公共 API 完全不同：
  // 内部：startTransition(fiber, queue, pendingState, finishedState, callback, options)
  // 公共：startTransition(scope)
  const start = startTransition.bind(
    null,
    currentlyRenderingFiber,
    stateHook.queue,
    true,   // pendingState: isPending 设为 true
    false,  // finishedState: transition 结束后 isPending 设为 false
  );
  const hook = mountWorkInProgressHook();
  hook.memoizedState = start;
  return [false, start];  // mount 时 isPending 总是 false
}

// 内部 startTransition（ReactFiberHooks.js:3117）——不是 ReactStartTransition.js 中的公共 API！
function startTransition(fiber, queue, pendingState, finishedState, callback, options) {
  // 1. 提升 update priority 至少到 ContinuousEventPriority
  const previousPriority = getCurrentUpdatePriority();
  setCurrentUpdatePriority(higherEventPriority(previousPriority, ContinuousEventPriority));

  // 2. 设置 Transition 上下文（与公共 API 类似的逻辑）
  const prevTransition = ReactSharedInternals.T;
  ReactSharedInternals.T = { /* transition config */ };

  try {
    // 3. 乐观更新：先设置 pendingState（true）作为 TransitionLane 更新
    dispatchOptimisticSetState(fiber, false, queue, pendingState);
    // 4. 执行用户回调，里面的 setState 会被分配 TransitionLane
    callback();
  } finally {
    ReactSharedInternals.T = prevTransition;
    // 5. 恢复 update priority
    setCurrentUpdatePriority(previousPriority);
  }

  // 6. 过渡结束后设置 finishedState（false）
  //    通过 dispatchSetStateInternal 入队一个 thenable 或 finishedState
  //    实现乐观更新的回滚
  dispatchSetStateInternal(fiber, queue, finishedState, requestUpdateLane(fiber));
}
```

`startTransition` 的本质是设置一个全局的 Transition 上下文标记。在这个上下文中调用的 `setState`，会被分配 `TransitionLane` 而不是 `SyncLane`。

```
handleChange 执行流程：

  setInputValue(e.target.value)
    → dispatchSetState()
    → requestUpdateLane(fiber)
    → ReactSharedInternals.T === null（不在 transition 中）
    → 分配 InputContinuousLane（高优先级）

  startTransition(() => {
    setSearchQuery(e.target.value);
    → dispatchSetState()
    → requestUpdateLane(fiber)
    → ReactSharedInternals.T !== null（在 transition 中）
    → 分配 TransitionLane（低优先级）
  });

结果：输入框立刻更新（高优先级），
     搜索结果稍后更新（低优先级，可中断）
```

## 3. useDeferredValue

```jsx
const deferredQuery = useDeferredValue(searchQuery);
return <SearchResults query={deferredQuery} />;
```

`useDeferredValue` 接收一个值，返回一个"延迟"版本。当值变化时：

1. 立即渲染用旧值的结果（高优先级）
2. 在后台用新值渲染（低优先级）

```javascript
function updateDeferredValue<T>(value: T, initialValue?: T): T {
  const hook = updateWorkInProgressHook();
  // prevValue 来自上一轮渲染（alternate）的 memoizedState
  // 不是当前 wip hook 的状态——因为 wip 状态即将被更新
  const prevValue: T = currentHook.memoizedState;
  return updateDeferredValueImpl(hook, prevValue, value, initialValue);
}

function updateDeferredValueImpl(hook, prevValue, value) {
  // 如果值没变，直接返回（返回 value 不是 prevValue）
  if (is(value, prevValue)) {
    return value;
  }

  // 值变了
  // 1. 先用旧值渲染（高优先级）
  // 2. 安排用新值的低优先级更新
  const lane = requestDeferredLane();
  // ... 设置 hook.memoizedState 在低优先级渲染时才更新
}
```

## 4. 中断和恢复

[React 19 Concurrent Rendering Deep Dive](https://medium.com/@jsmanifest/react-19-concurrent-rendering-deep-dive-actions-transitions-and-suspense-in-production-0ae9199fa95f) 用生产场景演示了 Transition 被中断后恢复的完整流程，[React 技术揭秘](https://react.iamkasong.com/concurrent/interrupt.html) 则从源码层面解释了中断机制：

```
用户快速输入 "a", "ab", "abc" 的时间线：

  T=0: 输入 "a"
    → setInputValue("a") [紧急]
    → startTransition(() => setSearchQuery("a")) [过渡]
    → 紧急渲染完成（输入框显示 "a"）
    → 过渡渲染开始（用 "a" 搜索）

  T=5ms: 输入 "ab"（过渡渲染还在进行中）
    → setInputValue("ab") [紧急]
    → startTransition(() => setSearchQuery("ab")) [过渡]
    → 紧急渲染完成（输入框显示 "ab"）
    → 之前的 "a" 过渡渲染被中断！
    → 开始新的 "ab" 过渡渲染

  T=10ms: 输入 "abc"（"ab" 过渡还在进行中）
    → setInputValue("abc") [紧急]
    → startTransition(() => setSearchQuery("abc")) [过渡]
    → "ab" 过渡渲染被中断！
    → 开始 "abc" 过渡渲染

  T=15ms: 过渡渲染完成
    → 显示 "abc" 的搜索结果

  最终：输入框响应流畅，搜索结果只显示最终的 "abc"
        中间的 "a" 和 "ab" 搜索结果被丢弃
```

## 5. 14 个 TransitionLane 的意义

关于多个 Lane 的设计动机，[What are Lanes in React?](https://jser.dev/react/2022/03/26/lanes-in-react/) 做了深入分析：

```javascript
// 为什么有 14 个 TransitionLane？
// 为了让多个并发的 transition 更新互不干扰

场景：同时有 2 个 startTransition
  startTransition 1: setSearch("abc") → TransitionLane1
  startTransition 2: setFilter("new") → TransitionLane2

如果只有 1 个 TransitionLane：
  后来的更新会覆盖前一个的优先级信息

有多个 TransitionLane：
  两个更新可以独立存在，各自被处理或中断
```

## 下一步

- [并发渲染原理](/06-concurrent-features/01-concurrent-rendering) — 并发特性的完整分析
- [Scheduler 设计哲学](/05-scheduler/01-scheduler-design) — Scheduler 如何调度不同优先级的任务

## 参考资料

- [React v18.0 - Transitions (React 官方)](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)
- [React 19 Concurrent Rendering Deep Dive](https://medium.com/@jsmanifest/react-19-concurrent-rendering-deep-dive-actions-transitions-and-suspense-in-production-0ae9199fa95f)
- [React 技术揭秘 - Concurrent Mode (卡颂)](https://react.iamkasong.com/concurrent/interrupt.html)
- [React 源码 ReactFiberTransition.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberTransition.js)
