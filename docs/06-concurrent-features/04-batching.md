---
title: "自动批量更新（Automatic Batching）"
---



> 对应源码：[ReactFiberConcurrentUpdates.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js), [ReactFiberRootScheduler.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberRootScheduler.js)

## 1. 什么是批量更新

> [Automatic Batching](https://github.com/reactwg/react-18/discussions/21) 是 React 18 的核心改进之一，将批量更新从 React 事件处理器扩展到了所有场景。

批量更新指 React 将多个 state 更新合并到一次重新渲染中：

```javascript
// React 17（不自动批量）:
setTimeout(() => {
  setCount(c => c + 1);  // 渲染 1
  setFlag(f => !f);       // 渲染 2
}, 0);

// React 18+（自动批量）:
setTimeout(() => {
  setCount(c => c + 1);  // (两次 setState
  setFlag(f => !f);       //  只渲染 1 次)
}, 0);
```

## 2. 实现机制

React 18 的批量更新通过"延迟调度"实现（核心逻辑在 [ReactFiberRootScheduler.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberRootScheduler.js) 的 `ensureRootIsScheduled` 中）：

```
每次 dispatchSetState:
  1. 创建 Update，加入队列
  2. markRootUpdated(root, lane) → 更新 root.pendingLanes
  3. ensureRootIsScheduled(root)

ensureRootIsScheduled:
  检查是否已有同优先级的任务在调度
  如果有 → 不创建新任务（合并！）
  如果没有 → scheduleCallback 创建新任务

结果：同一事件循环中的多个 setState
  → 第一次调用 ensureRootIsScheduled → 创建任务
  → 后续调用的 ensureRootIsScheduled → 发现已有同优先级任务 → 跳过
  → 一个任务统一处理所有更新
```

## 3. React 17 vs 18 的区别

> [React v18.0 博客](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)详细说明了这一改进的动机。

```
React 17:
  React 事件处理器内：自动批量 ✓
  setTimeout / Promise / 原生事件：不批量 ✗

  原因：只在 React 合成事件中包装了 batching 逻辑

React 18:
  所有地方：自动批量 ✓

  原因：批量逻辑移到了 ensureRootIsScheduled 中
  不依赖事件边界，任何地方的 setState 都会通过同一个调度入口
```

## 4. flushSync：强制同步刷新

如果需要立即更新（不批量），用 `flushSync`：

```javascript
import { flushSync } from 'react-dom';

flushSync(() => {
  setCount(c => c + 1);  // 立即渲染
});
setFlag(f => !f);        // 之后再渲染
```

## 下一步

- [Offscreen / Activity](/06-concurrent-features/05-offscreen) — Offscreen 组件
- [View Transitions](/06-concurrent-features/06-view-transitions) — View Transitions
- [Suspense 机制](/06-concurrent-features/02-suspense) — Suspense 的实现机制

## 参考资料

- [Automatic Batching in React 18 (官方)](https://github.com/reactwg/react-18/discussions/21)
- [React v18.0 Blog](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)
