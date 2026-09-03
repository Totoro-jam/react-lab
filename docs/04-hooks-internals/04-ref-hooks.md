---
title: "useRef / useImperativeHandle"
---



> 对应源码：[`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) — `mountRef` / `updateRef` / `mountImperativeHandle`

## 1. useRef

`useRef` 是最简单的 Hook 之一。正如 [React 官方文档](https://react.dev/reference/react/useRef) 所述，它的 `memoizedState` 就是一个 `{ current: T }` 对象：

```javascript
function mountRef<T>(initialValue: T): RefObject<T> {
  const hook = mountWorkInProgressHook();
  const ref = { current: initialValue };
  hook.memoizedState = ref;
  return ref;
}

function updateRef<T>(initialValue: T): RefObject<T> {
  const hook = updateWorkInProgressHook();
  return hook.memoizedState; // 直接返回旧的 ref 对象！
}
```

关键点：**update 时直接返回旧的 ref 对象**，不做任何修改。`ref.current` 的修改是由用户代码直接完成的，[React 官方文档](https://react.dev/reference/react/useRef) 警告不要在渲染期间写入或读取 `ref.current`，React 不参与 ref 的变更追踪：

```
为什么 useRef 不会触发重新渲染？

  useRef 返回的对象引用在所有渲染中保持不变
  ref.current 的变化不会通知 React
  → 你修改 ref.current 就像修改一个普通对象的属性
  → React 不知道也不关心

  对比 useState:
  setState 是通过 dispatch 将更新放入队列
  → scheduleUpdateOnFiber 触发重新渲染
  → React 知道状态变了，会重新渲染
```

## 2. useRef 的 DOM 引用

当作为 `ref` 属性传给 HostComponent 时：

```jsx
const inputRef = useRef(null);
return <input ref={inputRef} />;
```

React 在 Commit 阶段处理 ref：

```
Commit mutation 阶段:
  → 如果 ref 变了：detach 旧 ref
  → ref.current = null

Commit layout 阶段:
  → 如果 ref 变了：attach 新 ref
  → ref.current = 实际 DOM 节点
```

这通过 `flags & Ref` 标记来触发。

## 3. useImperativeHandle

`useImperativeHandle` 被自定义组件暴露特定实例方法给父组件：

```jsx
const FancyInput = forwardRef((props, ref) => {
  const inputRef = useRef();
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current.focus(),
    clear: () => { inputRef.current.value = ''; }
  }));
  return <input ref={inputRef} />;
});
```

实现：

```javascript
// 实际调用链：mountImperativeHandle → mountEffectImpl → pushSimpleEffect
// 下面是关键逻辑简化

function mountImperativeHandle(ref, create, deps) {
  // ref 被追加到依赖数组中——ref 变化时也会重新执行
  const effectDeps = deps != null ? deps.concat([ref]) : null;
  // 实际的 create 不是用户传的，而是 imperativeHandleEffect
  // 它负责在 layout 阶段把 create() 的返回值赋给 ref.current
  mountEffectImpl(
    Update | LayoutStatic,   // fiberFlags: 在 fiber 上标记 Update 和 LayoutStatic
    HookLayout,               // hookFlags: layout 阶段同步执行
    imperativeHandleEffect.bind(null, create, ref),  // 包装后的创建函数
    effectDeps,
  );
}
// mountEffectImpl 内部会：
//   1. currentlyRenderingFiber.flags |= fiberFlags  // 标记 fiber
//   2. pushSimpleEffect(HookHasEffect | hookFlags, inst, create, deps)  // 存入 hooks 链表
```

本质上是 `useLayoutEffect` 的变体——在 layout 阶段把 `create()` 的返回值赋给 `ref.current`。

## 下一步

- [useContext 与 Context 传播](/04-hooks-internals/05-context-hooks) — useContext 与 Context 传播
- [副作用标记 Flags](/02-fiber-architecture/03-flags-effects) — Ref flag 的处理

## 参考资料

- [React 官方文档 - useRef](https://react.dev/reference/react/useRef)
- [React 源码 ReactFiberHooks.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)
