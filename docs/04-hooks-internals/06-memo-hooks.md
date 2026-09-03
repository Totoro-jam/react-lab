---
title: "useMemo / useCallback"
---



> 对应源码：[`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) — `mountMemo` / `updateMemo` / `mountCallback` / `updateCallback`

## 1. useMemo 的实现

```javascript
function mountMemo<T>(nextCreate: () => T, deps: Array<mixed> | void | null): T {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps];  // 存 [值, 依赖]
  return nextValue;
}

function updateMemo<T>(nextCreate: () => T, deps: Array<mixed> | void | null): T {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState;
  // 源码注释：Assume these are defined. If they're not, areHookInputsEqual will warn.
  if (nextDeps !== null) {
    const prevDeps = prevState[1];
    if (areHookInputsEqual(nextDeps, prevDeps)) {
      // 依赖没变 → 返回缓存的值
      return prevState[0];
    }
  }

  // 依赖变了 → 重新计算
  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}
```

`useMemo` 的 `memoizedState` 不是对象，而是一个 `[value, deps]` 数组。

## 2. useCallback 的实现

```javascript
function mountCallback<T>(callback: T, deps: Array<mixed> | void | null): T {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  hook.memoizedState = [callback, nextDeps];  // 存 [回调, 依赖]
  return callback;
}

function updateCallback<T>(callback: T, deps: Array<mixed> | void | null): T {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState;
  if (nextDeps !== null) {
    const prevDeps = prevState[1];
    if (areHookInputsEqual(nextDeps, prevDeps)) {
      return prevState[0]; // 返回缓存的函数引用
    }
  }
  hook.memoizedState = [callback, nextDeps];
  return callback;
}
```

**`useCallback(fn, deps)` 等价于 `useMemo(() => fn, deps)`**。两者唯一的区别是 `useMemo` 调用工厂函数，`useCallback` 直接存储函数。[React 官方文档](https://react.dev/reference/react/useMemo) 也强调了这一等价关系。

## 3. React Compiler 的角色

React 19 的 React Compiler 会在编译时自动插入 memoization，让 `useMemo`/`useCallback` 变得不必要。[I tried React Compiler today](https://www.developerway.com/posts/i-tried-react-compiler) 从实践角度评测了 Compiler 的效果：

```
编译前：                          编译后（Compiler 自动插入）：
function Component({ data }) {    function Component({ data }) {
  const value = expensiveCalc();   const $ = useMemoCache(4);  // 4 个槽：2 for value, 2 for onClick
  const onClick = () => {...};     value = $[0] === data ? $[1] : ($[0]=data, $[1]=expensiveCalc());
  return <Child v={value}          const onClick = $[2] === data ? $[3]
    onClick={onClick} />;                 : ($[2]=data, $[3]=()=>{...});
}                                  return <Child v={value} onClick={onClick} />;
                                  }
```

## 下一步

- [useTransition / useDeferredValue](/04-hooks-internals/07-concurrent-hooks) — useTransition/useDeferredValue
- [并发渲染原理](/06-concurrent-features/01-concurrent-rendering) — 并发特性的完整分析

## 参考资料

- [I tried React Compiler today (Nadia Makarevich)](https://www.developerway.com/posts/i-tried-react-compiler) — React Compiler 实测
- [React 官方文档 - useMemo](https://react.dev/reference/react/useMemo)
- [React Compiler Deep Dive (Sathya Gunasekaran)](https://www.youtube.com/watch?v=O8Pv6Z1JgTM)
