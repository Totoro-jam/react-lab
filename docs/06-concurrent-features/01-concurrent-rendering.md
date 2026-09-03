---
title: "并发渲染原理"
---



> 对应源码：[ReactFiberWorkLoop.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js), [ReactFiberRootScheduler.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberRootScheduler.js)

## 1. 什么是并发渲染

[并发渲染（Concurrent Rendering）](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)是指 React 可以**同时准备多个版本的 UI**，并能**中断、恢复或丢弃**正在进行的渲染。

```
同步渲染（React 15 / LegacyRoot）：
  setState → 一口气渲染完整棵树 → 无法中断
  大组件树 → 主线程阻塞 → 交互卡顿

并发渲染（React 18+ / ConcurrentRoot）：
  setState → 分片渲染 → 可中断 → 可恢复 → 可丢弃
  大组件树 → 时间切片让步 → 交互流畅
```

## 2. 可中断性的核心

并发渲染的核心就是 [performUnitOfWork](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js) 之间的 shouldYield 检查：

```
每个 Fiber 是一个"工作单元"
workLoopConcurrentByScheduler:
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }

每处理一个 Fiber 就检查一次：
  → 时间片没用完：继续下一个 Fiber
  → 时间片用完了：退出 while → 让出主线程

让出后：
  → workInProgress 指针保留（指向下一个要处理的 Fiber）
  → workInProgress 树的中间结果保留在内存中
  → 下一个时间片从 workInProgress 继续
```

## 3. 丢弃与重新开始

当[高优先级更新打断低优先级渲染](https://react.iamkasong.com/concurrent/interrupt.html)时，React 会**丢弃**当前的 workInProgress 树，从头开始：

```
T=0:  TransitionLane 渲染进行中
      workInProgress 树构建到一半

T=3:  SyncLane 到达（用户输入）
      → ensureRootIsScheduled 检测到更高优先级的 Lane
      → 取消当前 Scheduler 任务
      → 丢弃 workInProgress 树（不切换 current，不影响 DOM）
      → 从 root.current 重新创建 workInProgress
      → 用 SyncLane 开始新渲染

T=8ms: SyncLane 渲染完成 → commit → DOM 更新
      → 用户看到立即响应

T=9ms: 重新调度 TransitionLane
      → 又从头渲染（但数据可能已经变了，用最新的）
```

## 4. 并发渲染的安全性保证

> [React Design Principles](https://legacy.reactjs.org/docs/design-principles.html) 阐述了 React 设计中避免不一致 UI 的核心理念。

React 保证[并发渲染](https://medium.com/@jsmanifest/react-19-concurrent-rendering-deep-dive-actions-transitions-and-suspense-in-production-0ae9199fa95f)不会给用户看到不一致的 UI：

```
保证 1：中间状态不可见
  workInProgress 树在内存中构建
  → DOM 不变（用户看到的还是旧 UI）
  → 只有 Commit 阶段才修改 DOM
  → 用户永远只看到完整的新旧状态切换

保证 2：副作用只执行一次
  useEffect/useLayoutEffect 在 commit 阶段执行
  → render 阶段即使被重复执行，也不会触发副作用
  → 但函数组件本身可能被多次调用（render 阶段可重复）

保证 3：hooks 结果一致
  render 阶段被中断 → hooks 链表重置
  → 重新渲染时从头执行 hooks
  → 只要输入相同，输出就相同（纯函数保证）
```

## 5. StrictMode 中的双重检查

开发模式下，StrictMode 故意双重执行函数组件来检测副作用：

```
StrictMode 下的一次渲染：

  1. 执行函数组件（第一次）
     → 如果有副作用（如修改外部变量）→ 记录
  2. 立即丢弃第一次的结果
  3. 再次执行函数组件（第二次）
     → 如果外部变量被修改了 → 说明第一次有意外的副作用

目的：确保函数组件是"纯净"的
  并发模式下组件可能被多次调用
  有副作用的组件会在并发渲染中出 bug
```

## 下一步

- [Suspense 机制](/06-concurrent-features/02-suspense) — Suspense 的实现机制
- [过渡更新 Transitions](/06-concurrent-features/03-transitions) — 过渡更新的完整分析
- [自动批量更新](/06-concurrent-features/04-batching) — 自动批量更新
- [Offscreen / Activity](/06-concurrent-features/05-offscreen) — Offscreen 组件

## 参考资料

- [React v18.0 - Concurrent React (官方博客)](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)
- [React 19 Concurrent Rendering Deep Dive](https://medium.com/@jsmanifest/react-19-concurrent-rendering-deep-dive-actions-transitions-and-suspense-in-production-0ae9199fa95f)
- [React 技术揭秘 - Concurrent Mode (卡颂)](https://react.iamkasong.com/concurrent/interrupt.html)
