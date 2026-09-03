---
title: "useState / useReducer 源码分析"
---



> 对应源码：[`ReactFiberHooks.js:1920-2050`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)

## 1. useState 的 mount

```javascript
// [ReactFiberHooks.js:1920](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)
function mountStateImpl<S>(initialState: (() => S) | S): Hook {
  const hook = mountWorkInProgressHook();
  if (typeof initialState === 'function') {
    // 惰性初始化：initialState 是函数时先调用
    initialState = initialState();
  }
  hook.memoizedState = hook.baseState = initialState;
  const queue: UpdateQueue = {
    pending: null,           // 待处理更新的环形链表
    lanes: NoLanes,          // 关联的优先级
    dispatch: null,          // setState 函数
    lastRenderedReducer: basicStateReducer, // 上次使用的 reducer
    lastRenderedState: initialState,        // 上次渲染的状态
  };
  hook.queue = queue;
  return hook;
}

// [ReactFiberHooks.js:1948](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)
function mountState<S>(initialState) {
  const hook = mountStateImpl(initialState);
  const queue = hook.queue;
  // 创建 dispatch 函数（就是你用的 setState）
  const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
  queue.dispatch = dispatch;
  return [hook.memoizedState, dispatch];
}
```

`basicStateReducer` 非常简单——这就是为什么 `setState(1)` 和 `setState(prev => prev + 1)` 都能用：

```javascript
function basicStateReducer<S>(state: S, action: BasicStateAction<S>): S {
  return typeof action === 'function' ? action(state) : action;
}
// setState(1)       → action=1    → return 1
// setState(s=>s+1)  → action=fn   → return fn(state)
```

## 2. dispatchSetState：你调用 setState 时发生了什么

`dispatchSetState` 是理解 React 状态更新的关键入口，[A journey through the implementation of useState](https://www.newline.co/@CarlMungazi/a-journey-through-the-usestate-hook--a4983397) 对它做了逐行分析：

```javascript
// [ReactFiberHooks.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)（简化）
// dispatchSetState 是外部入口，内部委托给 dispatchSetStateInternal

function dispatchSetStateInternal(fiber, queue, action, lane) {
  // 创建 Update 对象
  const update: Update = {
    lane,
    revertLane: NoLane,          // 用于乐观更新回滚
    gesture: null,               // 手势关联（React 19.2+）
    action,
    hasEagerState: false,       // 是否有预计算的 eagerState
    eagerState: null,           // 预计算结果
    next: null,
  };

  if (isRenderPhaseUpdate(fiber)) {
    // 渲染阶段更新：走不同的路径
    enqueueRenderPhaseUpdate(queue, update);
    return false;
  }

  // === Eager State 优化 ===
  // 如果当前没有其他待处理更新，立刻预计算新状态
  const alternate = fiber.alternate;
  if (
    fiber.lanes === NoLanes &&
    (alternate === null || alternate.lanes === NoLanes)
  ) {
    const lastRenderedReducer = queue.lastRenderedReducer;
    if (lastRenderedReducer !== null) {
      // useOptimistic 设 lastRenderedReducer = null → 故意跳过 Eager State
      const currentState = queue.lastRenderedState;
      const eagerState = lastRenderedReducer(currentState, action);
      update.hasEagerState = true;
      update.eagerState = eagerState;
      if (is(eagerState, currentState)) {
        // 新状态和旧状态相同（Object.is）→ 直接跳过调度
        enqueueConcurrentHookUpdateAndEagerlyBailout(fiber, queue, update);
        return false;
      }
    }
  }

  // 入队（环形链表）并触发调度
  const root = enqueueConcurrentHookUpdate(fiber, queue, update, lane);
  if (root !== null) {
    scheduleUpdateOnFiber(root, fiber, lane);
    entangleTransitionUpdate(root, queue, lane);
    return true;
  }
  return false;
}
```

Eager State 优化的效果：`setState(sameValue)` 不会触发重新渲染。

```
  const [count, setCount] = useState(0);

  setCount(0); // count 已经是 0
  → eagerState = 0
  → is(0, 0) === true
  → return（不调度，不重新渲染）
```

## 3. Update 环形链表

useState 的更新队列是一个**环形链表**。实际的入队逻辑在 `ReactFiberConcurrentUpdates.js` 的 `finishQueueingConcurrentUpdates` 中：

```
queue.pending 初始状态: null

第一次 setState(1):
  pending = queue.pending = null
  → pending === null → update1.next = update1（自环）
  → queue.pending = update1

  结果：pending → update1 → (回到 update1)
                ▲ (pending 指向最新的)

第二次 setState(2):
  pending = queue.pending = update1
  → update2.next = pending.next = update1（新 update 指向最旧的）
  → pending.next = update2（旧的最新的 next 指向新的）
  → queue.pending = update2

  结果：pending → update2 → update1 → (回到 update2)
                       ▲ (pending 指向最新的)

遍历顺序（从 pending.next 开始，即从最旧的到最新的）：
  update1 → update2 → (回到起点)

queue.pending 始终指向最新插入的 update
queue.pending.next 指向最旧的（队列头部）
```

## 4. updateState：处理更新队列

```javascript
// 注：updateState 实际委托给 updateReducer(basicStateReducer, initialState)
// 下面是 updateReducerImpl 的核心逻辑简化版

function updateReducerImpl(hook, current, reducer) {
  const queue = hook.queue;
  // 1. 取出环形链表中的所有 pending updates
  // queue.pending 指向最后一个 update，pending.next 指向第一个
  const pendingQueue = queue.pending;
  if (pendingQueue !== null) {
    // 合并 pendingQueue 和已有的 baseQueue
    // ...
    queue.pending = null;  // 清空 pending
  }
  // 2. 遍历环形链表，逐个处理 update
  let newState = hook.baseState;
  let update = baseQueue.next;  // 第一个 update
  do {
    const action = update.action;
    if (update.hasEagerState) {
      newState = update.eagerState;  // 用预计算结果
    } else {
      newState = reducer(newState, action);  // 用 reducer 计算
    }
    update = update.next;
  } while (update !== baseQueue.next);  // 环形：循环回起点结束

  hook.memoizedState = newState;
  queue.lastRenderedState = newState;

  return [hook.memoizedState, dispatch];
}
```

## 5. useReducer 与 useState 的关系

`useState` 本质上是 `useReducer` 的特例：

```javascript
// useState 等价于：
const [state, dispatch] = useReducer(basicStateReducer, initialState);

// basicStateReducer:
function basicStateReducer(state, action) {
  return typeof action === 'function' ? action(state) : action;
}
```

`useReducer` 的 mount 实现：

```javascript
function mountReducer<S, A>(reducer, initialArg, init) {
  const hook = mountWorkInProgressHook();
  let initialState;
  if (init !== undefined) {
    initialState = init(initialArg);
  } else {
    initialState = (initialArg: any);
  }
  hook.memoizedState = hook.baseState = initialState;
  const queue = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: reducer,  // 注意：这里是传入的 reducer（useState 用 basicStateReducer）
    lastRenderedState: initialState,
  };
  hook.queue = queue;
  // 注意：useReducer 用 dispatchReducerAction，不是 dispatchSetState！
  // dispatchReducerAction 与 dispatchSetState 的关键区别：
  //   - dispatchReducerAction 不做 Eager State 优化（因为不能假设 reducer 纯函数返回相同值）
  //   - dispatchSetState 委托给 dispatchSetStateInternal，后者有 Eager State 检查
  const dispatch = dispatchReducerAction.bind(null, currentlyRenderingFiber, queue);
  queue.dispatch = dispatch;
  return [hook.memoizedState, dispatch];
}
```

## 6. 并发更新中的 baseState

`baseState` 和 `baseQueue` 用于处理**被中断的并发更新**。正如 [React 技术揭秘](https://react.iamkasong.com/hooks/state.html) 中所解释的，并发场景下 `baseState` 充当了状态回退点：

```
场景：用户快速操作，有高优先级和低优先级更新交替

1. 初始 state = 0
2. 低优先级: setState(s => s + 1)  → TransitionLane
3. 低优先级: setState(s => s + 1)  → TransitionLane
4. 高优先级: setState(s => s + 2)  → SyncLane

高优先级先执行:
  → 处理 SyncLane: state = 0 + 2 = 2
  → 低优先级的更新被跳过，存入 baseQueue
  → baseState = 2, baseQueue = [fn+1, fn+1]

低优先级恢复时:
  → 从 baseState = 2 开始
  → 处理 baseQueue: 2 + 1 = 3, 3 + 1 = 4
  → 最终 state = 4
```

## 下一步

- [useEffect / useLayoutEffect](/04-hooks-internals/03-effect-hooks) — useEffect/useLayoutEffect 机制
- [自动批量更新](/06-concurrent-features/04-batching) — 多个 setState 如何批量处理

## 参考资料

- [A journey through the implementation of useState (Carl Mungazi)](https://www.newline.co/@CarlMungazi/a-journey-through-the-usestate-hook--a4983397)
- [React 技术揭秘 - useState 与 useReducer (卡颂)](https://react.iamkasong.com/hooks/state.html)
- [React 源码 ReactFiberHooks.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)
