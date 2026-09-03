---
title: "实践练习：手写 mini-react"
---


> 目标：从零实现一个支持 JSX、Fiber、Diff、Hooks 的迷你 React

## 1. 项目目标

通过手写 200 行代码的 mini-react，深入理解 React 的核心机制。练习完成后，你将理解：

- JSX 如何编译为 element 对象
- Fiber 链表如何替代递归
- 工作循环如何实现可中断渲染
- Diff 算法如何比较新旧树
- Hooks 如何基于链表工作

## 2. 实现步骤

### Step 1: createElement

```javascript
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map(child =>
        typeof child === 'object' ? child : createTextElement(child)
      ),
    },
  };
}

function createTextElement(text) {
  return { type: 'TEXT_ELEMENT', props: { nodeValue: text, children: [] } };
}
```

### Step 2: render + workLoop

实现 requestIdleCallback 驱动的工作循环。设置 `nextUnitOfWork` 指针，在每个空闲回调中处理一个 Fiber。

### Step 3: Fibers

将递归的 render 改为基于 Fiber 链表的遍历。每个 Fiber 有 `child`、`sibling`、`return` 指针。`performUnitOfWork` 处理当前 Fiber 并返回下一个。

### Step 4: Render and Commit Phases

将 DOM 操作从 performUnitOfWork 中移出，改为在所有 Fiber 处理完后一次性 commit（避免中间状态可见）。

### Step 5: Reconciliation

保存上一次 commit 的 Fiber 树（`currentRoot`），在 reconcileChildren 中对比新旧 Fiber，标记 `PLACEMENT`/`UPDATE`/`DELETION`。

### Step 6: Function Components

支持函数组件的渲染——调用函数获取 children，注意函数组件没有 DOM 节点。

### Step 7: Hooks

实现 `useState`：

- mount 时创建 hook 节点，挂到 Fiber 的 `memoizedState` 链表
- update 时遍历链表，返回对应的状态
- `setState` 创建 update，触发重新渲染

## 3. 验证

实现完成后，用以下代码测试：

```jsx
/** @jsx Didact.createElement */
function Counter() {
  const [count, setCount] = Didact.useState(0);
  return (
    <div>
      <h1>Count: {count}</h1>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  );
}

const root = Didact.createRoot(document.getElementById('root'));
root.render(<Counter />);
```

## 4. 完整实现参考

完整代码约 200 行，参考 [Build your own React](https://pomb.us/build-your-own-react/) 中的每一步说明。

源码中也可参考 `packages/react-noop-renderer/`，它是一个不操作真实 DOM 的精简 Reconciler 实现，非常适合学习。

## 下一步

- [手写 Hooks 实现](/practices/02-hooks-from-scratch/) — 手写 Hooks 实现
- [手写时间切片调度器](/practices/03-scheduler-demo/) — 手写时间切片调度器
- [Fiber 树可视化](/practices/04-fiber-visualizer/) — Fiber 树可视化

## 参考资料

- [Build your own React (Rodrigo Pombo)](https://pomb.us/build-your-own-react/) — 最佳 mini-react 教程
- [I Built React from Scratch (Medium)](https://medium.com/@jsmmkt123/i-built-react-from-scratch-and-discovered-why-fiber-changes-everything-8a1504ed1b94) — 从零构建 React 的实践笔记
- [React 源码 react-noop-renderer](https://github.com/facebook/react/tree/eafeac097b/packages/react-noop-renderer) — 精简 Reconciler
- [Didact GitHub Repo](https://github.com/pomber/didact) — 完整 mini-react 代码
