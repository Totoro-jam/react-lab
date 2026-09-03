---
title: "Suspense 机制"
---



> 对应源码：[ReactFiberSuspenseComponent.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberSuspenseComponent.js), [ReactFiberThrow.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js)

## 1. Suspense 的工作原理

> [Suspense RFC](https://github.com/reactjs/rfcs/blob/main/text/0213-suspense-in-react-18.md) 定义了 Suspense 在 React 18 中的语义和行为。

Suspense 利用 Fiber 的[错误处理机制](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js)——当组件 throw 一个 Promise 时，React 会"挂起"渲染，显示 fallback。

```jsx
<Suspense fallback={<Spinner />}>
  <DataView />  ← 可能 throw 一个 Promise
</Suspense>
```

## 2. throw Promise 的处理流程

```
1. <DataView> 中 throw fetchData()（一个 Promise）
2. performUnitOfWork catch 异常
   → throwException(fiber, error, ...)
   → 检测到 value 是 Thenable (Promise)
   → 向上查找 Suspense 边界
   → 标记 Suspense fiber 的 ShouldCapture

3. unwindUnitOfWork
   → 找到 Suspense fiber
   → 清除 ShouldCapture，设置 DidCapture
   → 返回 Suspense fiber 重新渲染

4. beginWork(Suspense)
   → 检测到 DidCapture
   → 渲染 fallback 而不是 children
   → 注册 promise.then(() => retry())

5. Promise resolve
   → pingSuspendedRoot(root)
   → 用 RetryLane 重新调度渲染

6. 重新渲染
   → 这次数据已就绪，不再 throw
   → 正常渲染 <DataView> 内容
```

## 3. Suspense 与 Transition 的配合

```jsx
// React 18 的 Suspense + Transition
startTransition(() => {
  setPage('next');  // 触发新数据加载
});
```

当 Transition 中的更新遇到 Suspense 时，React 会**保持显示当前内容**（而非立即切换到 fallback），这一行为在 [React 技术揭秘](https://react.iamkasong.com/concurrent/suspense.html)中有详细分析：

```
没有 Transition：
  数据加载中 → 立刻显示 fallback（Spinner）
  数据就绪 → 显示新内容

有 Transition：
  数据加载中 → 继续显示旧内容（不闪 Spinner）
  数据就绪 → 一次性切换到新内容
```

这通过 `SuspenseContext` 实现——Transition 渲染会 push 一个标志，告诉 Suspense "不要显示 fallback，等数据就好"。

## 4. Nested Suspense

```jsx
<Suspense fallback={<OuterFallback />}>
  <ComponentA />
  <Suspense fallback={<InnerFallback />}>
    <ComponentB />  ← 如果 B 挂起，只显示 InnerFallback
  </Suspense>
</Suspense>
```

每个 Suspense 独立处理挂起。内层 Suspense 挂起不会触发外层 fallback。

## Enhanced Suspense（React 19.1）

[React 19.1.0 于 2025 年 3 月发布](https://medium.com/@onix_react/whats-new-in-react-19-1-0-d87dda0905a9)，对 Suspense 做了多项实质性优化。以下是每项改动对应的 [CHANGELOG PR](https://github.com/facebook/react/blob/eafeac097b/CHANGELOG.md) 编号：

### 水合调度优化（[#31751](https://github.com/facebook/react/pull/31751)）

React 19.1 之前：SSR 水合期间，如果 Suspense 边界的 fallback 正在显示，水合会等所有动态内容到齐才开始。**19.1 之后**：水合调度更积极——已完成 fallback 的边界可以提前水合，不必等待全部动态内容。

增强的 Suspense 边界支持（[#32069](https://github.com/facebook/react/pull/32069), [#32163](https://github.com/facebook/react/pull/32163), [#32224](https://github.com/facebook/react/pull/32224), [#32252](https://github.com/facebook/react/pull/32252)）使 Suspense 边界可以在客户端、服务端和水合阶段统一使用。

### 客户端 Suspense 优先级提升（[#31776](https://github.com/facebook/react/pull/31776)）

React 19.1 之前：客户端渲染的 Suspense 边界优先级较低，可能导致交互延迟。**19.1 之后**：客户端渲染的 Suspense 边界优先级提升——如果 Suspense 内的 update 不是在 Transition 中，它以普通优先级处理，不再被过渡渲染"饿死"。

### 冻结 Fallback 修复（[#31620](https://github.com/facebook/react/pull/31620)）

React 19.1 之前：某些情况下，Suspense fallback 已经 ready 但仍持续显示——"卡在 fallback 状态"。19.1 通过在客户端渲染未完成的 Suspense 边界修复了此问题。

### GC 压力降低（[#31667](https://github.com/facebook/react/pull/31667)）

React 19.1 对 Suspense 边界重试（retry）调度做了改进，减少了不必要的中间对象分配和 GC 压力。这在大型应用中可以显著提升流畅度。

### 其他 Suspense 相关修复

- 修复了 passive effect phase 延迟时出现 "Waiting for Paint" 日志的 bug（[#31526](https://github.com/facebook/react/pull/31526)）
- 修复了 flattening 位置子元素时开发模式下产出的 key warning（[#32117](https://github.com/facebook/react/pull/32117)）
- 改善了 passive effect 调度，使任务让出更一致（[#31785](https://github.com/facebook/react/pull/31785)）
- 还在 19.2 中引入了对 RSC + SSR Suspense fallback 揭示的批量（batching）——见 [RSC 中的 Suspense 边界](/09-react-server/07-rsc-suspense-boundaries) 中的 300ms 节流机制

## 下一步

- [过渡更新 Transitions](/06-concurrent-features/03-transitions) — Transition 的完整分析
- [自动批量更新](/06-concurrent-features/04-batching) — 批量更新
- [RSC 中的 Suspense 边界](/09-react-server/07-rsc-suspense-boundaries) — RSC 中 Suspense 边界的详细分析

## 参考资料

- [Suspense RFC (React 官方)](https://github.com/reactjs/rfcs/blob/main/text/0213-suspense-in-react-18.md)
- [New Suspense SSR Architecture (React 18 WG)](https://github.com/reactwg/react-18/discussions/37)
- [React 技术揭秘 - Suspense (卡颂)](https://react.iamkasong.com/concurrent/suspense.html)
- [What's New in React 19.1.0 (Medium)](https://medium.com/@onix_react/whats-new-in-react-19-1-0-d87dda0905a9)
- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — Batching Suspense Boundaries for SSR
- [React 19: What's New for Developers (Scrimba 2026)](https://scrimba.com/articles/react-19-whats-new-for-developers/)
