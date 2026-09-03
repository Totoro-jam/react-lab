---
title: "外部状态同步：useSyncExternalStore 与 Tearing 防护"
---


> 对应源码：[`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) (`mountSyncExternalStore`, `updateSyncExternalStore`), [`ReactFiberWorkLoop.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js) (`isRenderConsistentWithExternalStores`)

## 1. 什么是 Tearing

Tearing（撕裂）是并发渲染引入的一个问题：当 React 正在渲染一棵组件树时，并发渲染允许**中断和恢复**。如果渲染过程中途某个外部 store 的值变了，那么树的**不同部分可能读到不同的快照**。

```
无 tearing（同步渲染）：
  开始渲染 → 组件 A 读 store: "hello" → 组件 B 读 store: "hello" → 完成
  → A 和 B 看到同一个值 ✓

有 tearing（并发渲染）：
  开始渲染 → 组件 A 读 store: "hello" → 中断
  中断期间，store 被外部修改为 "world"
  恢复渲染 → 组件 B 读 store: "world" → 完成
  → A 看到 "hello"，B 看到 "world" → UI 不一致！✗
```

[React 18 Working Group #70: Concurrent React for Library Maintainers](https://github.com/reactwg/react-18/discussions/70) 详细解释了这个问题。

## 2. useSyncExternalStore 的设计

[Epic React: useSyncExternalStore Demystified](https://www.epicreact.dev/use-sync-external-store-demystified-for-practical-react-development-w5ac0) 中 Kent C. Dodds 总结了 useSyncExternalStore 的设计目标：

```
三个参数：
  subscribe(callback)         → 订阅外部 store 变化
  getSnapshot()                → 获取当前快照（同步、纯函数）
  getServerSnapshot?()         → SSR 时的初始快照（可选）

两个核心保证：
  1. 同步读取：所有组件在一次渲染中读到的快照一致
  2. 自动重订阅：subscribe 函数变化时自动重新订阅
```

## 3. 源码实现

### 3.1 mountSyncExternalStore

```javascript
// packages/react-reconciler/src/ReactFiberHooks.js:1648-1737

function mountSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
  const fiber = currentlyRenderingFiber;
  const hook = mountWorkInProgressHook();

  let nextSnapshot;
  const isHydrating = getIsHydrating();
  if (isHydrating) {
    // SSR 水合中：使用 getServerSnapshot
    nextSnapshot = getServerSnapshot();
  } else {
    nextSnapshot = getSnapshot();  // 同步读取当前快照

    // ['★ 关键：调度一致性检查']
    // 如果不在 blocking lane（即并发渲染），push 一致性检查
    const rootRenderLanes = getWorkInProgressRootRenderLanes();
    if (!includesBlockingLane(rootRenderLanes)) {
      pushStoreConsistencyCheck(fiber, getSnapshot, nextSnapshot);
    }
  }

  hook.memoizedState = nextSnapshot;
  const inst = { value: nextSnapshot, getSnapshot };
  hook.queue = inst;

  // 订阅外部 store（通过 useEffect）
  mountEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [subscribe]);
  // 更新 mutable instance 字段
  fiber.flags |= PassiveEffect;
  pushSimpleEffect(
    HookHasEffect | HookPassive,
    createEffectInstance(),
    updateStoreInstance.bind(null, fiber, inst, nextSnapshot, getSnapshot),
    null,
  );

  return nextSnapshot;
}
```

### 3.2 updateSyncExternalStore

```javascript
// packages/react-reconciler/src/ReactFiberHooks.js:1739-1810

function updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
  const fiber = currentlyRenderingFiber;
  const hook = updateWorkInProgressHook();

  let nextSnapshot;
  if (isHydrating) {
    nextSnapshot = getServerSnapshot();
  } else {
    // ['★ 同步读取：在每次 render 都调用 getSnapshot()']
    nextSnapshot = getSnapshot();
  }

  const prevSnapshot = (currentHook || hook).memoizedState;
  const snapshotChanged = !is(prevSnapshot, nextSnapshot);
  if (snapshotChanged) {
    hook.memoizedState = nextSnapshot;
    markWorkInProgressReceivedUpdate();
  }

  const inst = hook.queue;
  // 更新订阅 effect
  updateEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [subscribe]);
  
  // 检查 store 是否在 render 期间被修改
  const storeChanged = inst.getSnapshot !== getSnapshot || snapshotChanged ||
    (workInProgressHook !== null &&
      (workInProgressHook.memoizedState.tag & HookHasEffect) !== HookNoFlags);

  // ['★ 每次都 push effect（即使没变化），确保 Activity 重现时重新检查']
  pushSimpleEffect(
    storeChanged ? HookHasEffect | HookPassive : HookPassive,
    createEffectInstance(),
    updateStoreInstance.bind(null, fiber, inst, nextSnapshot, getSnapshot),
    null,
  );

  // ['★ 一致性检查：仅在 storeChanged 时才调度']
  if (storeChanged) {
    fiber.flags |= PassiveEffect;
    if (!isHydrating && !includesBlockingLane(renderLanes)) {
      pushStoreConsistencyCheck(fiber, getSnapshot, nextSnapshot);
    }
  }

  return nextSnapshot;
}
```

### 3.3 pushStoreConsistencyCheck

```javascript
// ReactFiberHooks.js:1835-1858

function pushStoreConsistencyCheck(fiber, getSnapshot, renderedSnapshot) {
  // ['★ 设置 StoreConsistency flag → commit 阶段会检查']
  fiber.flags |= StoreConsistency;
  const check = { getSnapshot, value: renderedSnapshot };
  
  // 加入 fiber.updateQueue.stores 数组
  let componentUpdateQueue = currentlyRenderingFiber.updateQueue;
  if (componentUpdateQueue === null) {
    componentUpdateQueue = createFunctionComponentUpdateQueue();
    currentlyRenderingFiber.updateQueue = componentUpdateQueue;
    componentUpdateQueue.stores = [check];
  } else {
    const stores = componentUpdateQueue.stores;
    if (stores === null) {
      componentUpdateQueue.stores = [check];
    } else {
      stores.push(check);
    }
  }
}
```

### 3.4 isRenderConsistentWithExternalStores：commit 阶段的一致性验证

```javascript
// ReactFiberWorkLoop.js:1703-1760（简化）

// 在 commit 之前遍历 Fiber 树，检查是否有 tearing

function isRenderConsistentWithExternalStores(finishedWork) {
  let node = finishedWork;
  while (true) {
    // ['★ 检查每个有 StoreConsistency flag 的 Fiber']
    if (node.flags & StoreConsistency) {
      const updateQueue = node.updateQueue;
      if (updateQueue !== null) {
        const checks = updateQueue.stores;
        if (checks !== null) {
          for (let i = 0; i < checks.length; i++) {
            const check = checks[i];
            const getSnapshot = check.getSnapshot;
            const renderedValue = check.value;
            // ['★ 再次调用 getSnapshot，与 render 时的快照对比']
            if (!is(getSnapshot(), renderedValue)) {
              // 不一致 → tearing 检测到！
              // 返回 false → React 会重新渲染
              return false;
            }
          }
        }
      }
    }
    // 使用 subtreeFlags 优化：跳过无 StoreConsistency 的子树
    const child = node.child;
    if (node.subtreeFlags & StoreConsistency && child !== null) {
      child.return = node;
      node = child;
      continue;
    }
    // ...遍历兄弟和父节点...
  }
  return true;  // 全部一致 ✓
}
```

## 4. Tearing 防护机制全景

```
Render 阶段：
  1. mountSyncExternalStore / updateSyncExternalStore 调用
  2. getSnapshot() → 得到 snapshot（如 "hello"）
  3. snapshot 存入 hook.memoizedState
  4. pushStoreConsistencyCheck(fiber, getSnapshot, "hello")
     → fiber.flags |= StoreConsistency
     → fiber.updateQueue.stores.push({getSnapshot, value: "hello"})

可能的中断（并发渲染）：
  React 暂停渲染 → 外部 store 被修改 ("hello" → "world")
  → React 恢复渲染 → 另一个组件的 mountSyncExternalStore
  → getSnapshot() 返回 "world"（新值）
  → 这个组件看到 "world"

Commit 前：
  isRenderConsistentWithExternalStores 遍历树
  → Fiber A 的 check: getSnapshot() → "world" ≠ "hello"（render 时的值）
  → 检测到 tearing → return false

React 响应：
  从 tearing 检测点重新渲染整个树
  → 所有组件重新调用 getSnapshot() → 都得到 "world"
  → commit → UI 一致
```

## 5. SSR 中的一致性

`getServerSnapshot` 是 SSR 必须的：

```
服务端渲染：
  组件调用 useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  → 没有客户端 store → 使用 getServerSnapshot() 返回默认值
  → HTML 中渲染的是默认值

客户端水合：
  React hydrate → 组件再次调用 useSyncExternalStore
  → getIsHydrating() 返回 true → 仍然使用 getServerSnapshot()
  → 保证水合时与服务端一致（避免 hydration mismatch）
  
  水合完成后：
  → 正常 getSnapshot() → 得到客户端实际状态
```

## 6. 与 Activity 的配合

```javascript
// updateSyncExternalStore 中有一段关键注释：
// "Even if nothing changed during this render, we push the effect so it is
// always in the effect list. That way it re-runs whenever the passive
// effects are reconnected, like when a hidden Activity tree is shown again.
// While the tree was hidden we were not subscribed to the store, so
// mutations during that window notified nobody.
// When nothing changed, the effect is pushed without the HasEffect tag."

pushSimpleEffect(
  storeChanged ? HookHasEffect | HookPassive : HookPassive,
  // [storeChanged 时加 HasEffect，没变化时不加 → commit 跳过]
  ...
);
```

这段设计说明：即使 store 没变，每次 render 都 push effect（但不加 `HasEffect`）。目的是：当 `<Activity>` 隐藏的子树重新显示时，passive effects 会重新连接——即使 store 没变也会重新 subscribe，防止隐藏期间漏掉的 store 变更。

## 7. 生态中的使用

useSyncExternalStore 是**状态管理库的基石**：

| 库 | 使用方式 |
| ---- | --------- |
| Redux (`useSelector`) | 内部通过 `useSyncExternalStore` 订阅 store |
| Zustand | `useStore` 内部调用 `useSyncExternalStore` |
| Jotai | `useAtom` 内部调用 `useSyncExternalStore` |
| Valtio | 基于 Proxy + `useSyncExternalStore` |
| React Router | 内部状态同步通过 `useSyncExternalStore` |

[React 18 Working Group #70](https://github.com/reactwg/react-18/discussions/70) 是给库维护者的官方指南，强调了三个函数（`subscribe`、`getSnapshot`、`getServerSnapshot`）的正确实现方式。

## 8. 最佳实践陷阱

### `getSnapshot` 引用稳定性

```javascript
// ✗ 错误：每次返回新对象 → Object.is 比较失败 → 无限渲染
function getSnapshot() {
  return { items: [...store.items] };  // 每次新数组
}

// ✓ 正确：返回稳定引用
let cachedSnapshot = null;
let cachedItems = store.items;
function getSnapshot() {
  if (cachedItems !== store.items) {  // only recache when changed
    cachedItems = store.items;
    cachedSnapshot = { items: store.items };
  }
  return cachedSnapshot;
}
```

详见 [Epic React: useSyncExternalStore Demystified](https://www.epicreact.dev/use-sync-external-store-demystified-for-practical-react-development-w5ac0) 中的 "How do I avoid infinite loops" 部分。

### `subscribe` 引用稳定性

```javascript
// ✗ 错误：每次 render 创建新函数 → 不断 re-subscribe
function App({ storeId }) {
  const subscribe = (callback) => store.subscribe(callback);
  // ↑ 新函数实例 → useSyncExternalStore 每次 re-subscribe
  const value = useSyncExternalStore(subscribe, ...);
  return ...;
}

// ✓ 正确：module-scope 定义
const subscribe = (callback) => store.subscribe(callback);
function App() {
  const value = useSyncExternalStore(subscribe, ...);
  return ...;
}
// 如果 subscribe 依赖 props，用 useCallback:
const subscribe = useCallback((cb) => store.subscribe(id, cb), [id]);
```

## 下一步

- [useMemo / useCallback](/04-hooks-internals/06-memo-hooks) — useMemo/useCallback 与手动优化（vs React Compiler）
- [useTransition / useDeferredValue](/04-hooks-internals/07-concurrent-hooks) — 并发相关 hooks
- [关键设计决策](/00-overview/06-design-decisions) — Hooks 设计决策的 why
- [并发渲染原理](/06-concurrent-features/01-concurrent-rendering) — 并发渲染如何允许中断和恢复

## 参考资料

- [useSyncExternalStore Demystified (Epic React by Kent C. Dodds)](https://www.epicreact.dev/use-sync-external-store-demystified-for-practical-react-development-w5ac0) — ★ 最全面的实战指南，含 8 个常见 FAQ
- [Concurrent React for Library Maintainers #70 (React WG)](https://github.com/reactwg/react-18/discussions/70) — ★ 官方给库维护者的并发渲染指南
- [React v18.0 Blog (官方)](https://react.dev/blog/2022/03/29/react-v18) — useSyncExternalStore 随 18 稳定
- [React useSyncExternalStore 官方文档](https://react.dev/reference/react/useSyncExternalStore) — 官方 API 文档
- [RFC: Migrate to useSyncExternalStore (Jotai #3170)](https://github.com/pmndrs/jotai/discussions/3170) — 实际迁移经验
- [Avoid tearing in React with useSyncExternalStore (Reddit)](https://www.reddit.com/r/reactjs/comments/1mp24qq/avoid_tearing_in_react_with_usesyncexternalstore/) — 社区讨论
- [Understanding useSyncExternalStore (Medium)](https://medium.com/@dwell_the/understanding-usesyncexternalstore-c06618a32d61) — tearing 问题解释
- [Source ReactFiberHooks.js GitHub](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) — mountSyncExternalStore / updateSyncExternalStore / pushStoreConsistencyCheck
- [Source ReactFiberWorkLoop.js GitHub](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js) — isRenderConsistentWithExternalStores 实现
- [Source ReactFiberFlags.js GitHub](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberFlags.js) — StoreConsistency flag 定义
