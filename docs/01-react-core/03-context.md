---
title: "Context 创建与传播"
---


> 对应源码：[`packages/react/src/ReactContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactContext.js)

## 1. [createContext](https://react.dev/reference/react/createContext)

```javascript
// packages/react/src/ReactContext.js（简化）

export function createContext<T>(defaultValue: T): ReactContext<T> {
  const context: ReactContext<T> = {
    $$typeof: REACT_CONTEXT_TYPE,
    _currentValue: defaultValue,
    _currentValue2: defaultValue,
    _threadCount: 0,
    Provider: (null: any),
    Consumer: (null: any),
  };

  // Provider 就是 context 自身（不是单独的对象）
  context.Provider = context;
  // Consumer 是一个单独的对象
  context.Consumer = {
    $$typeof: REACT_CONSUMER_TYPE,
    _context: context,
  };

  return context;
}
```

注意：在当前源码中，`Provider` 直接指向 `context` 自身（`context.Provider = context`），而不是像旧版 React 那样创建一个带 `REACT_PROVIDER_TYPE` 的单独对象。这意味着 `<Context.Provider>` 和 `<Context>` 在 JSX 中是等效的。

Context 对象本身携带 `$$typeof: REACT_CONTEXT_TYPE` 标记，Reconciler 通过检查 Fiber 的 `type` 来区分它是一个 Provider 还是一个 Consumer。

## 2. 传播机制

```
Context 的 value 变化流程：

1. <Context.Provider value={newValue}>
   → beginWork 中 updateContextProvider
   → pushProvider(workInProgress, context, newValue)
     → context._currentValue = newValue（push 到 context 栈）

2. Lazy Propagation（不是主动遍历子树！）
   Provider 的 beginWork 只 push value + reconcileChildren
   不主动通知 Consumer

   Consumer 的 beginWork 时（或 bailout 检查时）：
   → lazilyPropagateParentContextChanges(current, workInProgress, renderLanes)
   → 向上遍历父节点，找到 ContextProvider 类型
   → 比较 current.memoizedProps.value vs pendingProps.value
   → 如果变了 → 标记消费此 context 的子树 fiber.lanes |= renderLanes

3. 消费的组件重新渲染：
   → useContext(context)
   → readContext(context) → 读取 context._currentValue

4. completeWork 中 popProvider
   → 恢复 context._currentValue 为父 Provider 的值
```

Context 的值传播通过"栈"实现：Provider push 值，Consumer 读栈顶值，Provider 在 [completeWork](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCompleteWork.js) 时 pop。传播机制本身是 **lazy** 的——Consumer 在自己的 beginWork 时主动向上查找变更的 Provider，而非 Provider 主动向下通知。

## 3. 为什么 Context 变化绕过 React.memo

[React.memo](https://react.dev/reference/react/memo) 只阻止 props 变化的重渲染。Context 变化通过 lazy propagation 机制直接修改消费 Fiber 的 `fiber.lanes`，不走 props 比较路径，因此 memo 无法拦截。更多细节可参考[卡颂的 React 技术揭秘 - Context](https://react.iamkasong.com/hooks/context.html)。

## 下一步

- [useContext 与 Context 传播](/04-hooks-internals/05-context-hooks) — useContext 的底层实现
- [useState / useReducer](/04-hooks-internals/02-state-hooks) — 状态 Hook 的源码分析
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — Fiber 的 memoizedState 和 dependencies

## 参考资料

- [React 官方文档 - createContext](https://react.dev/reference/react/createContext)
- [React 技术揭秘 - Context (卡颂)](https://react.iamkasong.com/hooks/context.html)
