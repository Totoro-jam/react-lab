---
title: "useContext 与 Context 传播"
---



> 对应源码：[`ReactFiberNewContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberNewContext.js), [`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)

## 1. Context 的存储和传播机制

Context 不通过 hooks 链表存储状态——它通过 Fiber 树的 Context 栈传播。[React 官方文档](https://react.dev/reference/react/useContext) 说明了这个区别：

```
Context Provider（ContextProvider, tag=10）:
  在 beginWork 中 push 新的 context value
  在 completeWork 中 pop 恢复

Context Consumer:
  在 beginWork 中读取当前栈顶的 context value
```

## 2. ContextProvider 的 push/pop

```javascript
// ReactFiberBeginWork.js 中 updateContextProvider（简化）

function updateContextProvider(current, workInProgress, renderLanes) {
  // 注意：context 就是 workInProgress.type（因为 Context.Provider = Context）
  const context = workInProgress.type;
  const newProps = workInProgress.pendingProps;
  const newValue = newProps.value;

  // Push 新的 context value 到栈中（第一个参数是 fiber，后面是 context 和 value）
  pushProvider(workInProgress, context, newValue);

  // context 变化的检测不在 updateContextProvider 中——而是由 consumer
  // 在 beginWork 时检查 currentDependencies（已合并到 providers）来触发
  // propagateContextChange 实际上在用户的 setState/dispatch 路径中携带
  // 而非在 provider 的 beginWork 中调用
  const newChildren = newProps.children;
  reconcileChildren(current, workInProgress, newChildren, renderLanes);
  return workInProgress.child;
}
```

## 3. Context 变化的传播：Lazy Propagation

React 不在 Provider 的 beginWork 中主动通知所有 Consumer——它使用 **lazy propagation** 机制：

```
Provider push value ∈ updateContextProvider:
  → pushProvider(workInProgress, context, newValue)
  → 不主动遍历子树！

Consumer 的 beginWork（或 bailout 检查）:
  → lazilyPropagateParentContextChanges(current, workInProgress, renderLanes)
  → 向上遍历父节点，找出所有 ContextProvider 类型
  → 比较 current.memoizedProps.value vs pendingProps.value
  → 如果变了：标记消费此 Context 的子树 fiber.lanes |= renderLanes
  → 设置 fiber.flags |= DidPropagateContext（ReactFiberNewContext.js:511）
    标记"此子树已完成 context 传播"，避免兄弟节点重复传播
  → 触发重新渲染
```

Lazy propagation 的优势：Provider 不需要知道哪些子组件消费了它的值——消费者在 `beginWork` 或 bailout 检查时才主动向上查找变更的 Provider，只在必要时才触发更新。

这就是为什么 Context 变化能精确触发消费它的组件重新渲染——不是全树重渲染，而是只有标记了依赖的 Fiber 才被触发更新。

## 4. useContext Hook

```javascript
// [`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)（简化）
// ReactFiberHooks.js（简化）

function updateContext<T>(context, observedBits) {
  // 直接读取当前栈顶的 value
  const value = readContext(context);
  return value;
}
```

`useContext` 非常轻量——它不做任何 hooks 链表操作，直接调用 `readContext` 从 Context 栈读取当前值，同时注册依赖关系。

```javascript
function readContext<T>(context: ReactContext<T>): T {
  if (__DEV__) {
    if (isDisallowedContextReadInDEV) {
      console.error('Context can only be read while React is rendering...');
    }
  }
  // readContextForConsumer 会注册当前 Fiber 对此 context 的依赖
  return readContextForConsumer(currentlyRenderingFiber, context);
}
```

## 5. Context 与 React.memo 的交互

```
问题：如果 <Consumer> 被 React.memo 包裹，Context 变化能触发它重新渲染吗？

提示：[React 官方文档](https://react.dev/reference/react/useContext#optimizing-re-renders-with-memo-and-usecontext) 专门讨论了这一交互。

答案：能！

React.memo 只阻止 props 变化导致的重新渲染。
Context 变化是通过 propagateContextChange 直接标记 Fiber.lanes，
不经过 props 比较，所以 memo 拦不住。

这是 React 的设计：Context 变化总是触达 Consumer，无论中间有多少 memo。
```

## 下一步

- [useMemo / useCallback](/04-hooks-internals/06-memo-hooks) — useMemo/useCallback
- [beginWork 详解](/03-work-loop/02-begin-work) — beginWork 中如何处理 ContextProvider

## 参考资料

- [React 官方文档 - useContext](https://react.dev/reference/react/useContext)
- [React 技术揭秘 - Context (卡颂)](https://react.iamkasong.com/hooks/context.html)
