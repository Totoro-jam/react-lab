---
title: "Hooks API 全景"
---


> 对应源码：[`packages/react/src/ReactHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactHooks.js)

## 1. Hooks API 的转发机制

所有 Hooks 在 `react` 包中都是薄转发——通过 `resolveDispatcher()` 获取当前 dispatcher，委托调用。关于这种设计背后的动机，Dan Abramov 在 [Making Sense of React Hooks](https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889) 中做了深入阐述：

```javascript
// packages/react/src/ReactHooks.js（简化）

export function useState(initialState) {
  const dispatcher = resolveDispatcher();
  return dispatcher.useState(initialState);
}

export function useEffect(create, deps) {
  const dispatcher = resolveDispatcher();
  return dispatcher.useEffect(create, deps);
}

export function useRef(initialValue) {
  const dispatcher = resolveDispatcher();
  return dispatcher.useRef(initialValue);
}

function resolveDispatcher() {
  const dispatcher = ReactSharedInternals.H;
  if (__DEV__) {
    if (dispatcher === null) {
      // 在开发模式下记录警告（不抛出，为了保持热路径性能）
      console.error('Invalid hook call. Hooks can only be called inside the body of a function component.');
    }
  }
  // 生产模式下如果 dispatcher 为 null，后续 `.useState(...)` 调用会自然抛出 TypeError
  return dispatcher;
}
```

`ReactSharedInternals.H` 在不同阶段被设置为不同的 dispatcher（mount/update/noop）。想了解 Hooks 调用链的完整追踪，可以参考 [Under the hood of React's hooks system](https://the-guild.dev/blog/react-hooks-system)一文。

完整的 Hooks API 可以在 [React 官方文档](https://react.dev/reference/react) 查阅。

## 2. 完整 Hooks 清单

| Hook | 用途 | 源码位置 |
| ------ | ------ | --------- |
| `useState` | 状态管理 | Mount: `mountState`, Update: `updateState` |
| `useReducer` | 复杂状态管理 | Mount: `mountReducer`, Update: `updateReducer` |
| `useEffect` | 副作用（异步） | Mount: `mountEffect`, Update: `updateEffect` |
| `useLayoutEffect` | 副作用（同步） | Mount: `mountLayoutEffect`, Update: `updateLayoutEffect` |
| `useInsertionEffect` | CSS-in-JS 注入 | Mount: `mountInsertionEffect`, Update: `updateInsertionEffect` |
| `useRef` | 可变引用 | Mount: `mountRef`, Update: `updateRef` |
| `useContext` | Context 消费 | Mount/Update: `readContext`（不分 mount/update） |
| `useMemo` | 值缓存 | Mount: `mountMemo`, Update: `updateMemo` |
| `useCallback` | 函数缓存 | Mount: `mountCallback`, Update: `updateCallback` |
| `useImperativeHandle` | ref 方法暴露 | Mount: `mountImperativeHandle`, Update: `updateImperativeHandle` |
| `useTransition` | 过渡更新 | Mount: `mountTransition`, Update: `updateTransition` |
| `useDeferredValue` | 延迟值 | Mount: `mountDeferredValue`, Update: `updateDeferredValue` |
| `useId` | 唯一 ID 生成 | Mount: `mountId`, Update: `updateId` |
| `useSyncExternalStore` | 外部状态同步 | Mount: `mountSyncExternalStore`, Update: `updateSyncExternalStore` |
| `useOptimistic` | 乐观更新 | Mount: `mountOptimistic`, Update: `updateOptimistic` |
| `useActionState` | Action 状态 | Mount: `mountActionState`, Update: `updateActionState` |
| `useFormStatus` | 表单状态（react-dom） | 通过 `useHostTransitionStatus` 实现（在 `react-dom-bindings` 提供，非 reconciler 内部） |
| `use` | Promise/Context 读取 | 在 dispatcher 上（推荐 mount/update 都使用同一 `use` 函数） |

## 3. Hook 分类

```
状态类：useState, useReducer, useOptimistic
副作用类：useEffect, useLayoutEffect, useInsertionEffect
引用类：useRef, useImperativeHandle
缓存类：useMemo, useCallback
Context类：useContext, use
并发类：useTransition, useDeferredValue
工具类：useId, useDebugValue
外部集成类：useSyncExternalStore
Action类：useActionState, useFormStatus
```

## 4. Hooks 的调用规则

```
规则 1：只在顶层调用
  ✗ if (condition) { useState(0); }
  ✓ const [val] = useState(0);
  原因：Hooks 靠调用顺序匹配链表节点

规则 2：只在函数组件或自定义 Hook 中调用
  ✗ function helper() { useState(0); }
  ✓ function useCustom() { useState(0); }
  原因：resolveDispatcher 依赖渲染上下文
```

## 下一步

- [Context](/01-react-core/03-context) — Context 的实现机制
- [Hooks 的 Mount 与 Update 机制](/04-hooks-internals/01-hooks-mount-update) — Hooks 底层实现链路
- [useState / useReducer](/04-hooks-internals/02-state-hooks) — 状态 Hook 的源码分析

## 参考资料

- [Making Sense of React Hooks (Dan Abramov)](https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889)
- [Under the hood of React's hooks system (Eytan Manor)](https://the-guild.dev/blog/react-hooks-system)
- [React Hooks API Reference (官方)](https://react.dev/reference/react)
