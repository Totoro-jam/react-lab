---
title: "React 19 新 Hooks 内部机制"
---


> 对应源码：[`packages/react-reconciler/src/ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)（行号引用基于当前源码）

## 从一个用户体验问题说起

你点了"点赞"按钮，等待了 1 秒——什么都没发生。你的手指不由自主地又点了一下，心里想"是不是卡了？"然后突然两个赞同时出现了。

这种体验很常见。React 19 的回答是一组新 Hooks，它们的共同目标是：**让异步操作感觉是同步的**。

但这些 Hooks 在内部到底做了什么？让我们从源码层面拆解。

---

## useOptimistic：临时"覆盖"状态

### 你以为它是什么

```jsx
const [optimisticCount, addOptimistic] = useOptimistic(count);
// addOptimistic(1) → 立刻显示 count+1
// transition 结束后自动恢复到真实 count
```

看起来像 `useState`——一个值加一个 setter。但它内部完全不同。

### 源码实现

```javascript
// packages/react-reconciler/src/ReactFiberHooks.js:1974-1997

function mountOptimistic<S, A>(
  passthrough: S,           // 真实状态（value prop）
  reducer: ?(S, A) => S,    // 可选的 reducer
): [S, (A) => void] {
  const hook = mountWorkInProgressHook();
  hook.memoizedState = hook.baseState = passthrough;
  const queue: UpdateQueue<S, A> = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    // ← 关键：不使用 Eager State 优化
    lastRenderedReducer: null,
    lastRenderedState: null,
  };
  hook.queue = queue;
  // ← 和普通 setState 不同
  // 注意第二个参数 true（isOptimistic 标记）
  const dispatch = dispatchOptimisticSetState.bind(
    null,
    currentlyRenderingFiber,
    true,                   // ← isOptimistic: true
    queue,
  );
  queue.dispatch = dispatch;
  return [passthrough, dispatch];
}
```

等一下——`lastRenderedReducer: null`？useState 的是 `basicStateReducer`。useOptimistic 故意禁用了 Eager State 优化（即"如果新值和旧值相同就跳过"的优化），因为乐观更新即使值可能"相同"也需要被处理。

### updateOptimisticImpl：每次都重新基于 passthrough

```javascript
// ReactFiberHooks.js:2013-2031

function updateOptimisticImpl(hook, current, passthrough, reducer) {
  // ← 关键差异：每次渲染都把 baseState 重置为 passthrough
  hook.baseState = passthrough;

  // 没传 reducer 就用 useState 的 basicStateReducer
  const resolvedReducer =
    typeof reducer === 'function' ? reducer : basicStateReducer;

  // 实际处理复用 updateReducerImpl——和 useReducer 共用一套逻辑遍历 pending
  return updateReducerImpl(hook, current, resolvedReducer);
}
```

这里的关键设计：

```
useState 的 baseState 不变，更新累积在上面
useOptimistic 的 baseState 每次都重置为 passthrough（真实值）

所以：
  T=0: count=0, addOptimistic(1) → optimisticCount=1
  T=1: count 仍然是 0，但 transition 还没结束
       passthrough=0, pending=[+1]
       optimisticCount = 0 + 1 = 1（仍然显示 1）

  T=2: API 返回，setCount(1)
       passthrough=1, pending=[] (transition 结束后清空)
       optimisticCount = 1（和真实值一致了！）

  如果 API 失败：
  T=2: setCount 不执行，count 仍然是 0
       passthrough=0, pending=[] (transition 结束)
       optimisticCount = 0（回滚到真实值）
```

乐观更新只是"暂时叠加在真实状态上的一层"。transition 结束后这层自动消失，露出的就是真实状态。

### dispatchOptimisticSetState：绑定到 Transition

useOptimistic 的 dispatch 函数内部检查是否在 Transition 中：

```javascript
// 如果不在 Transition 内调用 addOptimistic()，
// React 会记录开发模式警告
// 因为乐观更新只有在可中断的 transition 中才有意义
```

这就是为什么所有文档都说"在 `startTransition` 中调用 `addOptimistic`"——不在 Transition 内，乐观更新没有清理机制。

---

## useActionState：带副作用的 Reducer

### 与 useReducer 的关系

```javascript
// useReducer：reducer 必须是纯函数
const [state, dispatch] = useReducer(reducer, initial);
// reducer: (state, action) => newState  ← 不能有副作用

// useActionState：reducerAction 可以有副作用
const [state, dispatch, isPending] = useActionState(reducerAction, initial);
// reducerAction: async (prevState, payload) => newState  ← 可以 await API
```

### 源码：两个 Hook 组合

useActionState 内部实际上使用了**三个 hook**——一个 reducer hook 管理状态、一个 state hook 管理 `isPending`、第三个 hook 管理 action queue（用于 dispatch 函数）：

```javascript
// ReactFiberHooks.js:2481-2537

function updateActionStateImpl(stateHook, currentStateHook, action, initialState, permalink) {
  // Hook 1：用 actionStateReducer 处理状态
  const [actionResult] = updateReducerImpl(
    stateHook,
    currentStateHook,
    actionStateReducer,  // 特殊的 reducer（只是 return newState）
  );

  // Hook 2：用 useState 管理 isPending
  const [isPending] = updateState(false);
  // isPending 会在 action 执行期间为 true

  // actionResult 可能是值也可能是 Thenable（async action 时）
  // 如果是 Thenable → useThenable → 挂起渲染直到 resolve

  // Hook 3：action queue（管理 dispatch 函数）
  const actionQueueHook = updateWorkInProgressHook();
  const dispatch = actionQueueHook.queue.dispatch;

  return [state, dispatch, isPending];
}
```

### actionStateReducer：处理异步结果

```javascript
// ReactFiberHooks.js（actionStateReducer 简化）

function actionStateReducer(state, action) {
  // action 是 reducerAction 的返回值
  // 如果 reducerAction 是 async 函数，返回的是 Thenable
  // React 会处理 Thenable → 暂停渲染 → resolve 后继续
  return action;
}
```

### 队列机制：串行执行

useActionState 的 dispatch 被多次调用时，**串行执行**——每次等前一个完成才开始下一个：

```
dispatch(A) → reducerAction(state, A) → 等待...
  → 完成，返回 newState1
  → dispatch(B) → reducerAction(newState1, B) → 等待...
    → 完成，返回 newState2
```

这是因为每次调用的 `prevState` 是前一次的返回值——React 必须等前一个 action 完成才能开始下一个。

### permalink 和 SSR 水合

```javascript
// ReactFiberHooks.js:2386-2395
if (getIsHydrating()) {
  const root = getWorkInProgressRoot();
  const ssrFormState = root.formState;
  if (ssrFormState !== null) {
    // 尝试匹配 SSR 表单状态标记
    const isMatching = tryToClaimNextHydratableFormMarkerInstance(
      currentlyRenderingFiber,
    );
    // 如果匹配，用 SSR 返回的状态替代 initialState
  }
}
```

当服务端使用 Server Actions 处理表单提交时，返回的 HTML 中包含了表单状态标记。`useActionState` 在水合时会尝试匹配这些标记，确保用户在 JS 加载之前提交表单时也能看到正确的状态。

---

## useSyncExternalStore：防止 Tearing

### 什么是 Tearing

```
并发渲染中：
  组件 A 从外部 store 读取 → 得到值 5
  ... React 暂停渲染（时间片用完）...
  外部 store 更新了 → 值变成 6
  ... React 恢复渲染 ...
  组件 B 从外部 store 读取 → 得到值 6

  结果：同一次渲染中，组件 A 看到 5，组件 B 看到 6
        UI "撕裂"了——不一致！
```

### 源码：每次渲染都同步读取

```javascript
// ReactFiberHooks.js:1739-1780

function updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
  const hook = updateWorkInProgressHook();

  // ← 关键：每次渲染都从 store 同步读取快照
  // 这违反了 React 的"纯渲染"原则
  // 但只对外部 store 这样做——因为 store 总是同步更新的
  let nextSnapshot;
  const isHydrating = getIsHydrating();
  if (isHydrating) {
    // SSR 水合时用 getServerSnapshot
    nextSnapshot = getServerSnapshot();
  } else {
    nextSnapshot = getSnapshot();
  }

  // 检查是否与上次快照相同
  const prevSnapshot = hook.memoizedState;
  if (!is(prevSnapshot, nextSnapshot)) {
    // 值变了 → 触发更新
    // 但这里不是"入队更新"，而是直接返回新值
    // React 会在渲染完成后重新检查一致性
  }

  // 注册订阅
  // 如果 subscribe 函数变了，重新订阅
  // ...

  hook.memoizedState = nextSnapshot;
  return nextSnapshot;
}
```

### Tearing 防护机制

React 如何防止 tearing？关键在于 `pushStoreConsistencyCheck`：

```
渲染开始时：
  → pushStoreConsistencyCheck(fiber, getSnapshot, nextSnapshot)
  → 记录本次渲染的 store 快照

渲染暂停后恢复时：
  → 检查 store 是否变了
  → 如果变了 → 丢弃当前渲染，从头开始！
  → 这就是 "Sync" 的含义：强制与外部 store 同步
```

这就是为什么 `getSnapshot` 必须返回稳定引用——React 会用 `Object.is` 比较新旧快照。如果你每次返回一个新对象（`{ ...state }`），React 会认为 store 变了，触发无限重渲染。

### 与 useState 的区别

```
useState：
  → 状态在 Fiber 的 hook 链表上
  → React 完全控制
  → 不会 tearing（因为 React 自己管理一致性）

useSyncExternalStore：
  → 状态在外部 store 上
  → React 不控制更新时机
  → 每次 render 同步读 + 渲染后一致性检查
  → 如果不一致 → 丢弃重渲染
```

---

## use()：在渲染中 await Promise

### use 不是普通 Hook

`use()` 是一个特殊的"Hook"——它可以在条件和循环中调用，而其他 Hooks 不行：

```jsx
// 这是合法的！
if (data === null) {
  data = use(fetchData());
}
// 其他 hook 不能这么写
```

### 源码：根据类型分发

```javascript
// ReactFiberHooks.js:1159-1179

function use<T>(usable: Usable<T>): T {
  if (usable !== null && typeof usable === 'object') {
    if (typeof usable.then === 'function') {
      // 是 Promise/Thenable → 与 Suspense 配合
      const thenable: Thenable<T> = usable;
      return useThenable(thenable);
    } else if (usable.$$typeof === REACT_RECOVERABLE_TYPE) {
      // 可恢复的错误 → 继续渲染（跳过这个 subtree 的恢复逻辑）
      return undefined;
    } else if (usable.$$typeof === REACT_CONTEXT_TYPE) {
      // 是 Context → 直接读取
      const context: ReactContext<T> = usable;
      return readContext(context);
    }
  }
  throw new Error('An unsupported type was passed to use(): ' + String(usable));
}
```

`use()` 可以接受三种类型：

- **Promise/Thenable** → 挂起渲染，等 Promise resolve
- **REACT_RECOVERABLE_TYPE** → 可恢复错误，继续渲染
- **Context** → 读取当前 Context 值（替代 `useContext`，但可以在条件中调用）

### useThenable：与 Suspense 的桥梁

```javascript
// ReactFiberHooks.js:1098-1145

function useThenable<T>(thenable: Thenable<T>): T {
  // 记录 thenable 在当前 fiber 中的位置
  const index = thenableIndexCounter;
  thenableIndexCounter += 1;

  // trackUsedThenable 做了什么：
  // 1. 检查这个 thenable 是否已经被 track 过
  // 2. 如果还没 resolve → throw 这个 thenable
  //    → React 捕获 → 找到最近的 Suspense → 显示 fallback
  //    → Promise resolve 后 → 重新渲染
  // 3. 如果已 resolve → 返回结果值
  const result = trackUsedThenable(
    thenableState,
    thenable,
    index,
    currentlyRenderingFiber,
  );

  return result;
}
```

`trackUsedThenable` 是连接 `use()` 和 Suspense 的桥梁。它的核心逻辑：

```
第一次调用 use(promise)：
  promise 还没 resolve
  → throw promise
  → React 捕获到 throw
  → 找到最近的 Suspense 边界
  → 渲染 fallback
  → 注册 promise.then(callback)
  → callback 触发后重新渲染

重新渲染时调用 use(promise)：
  promise 已 resolve
  → trackUsedThenable 返回 resolved value
  → 组件正常完成渲染
```

### 为什么 use() 可以在条件中调用

其他 Hooks 依赖调用顺序匹配链表节点。但 `use()` 处理 Thenable 时用的是 `thenableIndexCounter`——一个独立于 hooks 链表的计数器。React 通过 thenable 的位置索引来追踪它，不依赖条件式的链表顺序。

但这也意味着：同一个 `use()` 调用在多次渲染中可能传入不同的 Promise，React 需要正确处理这种变化。`trackUsedThenable` 内部做了完整的匹配和回退逻辑。

### render 阶段和 replay

```javascript
// ReactFiberHooks.js:1112-1130（注释简化）
// When something suspends with `use`, we replay the component with the
// "re-render" dispatcher instead of the "mount" or "update" dispatcher.
//
// But if there are additional hooks that occur after the `use` invocation
// that suspended, they wouldn't have been processed during the previous
// attempt. So after we invoke `use` again, we may need to switch from the
// "re-render" dispatcher back to the "mount" or "update" dispatcher.
```

当 `use()` 挂起后恢复时，React 使用 "replay" dispatcher 重新执行组件函数。这个 dispatcher 会跳过 `use()` 之前的已处理 hooks，直接从 `use()` 处继续。之后如果还有更多 hooks，会切换回正常的 mount/update dispatcher。

这是一个相当复杂的内部状态机——相当于"从上次中断的地方继续执行函数"，而 JavaScript 本身不支持这个能力（除非用 generator）。React 通过 hooks 计数器和 dispatcher 切换模拟了这个效果。

---

## 四个 Hook 的对比总结

| 特性 | useOptimistic | useActionState | useSyncExternalStore | use() |
| ------ | -------------- | ---------------- | ---------------------- | ------- |
| 状态来源 | 真实值 + 临时叠加 | async action 返回值 | 外部 store | Promise / Context |
| 可中断 | 是（Transition 内） | 否（串行执行） | 否（同步读取） | 是（Suspense 配合） |
| 何时恢复/同步 | Transition 结束后 | action 完成后 | 每次渲染同步检查 | Promise resolve 后 |
| Tearing 防护 | 不需要 | 不需要 | 需要（一致性检查） | 不需要 |
| 适用场景 | 表单提交乐观更新 | Server Actions 表单 | redux/zustand 等外部 store | 数据加载、Context 读取 |
| 内部机制 | baseState 每次 reset | 两个 Hook 组合 | 每次 render 同步读 + pushStoreConsistencyCheck | thenableIndexCounter + trackUsedThenable |
| Eager State | 禁用（lastRenderedReducer=null） | 不适用 | 不适用 | 不适用 |

**共性**：这四个 Hook 都不使用传统的 `useMemo` + `deps` 模式，而是引入了更强大的机制（Transition 绑定、异步串行、一致性检查、Promise 挂起），代表了 React 状态管理的进化方向。

## 下一步

- [Suspense 机制](/06-concurrent-features/02-suspense) — Suspense 如何捕获 throw 的 Promise
- [Hooks 的 Mount 与 Update 机制](/04-hooks-internals/01-hooks-mount-update) — Hooks 链表的基础结构
- [useState / useReducer](/04-hooks-internals/02-state-hooks) — useState 的 Eager State 优化（useOptimistic 故意禁用了它）

## 参考资料

- [useActionState (React 官方文档)](https://react.dev/reference/react/useActionState) — 官方 API 文档，包含 queuing 机制和错误处理详细说明
- [useOptimistic (React 官方文档)](https://react.dev/reference/react/useOptimistic) — 官方 API 文档
- [useSyncExternalStore (React 官方文档)](https://react.dev/reference/react/useSyncExternalStore) — 官方 API 文档
- [use (React 官方文档)](https://react.dev/reference/react/use) — 官方 API 文档
- [How does useOptimistic() work internally in React? (JSer.dev)](https://jser.dev/2024-03-20-how-does-useoptimisticwork-internally-in-react/) — useOptimistic 源码级分析，包含交互式 demo
- [How useSyncExternalStore() works internally in React? (JSer.dev)](https://jser.dev/2023-08-02-usesyncexternalstore/) — useSyncExternalStore 源码级分析
- [useSyncExternalStore: Demystified (Kent C. Dodds)](https://www.epicreact.dev/use-sync-external-store-demystified-for-practical-react-development-w5ac0) — tearing 问题和最佳实践详细解释
- [React 19 use() Hook Deep Dive](https://dev.to/a1guy/react-19-use-hook-deep-dive-using-promises-directly-in-your-components-1plp) — use() 与 Suspense 配合的完整分析
- [React Docs Refresh: useActionState and useOptimistic (Aurora Scharff)](https://certificates.dev/blog/react-docs-refresh-useactionstate-and-useoptimistic) — 2026 年文档更新说明，涵盖 queuing、cancellation、error handling
- [React 19: What's New for Developers (Scrimba)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — React 19 全部新特性概览（含 19.0-19.2 更新历史）
- [The Guide to New Hooks in React 19 (Telerik)](https://www.telerik.com/blogs/guide-new-hooks-react-19) — useActionState/useFormStatus/useOptimistic 实战指南
- [React 19 useOptimistic Hook Breakdown (DThompsonDev)](https://dev.to/dthompsondev/react-19-useoptimistic-hook-breakdown-5g9k) — 实际场景演示
- [What is Tearing in React Concurrent Mode (Medium)](https://medium.com/@wul55267/what-is-tearing-in-react-concurrent-mode-41de1b597678) — tearing 问题图解
- [useSyncExternalStore — The Hook You Didn't Know You Needed (DEV)](https://dev.to/mehta0007/usesyncexternalstore-the-react-hook-you-didnt-know-you-needed-34mp) — 从问题到解决方案的完整分析
- [React 源码 ReactFiberHooks.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) — 官方源码
- [useMutableSource → useSyncExternalStore (React 18 WG)](https://github.com/reactwg/react-18/discussions/86) — 从 useMutableSource 演进到 useSyncExternalStore 的设计讨论
- [Deep Dive into React 19's Latest Hooks (Medium)](https://medium.com/@rohitkuwar/deep-dive-into-react-19s-latest-hooks-use-useactionstate-useoptimistic-and-useformstatus-849395af9c11) — use/useActionState/useOptimistic/useFormStatus 深度分析
