---
title: "WorkTag 类型体系"
---


> 对应源码：[packages/react-reconciler/src/ReactWorkTags.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactWorkTags.js)

## 1. 什么是 WorkTag

每个 Fiber 节点都有一个 `tag` 字段，它是一个数字，标记了**这个 Fiber 代表什么类型的组件**。React 在 `beginWork` 和 `completeWork` 阶段会根据 `tag` 值进入不同的处理分支（参见 [React 技术揭秘 - beginWork](https://react.iamkasong.com/render/beginWork.html)）。

```javascript
// packages/react-reconciler/src/ReactWorkTags.js:10-42
export type WorkTag =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
  | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31;
```

## 2. 完整的 WorkTag 列表

直接看源码定义（WorkTag 与 Element 类型的对应关系参见 [Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/)）：

```javascript
// packages/react-reconciler/src/ReactWorkTags.js:44-73

export const FunctionComponent = 0;       // 函数组件
export const ClassComponent = 1;          // 类组件
// 2 = IndeterminateComponent（未确定类型，mount 时用于判断是函数还是类）
export const HostRoot = 3;                // FiberRoot 的根节点
export const HostPortal = 4;              // Portal（createPortal）
export const HostComponent = 5;           // 原生 DOM 元素（div, span...）
export const HostText = 6;                // 纯文本节点
export const Fragment = 7;                // <Fragment> 或 <></>
export const Mode = 8;                    // <StrictMode> 等模式标记
export const ContextConsumer = 9;         // Context.Consumer
export const ContextProvider = 10;        // Context.Provider
export const ForwardRef = 11;             // React.forwardRef 包装的组件
export const Profiler = 12;               // <Profiler>
export const SuspenseComponent = 13;      // <Suspense>
export const MemoComponent = 14;          // React.memo 包装的组件
export const SimpleMemoComponent = 15;    // React.memo（无自定义比较函数）
export const LazyComponent = 16;          // React.lazy 加载的组件
export const IncompleteClassComponent = 17; // 类组件处理出错时的中间态
export const DehydratedFragment = 18;     // SSR 水合的 Fragment
export const SuspenseListComponent = 19;  // <SuspenseList>
// 20 已废弃
export const ScopeComponent = 21;         // 实验性 Scope
export const OffscreenComponent = 22;     // <Offscreen>（实验性，现改名为 Activity）
export const LegacyHiddenComponent = 23;  // 旧版隐藏（已废弃）
export const CacheComponent = 24;         // 缓存组件
export const TracingMarkerComponent = 25; // Transition 追踪标记
export const HostHoistable = 26;          // 可提升的 Host 资源（如 <link>）
export const HostSingleton = 27;          // 单例 Host 元素（如 <html>, <head>）
export const IncompleteFunctionComponent = 28; // 函数组件处理出错时的中间态
export const Throw = 29;                  // 抛出错误的特殊 Fiber
export const ViewTransitionComponent = 30; // <ViewTransition>
export const ActivityComponent = 31;      // <Activity>（原 Offscreen 的新名字）
```

## 3. 按使用频率分类

```
日常开发频繁遇到的：
  FunctionComponent (0)      ← 函数组件（绝大多数组件）
  HostComponent (5)          ← <div>、<span> 等 DOM 元素
  HostText (6)               ← 文本节点
  HostRoot (3)               ← createRoot 的根节点
  Fragment (7)               ← <></> 或 <Fragment>

现代 React 常见的：
  ContextProvider (10)       ← Context.Provider
  ContextConsumer (9)        ← <Context.Consumer> 渲染属性模式
  MemoComponent (14)         ← React.memo（有自定义比较）
  SimpleMemoComponent (15)   ← React.memo（无自定义比较）
  SuspenseComponent (13)     ← <Suspense>
  LazyComponent (16)         ← React.lazy
  ForwardRef (11)            ← React.forwardRef

偶尔遇到的：
  ClassComponent (1)         ← 类组件（新项目少见，旧项目常见）
  Profiler (12)              ← <Profiler>
  HostPortal (4)             ← createPortal

内部/中间状态（开发者不直接看到）：
  IncompleteClassComponent (17)  ← 类组件渲染出错时
  IncompleteFunctionComponent (28) ← 函数组件渲染出错时
  DehydratedFragment (18)    ← SSR 水合中的 Fragment
  IndeterminateComponent (2) ← mount 时判断函数/类组件

实验性/较新的：
  SuspenseListComponent (19)  ← <SuspenseList>
  OffscreenComponent (22)     ← <Offscreen>（旧名）
  ActivityComponent (31)      ← <Activity>（新名）
  ViewTransitionComponent (30) ← <ViewTransition>
  HostHoistable (26)          ← <link> 等可提升元素
  HostSingleton (27)          ← <html> 等单例元素

极少见的：
  ScopeComponent (21)        ← 实验性 Scope
  CacheComponent (24)         ← 内部缓存
  TracingMarkerComponent (25) ← Transition 追踪
  LegacyHiddenComponent (23)  ← 旧版隐藏（已废弃）
  Throw (29)                  ← 特殊抛出错误的 Fiber
```

## 4. beginWork 如何使用 WorkTag

在 [`ReactFiberBeginWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js) 中，`beginWork` 函数通过 `switch(workInProgress.tag)` 来决定调用哪个处理函数：

```
beginWork(current, workInProgress, renderLanes)
switch (workInProgress.tag)
case FunctionComponent (0)
→ updateFunctionComponent()
→ 调用 renderWithHooks() 执行你的函数组件
→ 得到返回的 React Element
→ reconcileChildren() 处理子节点
case ClassComponent (1)
→ updateClassComponent()
→ 创建/复用 class 实例
→ 调用实例的 render() 方法
→ reconcileChildren() 处理子节点
case HostComponent (5)
→ updateHostComponent()
→ 不调用任何函数（DOM 元素没有渲染函数）
→ reconcileChildren() 处理 children
case HostText (6)
→ updateHostText()
→ 处理文本内容的变化
case HostRoot (3)
→ updateHostRoot()
→ 处理根节点的更新
→ reconcileChildren() 处理顶层组件
case SuspenseComponent (13)
→ updateSuspenseComponent()
→ 检查是否需要显示 fallback
→ 处理挂起（throw promise）的逻辑
case ContextProvider (10)
→ updateContextProvider()
→ push 新的 context value
→ reconcileChildren()
... 其他类型各有对应的 update 函数
default
→ 报错：未知类型
```

## 5. 一个示例：从 JSX 到 WorkTag

```jsx
// 你写的 JSX
<div>
  <Header />
  <Suspense fallback={<Spinner />}>
    <LazyComponent />
  </Suspense>
  <span>Hello</span>
</div>
```

对应的 Fiber 树及 WorkTag：

```
Fiber 树                              WorkTag
HostRoot (3)                        ← createRoot() 的根
div                            ← HostComponent (5)
Header                    ← FunctionComponent (0)
<header>             ← HostComponent (5)
Suspense                  ← SuspenseComponent (13)
fallback: Spinner    ← FunctionComponent (0)
children:
LazyComponent   ← LazyComponent (16)
span                      ← HostComponent (5)
"Hello"              ← HostText (6)
```

## 6. IndeterminateComponent：不确定类型

值 `2`（虽然源码中没有直接导出，但类型定义中存在）是一个特殊状态。当一个组件首次渲染时，React 有时不能立即确定它是函数组件还是类组件。在处理过程中会先标记为 `IndeterminateComponent`，确定类型后再改为 `FunctionComponent` 或 `ClassComponent`。

这种设计避免了在每次 `createElement` 时都进行类型检查，只在首次渲染 mount 时确定一次。

## 7. IncompleteComponent 系列

`IncompleteClassComponent (17)` 和 `IncompleteFunctionComponent (28)` 是**错误恢复的中间状态**。

当组件渲染过程中抛出错误（包括 Suspense 的 `throw promise`），React 会将 Fiber 标记为 Incomplete 类型，然后在 `unwindWork` 阶段尝试恢复。如果找到错误边界（Error Boundary），就重新渲染错误边界的 fallback UI。

```
正常流程：beginWork → completeWork
错误流程：beginWork（抛出错误）
         标记为 IncompleteFunctionComponent/IncompleteClassComponent
         unwindWork（回退到错误边界）
         重新开始（从错误边界处重渲染）
```

## 8. HostHoistable 和 HostSingleton

这两个是 React 19+ 新增的特殊 Host 类型：

```
HostHoistable (26)：
  指可以"提升"到文档头部的元素，如 <link rel="stylesheet">,
  <meta>, <title> 等。React 可以自动将它们移动到 <head> 中，
  而不是留在组件树的位置。

HostSingleton (27)：
  指 HTML 中的单例元素，如 <html>, <head>, <body>。
  这些元素全局只有一个，React 不会创建或删除它们，
  只会更新它们的属性。
```

## 9. WorkTag 的数值设计

注意 WorkTag 的数值不是随意分配的：

- 0-7 是最基础的类型（函数 0、类 1、Indeterminate 2、根 3、Portal 4、DOM 5、文本 6、Fragment 7）
- 8-19 是常见的高级类型（Mode、Context、Suspense、Memo、Lazy 等）
- 20-31 是较新或实验性的类型

数值的大小本身没有方向性含义（不像 Lane 那样数值越小优先级越高）。它们纯粹是用于 `switch` 分支的标识符。

## 下一步

- [副作用标记 Flags](/02-fiber-architecture/03-flags-effects) — 副作用标记系统详解
- [Lane 优先级模型](/02-fiber-architecture/04-lanes-priorities) — Lane 优先级模型
- [双缓冲机制](/02-fiber-architecture/05-double-buffering) — 双缓冲机制

## 参考资料

- [Inside Fiber (Max Koretskyi) - From React Elements to Fiber nodes](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — WorkTag 与 Element 类型的对应关系
- [React 技术揭秘 (卡颂) - render 阶段](https://react.iamkasong.com/render/beginWork.html) — beginWork 中如何处理不同 WorkTag
- [React 源码 WorkTags 定义](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactWorkTags.js) — 官方源码
