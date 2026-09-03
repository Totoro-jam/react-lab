---
title: "源码文件索引"
---

> **链接快照说明**：本文档中所有 GitHub 源码链接均指向固定 commit `eafeac097b`（2026-08-25），而非 `main` 分支。这意味着即使 React 源码后续发生文件重命名、删除或内容变更，这些链接仍然有效并指向文档编写时分析的确切代码版本。
>
> 完整 commit hash：`eafeac097ba51e1eab809c07102126bd5f8e5425`
>
> 对应版本：React 19.3.0 开发分支。如需查看该 commit 的完整源码树，访问 [`facebook/react` 仓库 `eafeac097b` commit](https://github.com/facebook/react/tree/eafeac097b/)。

按知识点到源码文件的映射，方便在阅读文档时快速定位源码。

## 核心 API

| 知识点 | 源码路径 |
| -------- | --------- |
| useState/useEffect 等入口 | [`packages/react/src/ReactHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactHooks.js) |
| Component/PureComponent | [`packages/react/src/ReactBaseClasses.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactBaseClasses.js) |
| createContext | [`packages/react/src/ReactContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactContext.js) |
| React.memo | [`packages/react/src/ReactMemo.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactMemo.js) |
| React.lazy | [`packages/react/src/ReactLazy.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactLazy.js) |
| React.forwardRef | [`packages/react/src/ReactForwardRef.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactForwardRef.js) |
| React.Children | [`packages/react/src/ReactChildren.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactChildren.js) |
| startTransition | [`packages/react/src/ReactStartTransition.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactStartTransition.js) |
| JSX 运行时 | [`packages/react/src/jsx/`](https://github.com/facebook/react/tree/eafeac097b/packages/react/src/jsx/) |

## Reconciler 核心

| 知识点 | 源码路径 |
| -------- | --------- |
| Fiber 类型定义 | [`packages/react-reconciler/src/ReactInternalTypes.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactInternalTypes.js) |
| FiberNode 构造函数 | [`packages/react-reconciler/src/ReactFiber.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiber.js) |
| WorkTag 类型 | [`packages/react-reconciler/src/ReactWorkTags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactWorkTags.js) |
| Flags 副作用标记 | [`packages/react-reconciler/src/ReactFiberFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberFlags.js) |
| Mode 模式标记 | [`packages/react-reconciler/src/ReactTypeOfMode.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactTypeOfMode.js) |
| RootTag | [`packages/react-reconciler/src/ReactRootTags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactRootTags.js) |
| Lane 优先级 | [`packages/react-reconciler/src/ReactFiberLane.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js) |

## 工作循环

| 知识点 | 源码路径 |
| -------- | --------- |
| 工作循环（workLoop） | [`packages/react-reconciler/src/ReactFiberWorkLoop.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js) |
| beginWork | [`packages/react-reconciler/src/ReactFiberBeginWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js) |
| completeWork | [`packages/react-reconciler/src/ReactFiberCompleteWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCompleteWork.js) |
| Diff 算法 | [`packages/react-reconciler/src/ReactChildFiber.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactChildFiber.js) |
| Commit 阶段 | [`packages/react-reconciler/src/ReactFiberCommitWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitWork.js) |
| Commit Effects | [`packages/react-reconciler/src/ReactFiberCommitEffects.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitEffects.js) |
| Commit Host Effects | [`packages/react-reconciler/src/ReactFiberCommitHostEffects.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitHostEffects.js) |
| 错误处理 | [`packages/react-reconciler/src/ReactFiberThrow.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js) |
| unwind | [`packages/react-reconciler/src/ReactFiberUnwindWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberUnwindWork.js) |
| Root 调度 | [`packages/react-reconciler/src/ReactFiberRootScheduler.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberRootScheduler.js) |
| 更新入口 | [`packages/react-reconciler/src/ReactFiberReconciler.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberReconciler.js) |

## Hooks

| 知识点 | 源码路径 |
| -------- | --------- |
| Hooks 全部实现 | [`packages/react-reconciler/src/ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) |
| Effect 标记 | [`packages/react-reconciler/src/ReactHookEffectTags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactHookEffectTags.js) |

## 类组件

| 知识点 | 源码路径 |
| -------- | --------- |
| 类组件处理 | [`packages/react-reconciler/src/ReactFiberClassComponent.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberClassComponent.js) |
| 更新队列 | [`packages/react-reconciler/src/ReactFiberClassUpdateQueue.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js) |
| 并发更新 | [`packages/react-reconciler/src/ReactFiberConcurrentUpdates.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js) |

## Scheduler

| 知识点 | 源码路径 |
| -------- | --------- |
| 调度器主逻辑 | [`packages/scheduler/src/forks/Scheduler.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js) |
| 优先级定义 | [`packages/scheduler/src/SchedulerPriorities.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerPriorities.js) |
| 最小堆 | [`packages/scheduler/src/SchedulerMinHeap.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerMinHeap.js) |
| 时间切片参数 | [`packages/scheduler/src/SchedulerFeatureFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerFeatureFlags.js) |

## 渲染器

| 知识点 | 源码路径 |
| -------- | --------- |
| createRoot | [`packages/react-dom/src/client/ReactDOMRoot.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom/src/client/ReactDOMRoot.js) |
| DOM HostConfig | [`packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js) |
| 事件系统 | [`packages/react-dom-bindings/src/events/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-dom-bindings/src/events/) |
| SSR renderToPipeableStream | [`packages/react-dom/src/server/ReactDOMFizzServerNode.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom/src/server/ReactDOMFizzServerNode.js) |
| 自定义渲染器 | [`packages/react-noop-renderer/src/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-noop-renderer/src/) |
| Test Renderer | [`packages/react-test-renderer/src/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-test-renderer/src/) |

## 并发特性

| 知识点 | 源码路径 |
| -------- | --------- |
| Suspense | [`packages/react-reconciler/src/ReactFiberSuspenseComponent.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberSuspenseComponent.js) |
| Transition | [`packages/react-reconciler/src/ReactFiberTransition.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberTransition.js) |
| Activity/Offscreen | [`packages/react-reconciler/src/ReactFiberActivityComponent.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberActivityComponent.js) |
| View Transition | [`packages/react-reconciler/src/ReactFiberViewTransitionComponent.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberViewTransitionComponent.js) |
| Gesture Transition | [`packages/react-reconciler/src/ReactFiberGestureScheduler.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberGestureScheduler.js) |
| 事件优先级定义 | [`packages/react-reconciler/src/ReactEventPriorities.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactEventPriorities.js) |
| Context 传播 | [`packages/react-reconciler/src/ReactFiberNewContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberNewContext.js) |
| Suspense Context | [`packages/react-reconciler/src/ReactFiberSuspenseContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberSuspenseContext.js) |
| Hydration Context | [`packages/react-reconciler/src/ReactFiberHydrationContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHydrationContext.js) |
| Profiler 计时器 | [`packages/react-reconciler/src/ReactProfilerTimer.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactProfilerTimer.js) |

## RSC / SSR 静态 API

| 知识点 | 源码路径 |
| -------- | --------- |
| RSC 基础 | [`packages/react-server/src/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server/src/) |
| RSC + Webpack | [`packages/react-server-dom-webpack/src/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-webpack/src/) |
| Flight 协议 | [`packages/react-server-dom-webpack/src/server/ReactFlightDOMServerNode.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-server-dom-webpack/src/server/ReactFlightDOMServerNode.js) |
| prerender / resumeAndPrerender（浏览器） | [`packages/react-dom/src/server/ReactDOMFizzStaticBrowser.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom/src/server/ReactDOMFizzStaticBrowser.js) |
| prerenderToNodeStream / resumeAndPrerenderToNodeStream | [`packages/react-dom/src/server/ReactDOMFizzStaticNode.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom/src/server/ReactDOMFizzStaticNode.js) |
| resume（浏览器） | [`packages/react-dom/src/server/ReactDOMFizzServerBrowser.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom/src/server/ReactDOMFizzServerBrowser.js) |

## Shared

| 知识点 | 源码路径 |
| -------- | --------- |
| 符号常量 | [`packages/shared/ReactSymbols.js`](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactSymbols.js) |
| 类型定义 | [`packages/shared/ReactTypes.js`](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactTypes.js) |
| Feature Flags | [`packages/shared/ReactFeatureFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactFeatureFlags.js) |
| 内部共享状态 | [`packages/shared/ReactSharedInternals.js`](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactSharedInternals.js) |
| 浅比较 | [`packages/shared/shallowEqual.js`](https://github.com/facebook/react/blob/eafeac097b/packages/shared/shallowEqual.js) |
| Object.is | [`packages/shared/objectIs.js`](https://github.com/facebook/react/blob/eafeac097b/packages/shared/objectIs.js) |

## 测试 Fixtures

| 知识点 | 源码路径 |
| -------- | --------- |
| Fiber Debugger | [`fixtures/fiber-debugger/`](https://github.com/facebook/react/tree/eafeac097b/fixtures/fiber-debugger/) |
| Concurrent | [`fixtures/concurrent/`](https://github.com/facebook/react/tree/eafeac097b/fixtures/concurrent/) |
| Scheduler | [`fixtures/scheduler/`](https://github.com/facebook/react/tree/eafeac097b/fixtures/scheduler/) |
| SSR | [`fixtures/ssr/`](https://github.com/facebook/react/tree/eafeac097b/fixtures/ssr/) |
| Fizz (流式 SSR) | [`fixtures/fizz/`](https://github.com/facebook/react/tree/eafeac097b/fixtures/fizz/) |
| Flight (RSC) | [`fixtures/flight/`](https://github.com/facebook/react/tree/eafeac097b/fixtures/flight/) |

## 下一步

- [术语表](/reference/glossary) — 核心术语速查
- [社区资料索引](/reference/resources) — 调研依赖的完整资料
- [源码阅读方法论](/reference/reading-guide) — 如何有效阅读源码
