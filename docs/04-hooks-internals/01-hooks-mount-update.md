---
title: "Hooks 的 Mount 与 Update 机制"
---



> 对应源码：[`packages/react-reconciler/src/ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)

## 1. Hooks 的本质

你想过这个问题吗：函数组件没有 `this`，React 怎么知道 `useState` 对应的状态存在哪里？Dan Abramov 在 [Making Sense of React Hooks](https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889) 中提出了同样的疑问，这正是 Hooks 设计的起点。

答案：**Hooks 存储在 Fiber 节点的 `memoizedState` 字段上，以单链表形式组织。**

```
你写的代码：                           React 内部存储：

function Counter() {                  Fiber 节点 (tag: FunctionComponent)
  const [count, setCount] =             memoizedState: hook1 → hook2 → hook3 → null
    useState(0);
  const [name, setName] =               hook1 (useState)     hook2 (useState)     hook3 (useEffect)
    useState('Alice');                  memoizedState: 0     memoizedState: 'Alice'  memoizedState: Effect
  useEffect(() => {                    baseState: 0         baseState: 'Alice'      { tag, inst, create,
    document.title = count;             queue: {              queue: {                 deps:[0], next }
  }, [count]);                            pending: null,       pending: null,
  return <div>{count}</div>;              dispatch: fn,        dispatch: fn,
}                                         lastRendered-       lastRendered-
                                            Reducer,             Reducer,
                                          lastRendered-       lastRendered-
                                            State: 0             State: 'Alice'
                                        next: hook2 ▶       next: hook3 ▶          next: null
```

## 2. Hook 对象的数据结构

```javascript
// packages/react-reconciler/src/ReactFiberHooks.js:197-203

export type Hook = {
  memoizedState: any,      // 当前状态值（不同 hook 存不同类型）
  baseState: any,          // 基础状态（用于重新计算，处理并发更新）
  baseQueue: Update | null, // 基础更新队列
  queue: any,              // 更新队列（不同 hook 有不同结构）
  next: Hook | null,       // 指向下一个 hook
};
```

不同 Hook 在 `memoizedState` 和 `queue` 中存储不同内容：

```
useState:
  memoizedState: 当前状态值（如 0, 'Alice', {}）
  queue: UpdateQueue { pending: Update环形链表, lanes, dispatch, lastRenderedReducer, lastRenderedState }

useReducer:
  memoizedState: 当前状态
  queue: UpdateQueue { pending, lanes, dispatch, lastRenderedReducer, lastRenderedState }
  （useState 内部就是调用了 useReducer(basicStateReducer, initialState)）

useEffect/useLayoutEffect:
  memoizedState: Effect 对象 { tag, create, deps, inst, next }
  （inst 是 EffectInstance，inst.destroy 存储上次 create 返回的 cleanup 函数）
  queue: 不使用

useRef:
  memoizedState: { current: initialValue }
  queue: 不使用

useMemo/useCallback:
  memoizedState: [value, deps]  // 二元素数组
  queue: 不使用

useContext:
  memoizedState: 不使用（直接调用 readContext 从 Context 栈读取）
  queue: 不使用

useTransition:
  → 创建两个 hook！
  hook A (state): memoizedState = false(isPending), queue = UpdateQueue
  hook B (transition): memoizedState = startTransition 函数, queue = null

useSyncExternalStore:
  memoizedState: nextSnapshot(当前快照值)
  queue: StoreInstance { value, getSnapshot }  // 不是 UpdateQueue！

useOptimistic:
  memoizedState: 乐观状态值
  queue: UpdateQueue { pending, lanes, dispatch, lastRenderedReducer: null }
  （lastRenderedReducer = null → 故意禁用 Eager State 优化）
```

不同 Hook 的 `hook.memoizedState` 存储类型一览：

```
fiber.memoizedState
    │
    ▼
┌──────────────┐     ┌──────────────┐     ┌────────────────┐
│  hook #1     │────▶│  hook #2     │────▶│  hook #3       │────▶ null
│  useState    │     │  useEffect   │     │  useMemo       │
│              │     │              │     │                │
│ memoizedState│     │ memoizedState│     │ memoizedState  │
│  = 42        │     │  = Effect    │     │  = [val, deps] │
│              │     │    {tag,     │     │                │
│ queue        │     │     create, │     │ queue          │
│  = UpdateQ  │     │     deps,    │     │  = null        │
│    ↑         │     │     inst,   │     │                │
│    │ pending │     │     next}   │     │                │
│    │ = 环形  │     │              │     │                │
└──────────────┘     └──────────────┘     └────────────────┘
```

> 注意：`fiber.memoizedState` 指向 hooks 链表的头节点，而非某个具体值。值的具体类型取决于 Hook 类型——`useState` 存原始值/对象，`useEffect` 存 Effect 结构体，`useMemo` 存二元组，`useRef` 存 `{ current }` 引用对象。这正是"Rules of Hooks"要求调用顺序一致的原因：React 靠位置索引来匹配 `current.memoizedState` 链表节点和 `workInProgress` 新节点。

## 3. 两套 Dispatcher

React 通过 `dispatcher` 对象在 mount 和 update 时切换不同的 hooks 实现：

```javascript
// [`packages/react/src/ReactHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactHooks.js)（简化）
export function useState(initialState) {
  const dispatcher = resolveDispatcher();
  return dispatcher.useState(initialState);
}

// resolveDispatcher 返回的 dispatcher 在不同阶段不同：
// mount 时 → HooksDispatcherOnMount
// update 时 → HooksDispatcherOnUpdate
```

```
首次渲染（mount）时：
  resolveDispatcher() → HooksDispatcherOnMount
  HooksDispatcherOnMount.useState = mountState
  HooksDispatcherOnMount.useEffect = mountEffect
  HooksDispatcherOnMount.useRef = mountRef
  ...

后续更新（update）时：
  resolveDispatcher() → HooksDispatcherOnUpdate
  HooksDispatcherOnUpdate.useState = updateState
  HooksDispatcherOnUpdate.useEffect = updateEffect
  HooksDispatcherOnUpdate.useRef = updateRef
  ...
```

每个 Hook 有三个版本：`mountXxx`（首次 mount）、`updateXxx`（后续更新）、`rerenderXxx`（同一次渲染中 setState 后重新执行）。`useContext` 和 `use` 只有一个版本（mount 和 update 用同一函数，因为它们不依赖 hooks 链表的顺序匹配）。

## 4. mountWorkInProgressHook：创建新 Hook

```javascript
// packages/react-reconciler/src/ReactFiberHooks.js:983-1002

function mountWorkInProgressHook(): Hook {
  const hook: Hook = {
    memoizedState: null,
    baseState: null,
    baseQueue: null,
    queue: null,
    next: null,
  };

  if (workInProgressHook === null) {
    // 这是第一个 hook → 挂到 Fiber 的 memoizedState
    currentlyRenderingFiber.memoizedState = workInProgressHook = hook;
  } else {
    // 不是第一个 → 追加到链表末尾
    workInProgressHook = workInProgressHook.next = hook;
  }
  return workInProgressHook;
}
```

```
首次渲染执行 useState(0) → useState('Alice') → useEffect() 时的链表构建：

1. useState(0):
   mountWorkInProgressHook()
   → hook1 = { memoizedState: 0, next: null }
   → Fiber.memoizedState = hook1
   → workInProgressHook = hook1

2. useState('Alice'):
   mountWorkInProgressHook()
   → hook2 = { memoizedState: 'Alice', next: null }
   → hook1.next = hook2
   → workInProgressHook = hook2

3. useEffect(fn, [deps]):
   mountWorkInProgressHook()
   → hook3 = { memoizedState: Effect, next: null }
   → hook2.next = hook3
   → workInProgressHook = hook3

最终链表: hook1 → hook2 → hook3 → null
         挂在 Fiber.memoizedState 上
```

## 5. updateWorkInProgressHook：复用 Hook

```javascript
// packages/react-reconciler/src/ReactFiberHooks.js:1004-1072

function updateWorkInProgressHook(): Hook {
  let nextCurrentHook: null | Hook;
  if (currentHook === null) {
    // 第一次调用 update hook
    // 从 current Fiber 的 memoizedState 取
    const current = currentlyRenderingFiber.alternate;
    if (current !== null) {
      nextCurrentHook = current.memoizedState;
    } else {
      nextCurrentHook = null;
    }
  } else {
    // 后续调用，取 next
    nextCurrentHook = currentHook.next;
  }

  let nextWorkInProgressHook: null | Hook;
  if (workInProgressHook === null) {
    nextWorkInProgressHook = currentlyRenderingFiber.memoizedState;
  } else {
    nextWorkInProgressHook = workInProgressHook.next;
  }

  if (nextWorkInProgressHook !== null) {
    // === 情况 1：已有 WIP hook（render phase update 导致的重新渲染）===
    // 直接复用，不创建新对象
    workInProgressHook = nextWorkInProgressHook;
    nextWorkInProgressHook = workInProgressHook.next;
    currentHook = nextCurrentHook;
  } else if (nextCurrentHook === null) {
    // === 情况 2：没有 current hook ===
    // 调用的 hook 比上次多 → 违反 Rules of Hooks
    throw new Error('Rendered more hooks than during the previous render.');
  } else {
    // === 情况 3：从 current hook 克隆 ===
    // 常规更新路径
    currentHook = nextCurrentHook;

    const newHook: Hook = {
      memoizedState: currentHook.memoizedState,
      baseState: currentHook.baseState,
      baseQueue: currentHook.baseQueue,
      queue: currentHook.queue,
      next: null,
    };

    if (workInProgressHook === null) {
      currentlyRenderingFiber.memoizedState = workInProgressHook = newHook;
    } else {
      workInProgressHook = workInProgressHook.next = newHook;
    }
  }
  return workInProgressHook;
}
```

```
更新渲染时的 hook 链表复用：

current Fiber:               workInProgress Fiber:
  memoizedState: hook1         memoizedState: null（待构建）
    → hook2 → hook3 → null

调用 useState(0) → updateWorkInProgressHook():
  → currentHook = hook1（从 current 取）
  → newHook = clone(hook1)
  → workInProgress.memoizedState = newHook1

调用 useState('Alice') → updateWorkInProgressHook():
  → currentHook = hook1.next = hook2
  → newHook = clone(hook2)
  → newHook1.next = newHook2

调用 useEffect(...) → updateWorkInProgressHook():
  → currentHook = hook2.next = hook3
  → newHook = clone(hook3)
  → newHook2.next = newHook3
```

**复用而非重新创建**——这是关键。它保证了 hook 的 state 在多次渲染间持久存在。

## 6. "Rules of Hooks" 的根源

为什么 Hooks 必须在顶层调用，不能在条件/循环中？正如 [Under the hood of React's hooks system](https://the-guild.dev/blog/react-hooks-system) 中分析的那样，根源在于 hooks 的链表匹配机制：

```
规则：不要在条件、循环、嵌套函数中调用 Hooks

原因：React 靠调用顺序来匹配 hook 和 state

首次渲染（mount）：
  if (condition) {
    useState(0);   // hook1
  }
  useState('Alice'); // hook2（如果 condition=true）或 hook1

更新渲染（update）：
  current Fiber 的链表: [hook1(0), hook2('Alice')]
  
  if (condition === false) {
    // 跳过了 useState(0)
  }
  useState('Alice');
    → updateWorkInProgressHook()
    → 取 currentHook = hook1（本应是 useState(0) 的！）
    → 返回了 0 而不是 'Alice'
    → 状态错乱！

Hook 顺序必须每次渲染一致，否则链表匹配会错位。
```

## 7. renderWithHooks：设置 Dispatcher

```javascript
// [`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) 中的 renderWithHooks（简化）

function renderWithHooks(current, workInProgress, Component, props, secondArg, nextRenderLanes) {
  renderLanes = nextRenderLanes;
  currentlyRenderingFiber = workInProgress;
  workInProgress.memoizedState = null;
  workInProgress.updateQueue = null;
  workInProgress.lanes = NoLanes;

  // 根据 current 是否存在，选择 mount 还是 update 的 dispatcher
  if (current === null || current.memoizedState === null) {
    // mount（current 不存在 或 current 没有 hooks—例如首次渲染或无 stateful hooks）
    ReactSharedInternals.H = HooksDispatcherOnMount;
  } else {
    // update
    ReactSharedInternals.H = HooksDispatcherOnUpdate;
  }

  // 执行你的函数组件
  let children = Component(props, secondArg);

  // 重置 dispatcher（非渲染期间调用 hook 会报错）
  ReactSharedInternals.H = ContextOnlyDispatcher;
  renderLanes = NoLanes;
  currentlyRenderingFiber = null;
  currentHook = null;
  workInProgressHook = null;

  return children;
}
```

`ReactSharedInternals.H` 就是 `resolveDispatcher()` 返回的对象。在非渲染期间被设置为 `ContextOnlyDispatcher`，调用任何 hook 都会报错 "Hooks can only be called inside the body of a function component"。

## 下一步

- [useState / useReducer](/04-hooks-internals/02-state-hooks) — useState/useReducer 的更新队列和状态计算
- [useEffect / useLayoutEffect](/04-hooks-internals/03-effect-hooks) — useEffect/useLayoutEffect 的调度和执行
- [useRef / useImperativeHandle](/04-hooks-internals/04-ref-hooks) — useRef 的实现
- [useContext 与 Context 传播](/04-hooks-internals/05-context-hooks) — useContext 的实现
- [useMemo / useCallback](/04-hooks-internals/06-memo-hooks) — useMemo/useCallback 的实现
- [useTransition / useDeferredValue](/04-hooks-internals/07-concurrent-hooks) — useTransition/useDeferredValue

## 参考资料

- [Under the hood of React's hooks system (Eytan Manor)](https://the-guild.dev/blog/react-hooks-system) — Hooks 系统源码分析
- [Making Sense of React Hooks (Dan Abramov)](https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889) — Hooks 设计动机
- [A journey through the implementation of useState (Carl Mungazi)](https://www.newline.co/@CarlMungazi/a-journey-through-the-usestate-hook--a4983397) — useState 源码深入
- [React 技术揭秘 - Hooks (卡颂)](https://react.iamkasong.com/hooks/intro.html) — 中文 Hooks 分析
- [React 源码 ReactFiberHooks.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) — 官方源码
