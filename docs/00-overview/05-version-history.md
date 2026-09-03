---
title: "React 版本演进时间线：从 2013 到 2026"
---


> 对应源码：[`ReactVersions.js`](https://github.com/facebook/react/blob/eafeac097b/ReactVersions.js), [`ReactRootTags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactRootTags.js)

## 1. 前夜：React 之前的世界

React 不是从零开始的。它站在几个前身项目的肩膀上。

```
2010  XHP (Facebook PHP 扩展)
      → 用 PHP 写 JSX 风格的 HTML，组合式构建
      → 核心理念：HTML 不应拼接，应组合

2011  FaxJS (Jordan Walke 的实验项目)
      → 用 JavaScript 实现类似 XHP 的思路
      → 核心理念：你描述 UI，框架自己改 DOM

2012  Facebook Ads 应用危机
      → 越加越大，级联更新问题严重
      → Jordan Walke 用 FaxJS 思路重写了广告管理 UI
      → Instagram 收购后推动 React 解耦 Facebook → 可开源化
      → Pete Hunt 负责 React 的解耦和开源工作
```

[React 的历史时间线（RisingStack）](https://blog.risingstack.com/the-history-of-react-js-on-a-timeline/) 和 [React Versions 官方页](https://react.dev/versions) 记录了这些早期事件。

## 2. 2013 年 5 月：React 开源

React 在 **2013 年 5 月 29 日** 开源，初始 commit：`75897c`。

Pete Hunt 在 **JSConf EU 2013** 上做了题为 "Reconfiguring Best Practices" 的演讲，核心论点至今仍是 React 基石：

1. **JSX 不是模板语言**——就是 JavaScript 本身
2. **虚拟 DOM 不是性能优化**——是架构选择（跨平台渲染的基础）
3. **"脏活"交给库**——diff 可以自动算，开发者不该手动操作 DOM

当时的社区反应？大量批评。"JSX 丑陋"、"React 破坏了 HTML 语义"、"虚拟 DOM 太慢"。但 Facebook 内部已经有数千个组件在用 React，证明了它的价值。

## 3. 早期版本（2013-2015）

```
0.3.0 (2013-05-29)  开源初始发布
0.4.0 (2013-07)     组件交互改进、PropType 改进
0.5.0 (2013-10)     开发工具支持、性能改进
0.8.0 (2013-12)     synthetic events、key prop
0.9.0 (2014-02)     跨平台支持改进
0.10.0 (2014-03)    事件系统改进
0.11.0 (2014-07)    ref 系统改进
0.12.0 (2014-10)    React 0.12: createElement 改版、JSX 转换标准化
0.13.0 (2015-03)    ES6 class 支持！createClass 不再是唯一选择
0.14.0 (2015-10-07) 重大拆分
```

### React 0.13（2015 年 3 月）：ES6 Classes

React 不再只支持 `React.createClass`——可以直接用 `extends React.Component` 写类组件。这是 React 向现代化迈出的第一步。

### React 0.14（2015 年 10 月）：拆分 react / react-dom

这是 0.x 系列最重要的发布：

- **拆分为两个包**：`react`（核心） + `react-dom`（DOM 渲染）+ `react-dom/server`
- **无状态函数组件**（Stateless Function Components）——第一次允许用纯函数写组件
- **ref 直接指向 DOM 节点**（不再需要 `.getDOMNode()`）
- **弃用 react-tools** → 迁移到 Babel
- 引入 `React.Children.toArray`、Symbol-based $$typeof 安全标记

这一拆分的影响深远——它为 React Native、React ART、React Test Renderer 等渲染器铺路。本质上，这是 React **"renderer 无关"设计**的正式落地。

## 4. React 15（2016 年）：第一个稳定主版本

React 从 0.x 跳到 15 不仅仅是为了好看——它标志着 React 从"实验项目"变成"生产就绪"。

```
15.0.0 (2016-04)   第一个稳定主版本，Stack Reconciler
15.2.0 (2016-07)   未知 DOM 属性支持（不再 warn）
15.5.0 (2017-04)   弃用 React.createClass / React.PropTypes → 独立包
15.6.0 (2017-06)   最后一版
```

React 15 使用 **Stack Reconciler**——递归遍历组件树，不可中断。虽然 Fiber 概念已经在团队内部讨论，但 15 仍是同步的"一口气跑完"模型。

## 5. React 16（2017-2019）：Fiber 革命

这是 React 历史上最大的架构重写。Andrew Clark 在 [React Fiber Architecture](https://github.com/acdlite/react-fiber-architecture) 设计文档中详细阐述了动机：**JS 调用栈不可控，用一个可暂停的链表代替它**。

```
16.0.0  (2017-09-26) Fiber 架构重写！
        → Error Boundaries (componentDidCatch)
        → Portals (createPortal)
        → Fragments (<React.Fragment>)
        → 自定义 DOM 属性
        → return null / '' in render

16.3.0  (2018-03-29) 新 Context API + StrictMode
        → 新的 createContext（旧 context 成为 legacy）
        → React.createRef
        → React.StrictMode
        → 安全生命周期：UNSAFE_componentWillMount 等
        → forwardRef

16.6.0  (2018-10-23) React.lazy + React.Suspense（代码分割）
        → React.memo
        → React.lazy + Suspense 仅支持代码分割
        → contextType 简化 Context 消费

16.7.0  (2018-12)    无主要新特性（Hooks 还在 alpha）

16.8.0  (2019-02-06) Hooks 正式发布！
        → useState, useReducer, useEffect, useLayoutEffect
        → useContext, useImperativeHandle, useRef
        → useMemo, useCallback
        → useDebugValue
        → 函数组件从"纯展示"变成"一等公民"

16.9.0  (2019-08)    act() 稳定
16.13.0 (2020-03)    Profiler 稳定
16.14.0 (2020-10)    最后一版 16.x
```

[React 16.x Roadmap](https://legacy.reactjs.org/blog/2018/11/27/react-16-roadmap.html)（2018 年 11 月 Dan Abramov 发表的路线图）规划了 16.6 (Suspense) → 16.7 (Hooks) → 16.x (Concurrent) → 16.x (Suspense for Data) 的分步发布策略。最终 Concurrent 和 Suspense for Data 推迟到 18 才稳定。

### Fiber 架构对版本的影响

Fiber 重写在 16.0 完成，但直到 18 才真正"激活"。16.x 的所有版本**都兼容 Stack Reconciler 的行为**——Fiber 的并发能力在 16 中是隐藏的。这是有意为之：16/17 默认同步渲染（`ReactDOM.render` 走 LegacyRoot），`flushSync` 和 `unstable_batchedUpdates` 用于手动控制批量行为，并发能力直到 18 的 `createRoot` 才正式暴露。

源码中的 `ReactRootTags.js` 记录了两种根模式：

```javascript
// packages/react-reconciler/src/ReactRootTags.js
export type RootTag = 0 | 1;
export const LegacyRoot = 0;       // ReactDOM.render（Stack 模式，React 15 行为）
export const ConcurrentRoot = 1;   // ReactDOM.createRoot（并发模式，React 18+）
```

## 6. React 17（2020 年 10 月）：稳定性的过渡

React 17 是史上最没有"新功能"的主版本发布。它的目标只有一个：**为 18+ 的并发渲染铺路，同时不动 API**。

```
17.0.0  (2020-10-20)

关键变化（实现层）：
  → 事件委托从 document 移到 root container
    （支持多 React 应用并存、与第三方库共存）
  → 新的 JSX Transform
    （不需要 `import React from 'react'`，react/jsx-runtime）
  → 移除 Private delegation带来的事件冒泡行为变化
  → 给 ref 置空时返回 undefined（不再是 null）

API 层：无新功能，但有重要的删除和调整
  → 事件委托变更影响第三方库（取决于 DOM 事件的实际 root）
  → 委托到 root container 意味着 window-level 事件监听器
    不再能拦截 React 树的事件
```

这一版让 DevTools 开始用 ESModule，从而解决一些 React DOM 跨版本问题。

## 7. React 18（2022 年 3 月）：并发渲染正式上线

**2022 年 3 月 29 日** 发布。这是 Fiber 架构重写 5 年后真正激活 Concurrent React 的版本——也是 16.x Roadmap 中规划的"Concurrent Mode + Suspense for Data"目标终于稳定落地。

```
18.0.0  (2022-03-29)

核心特性：
  → 并发渲染（Concurrent Rendering）
    渲染可中断、可恢复、可丢弃
  → createRoot API（替代 ReactDOM.render）
    → ReactDOM.render 被废弃（带 warning）
  → 不再自动批量所有回调（外部事件也批量）
  → useSyncExternalStore 防止外部状态撕裂
  → useInsertionEffect（CSS-in-JS 注入时机）
  → useId 生成稳定 ID
  → startTransition / useTransition
  → useDeferredValue

SSR 改进：
  → 流式 SSR + Suspense（renderToPipeableStream）
  → 选择性水合（Selective Hydration）
  → Suspense 边界可暂停服务端渲染

开发工具：
  → React 18 Working Group（社区反馈渠道）
  → Strict Mode 双调用 effects 准备 Suspense for data
  → 创建独立的 React Native Fiber 架构（新 React Native 架构宣布）
```

[React 18 官方博客](https://react.dev/blog/2022/03/29/react-v18) 明确说：**并发渲染是 opt-in——只有当你使用并发特性（如 useTransition、startTransition）时才启用**。升级到 18 但不用并发特性，行为和 17 完全一样。

源码中这一改动体现为 createRoot vs legacy render 的 root tag 切换：

```javascript
// 如果用 createRoot：
root = createRoot(container);  // → ConcurrentRoot = 1
// 如果用 ReactDOM.render：
ReactDOM.render(<App />, container);  // → LegacyRoot = 0
```

## 8. React 19（2024 年 12 月）：Actions + Server Components + Compiler

**2024 年 12 月 5 日** 发布。React 19 是自 16 引入 Fiber 之后又一次架构上的大跨度——React 不再只是"客户端框架"，它是**客户端+服务端一体**的运行时。

```
19.0.0  (2024-12-05)

核心新特性：
  → Server Components 稳定！
    （'use client' / 'use server' 指令）
  → Server Actions（async function in transition）
  → useActionState（替代了 Canary 中的 useFormState）
  → useFormStatus
  → useOptimistic
  → use() API（读 Promise / Context，可在条件中调用）
  → ref 作为普通 prop 传递（不再强制 forwardRef）
  → ref cleanup functions
  → 文档元数据（<title>、<meta> 直接在组件中渲染）
  → 资源预加载（preload、preinit）
  → 资源 hoisting（<link rel="stylesheet"> 可在组件中声明）
  → 不再支持 IE

React Compiler：
  → 实验性发布，逐步稳定路线图

版本治理：
  → React 19 延续 Library 版本管理
```

[React 19 Scrimba 指南](https://scrimba.com/articles/react-19-whats-new-for-developers/)（2026 年更新版）详细列出了 19.0 的每个特性在 2026 年的稳定性状态。

## 9. React 19.1（2025 年 3 月）：调试工具改进

**2025 年 3 月 28 日** 发布。这是一次以"可见性"为核心的发布——让开发者更容易理解"为什么 React 做了什么"。

```
19.1.0  (2025-03-28)

新特性：
  → Owner Stacks（captureOwnerStack API）
    开发模式下可调用，返回"是谁渲染了当前组件"的堆栈
    （区别于 componentStack——后者是组件树路径）
  → Enhanced Suspense
    客户端 / 服务端 / 水合阶段更好控制
    → Suspense 边界优先级提升
    → Suspense boundary 重试调度改进
    → 修复 fallback 冻结问题（frozen fallback states）
  → unstable_prerender（实验🌟）
    为 19.2 的 Partial Pre-rendering 铺路

其他：
  → react-server-dom-parcel 包（Parcel 打包器集成）
  → useId 前缀：:r: → «r»（19.0 的 :r: 在 view-transition-name 中非法）
  → ARIA 1.3 属性支持
  → 深嵌套 Suspense 在 fallback 内修复
```

[React 官方文档 captureOwnerStack](https://react.dev/reference/react/captureOwnerStack) 详细说明了 Owner Stack 与 Component Stack 的区别：Owner Stack 只包含"直接创建"了出错节点的组件链路，不像 Component Stack 包含整棵树。

## 10. React 19.2（2025 年 10 月）：Activity + Partial Pre-rendering

**2025 年 10 月 1 日** 发布。这是 React 19.x 线的第三个版本，也是第一个提供"后台渲染"和"预渲染后恢复"的版本。

```
19.2.0  (2025-10-01)

核心新特性：
  → <Activity> 组件（替代 Offscreen，原实验名）
    visible / hidden 两种模式
    hidden：卸载 effects，延迟所有更新直到空闲
    可用于后台预渲染用户即将到达的页面
  → useEffectEvent（19.2 稳定）
    Effect 中的"事件"函数——不影响 effect 依赖
    类似 DOM 事件，总是看到最新 props/state
    不能作为 Effect 的依赖
  → cacheSignal（RSC 专用）
    cache() 缓存的生命周期信号
    用于 abort fetch、清理资源
  → Performance Tracks（Chrome DevTools）
    Scheduler Track、Components Track
    在 Chrome Performance 面板可视化 React 调度

React DOM 特性：
  → Partial Pre-rendering（核心新增）
    prerender + resume 的两段式渲染
    静态部分预渲染 → CDN 分发
    动态部分请求时 resume 到 SSR 流
  → Batching Suspense Boundaries for SSR
    避免 fallback 过多，改为批量揭示
    为 View Transition for Suspense SSR 铺路
  → Web Streams 支持 Node
    renderToReadableStream 在 Node 可用
    （推荐仍用 Node Streams，性能更好）

其他：
  → eslint-plugin-react-hooks v6（flat config 默认）
  → useId 前缀：«r» → _r_（19.2）
    19.0 用 :r:（不合法 CSS 选择器）/ 19.1 用 «r»（不合法 view-transition-name 和 XML 1.0 names）
    19.2 用 _r_（兼容 view-transition-name 和 XML 1.0 names）
  → React 移至 Linux Foundation 托管
    React Foundation 在 React Conf 2025 上宣布
```

[React 19.2 官方博客](https://react.dev/blog/2025/10/01/react-19-2) 是这一版的权威来源，所有 API 行为和限制都以官方文档为准。

### React Foundation：治理独立

| 时间 | 里程碑 |
|------|--------|
| 2025-10-07 | React Conf 宣布意向，七家创始成员（Amazon、Callstack、Expo、Meta、Microsoft、Software Mansion、Vercel），Seth Webster 任执行董事 |
| 2026-02-24 | 正式成立，Huawei 加入成为第八个铂金成员，Meta 承诺 5 年 $3M+ |

业务治理（董事会）与技术治理（独立于董事会，临时领导小组制定中）分离。技术方向由贡献者和维护者决定。详见 [架构演进 §11](./01-architecture-evolution.md#_11-react-foundation-治理独立化)。

## 11. 当前状态（2026 年）

```
stable channel:  React 19.2.7 (2026-06-01)
canary channel:   view transitions / fragment refs / addTransitionType
experimental:    更多实验特性

React 19.3（开发中）：
  本仓库源码 ReactVersions.js: ReactVersion = '19.3.0'
  → 尚无官方公告
  → 可预期：更多 View Transition 相关 API 稳定化

React 20：
  → 未宣布
```

源码确认 React 当前在开发 19.3.0：

```javascript
// ReactVersions.js
const ReactVersion = '19.3.0';
```

## 12. 按主线演进的源码影响一览

| 主线 | 起始版本 | 稳定版本 | 源码对应 |
| ------ | --------- | --------- | --------- |
| Fiber 架构 | 16.0 (实验) | 18.0 (激活) | `ReactFiber.js`, `ReactFiberWorkLoop.js` |
| 双缓冲 | 16.0 | — | `createWorkInProgress` |
| Lane 优先级 | 内部已就绪 | 18.0 | `ReactFiberLane.js` |
| Hooks | 16.8 | — | `ReactFiberHooks.js` |
| Suspense | 16.6 (code split) → 18.0 (data) | 18.0 | `ReactFiberThrow.js`, `ReactFiberSuspenseComponent.js` |
| Context | 16.3 | — | `ReactFiberNewContext.js` |
| StrictMode | 16.3 (警告) → 18.0 (双调用 effect) | 16.3 | `ReactFiberBeginWork.js (updateMode)` |
| Error Boundaries | 16.0 | — | `ReactFiberUnwindWork.js` |
| RSC | 19.0 | 19.0 | `react-server/`, `react-server-dom-webpack/` |
| Compiler | 19.0 (实验) → 1.0 (2025.10) | 19.0 | `compiler/packages/babel-plugin-react-compiler/` |
| Activity | 19.2 | 19.2 | `ReactFiberActivityComponent.js` (原 Offscreen 改名) |
| View Transitions | Canary (19.3?) | 未发布 | `ReactFiberViewTransitionComponent.js` |
| Gesture Transitions | Canary (19.3?) | 未发布 | `ReactFiberGestureScheduler.js` |
| owner Stacks | 19.1 | — | `ReactFiberTreeReflection.js` + `ReactDebugHooks.js` |
| Partial Pre-rendering | 19.2 | 19.2 | `ReactFizzServer.js` |

## 下一步

- [React 设计哲学](/00-overview/04-design-philosophy) — React 十三条设计原则和起源故事
- [关键设计决策](/00-overview/06-design-decisions) — 七个关键设计决策的"为什么"
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — 每个版本对应的架构变化在源码中的落地

## 参考资料

- [React Versions (官方)](https://react.dev/versions) — ★ 八个主版本的博客、演讲、CHANGELOG 完整归档
- [React v16.0 (官方)](https://legacy.reactjs.org/blog/2017/09/26/react-v16.0.html) — Fiber 重写公告
- [React v16.3 (官方)](https://legacy.reactjs.org/blog/2018/03/29/react-v-16-3.html) — Context API、StrictMode、安全生命周期
- [React v16.6 (官方)](https://legacy.reactjs.org/blog/2018/10/23/react-v-16-6.html) — React.lazy + Suspense
- [React v16.8: The One With Hooks (官方)](https://legacy.reactjs.org/blog/2019/02/06/react-v16.8.0.html) — Hooks 正式发布
- [React 16.x Roadmap (Dan Abramov)](https://legacy.reactjs.org/blog/2018/11/27/react-16-roadmap.html) — Suspense/Hooks/Concurrent 的发布路线图
- [React v0.14 (官方)](https://legacy.reactjs.org/blog/2015/10/07/react-v0.14.html) — react/react-dom 拆分、无状态函数组件
- [Reintroducing React: every update since v16 (freeCodeCamp)](https://medium.com/free-code-camp/reintroducing-react-every-react-update-since-v16-demystified-60686ee292cc) — 16 到 18 的特性全解
- [React v18.0 (官方)](https://legacy.reactjs.org/blog/2022/03/29/react-v18) — 并发渲染、自动批处理、transitions、流式 SSR
- [React v17 (官方)](https://legacy.reactjs.org/blog/2020/10/20/react-v17.html) — 事件委托、新 JSX Transform
- [React 19 Blog (官方)](https://react.dev/blog/2024/12/05/react-19) — Server Components、Actions、use()、ref as prop
- [React 19.1.0 (Medium)](https://medium.com/@onix_react/whats-new-in-react-19-1-0-d87dda0905a9) — Owner Stacks 等改进
- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — Activity、useEffectEvent、Partial Pre-rendering
- [React 19.2, Simply Explained (Medium)](https://medium.com/@natanael280198/react-19-2-simply-explained-630f158688b9) — 19.2 的简要说明
- [React 19: What's New for Developers 2026 (Scrimba)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — ★ 2026 年视角的完整状态表，含版本日期
- [React Labs: View Transitions, Activity, and more (官方)](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) — Activity / View Transitions 实验公告
- [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture) — Fiber 设计文档
- [React v18 Upgrade Guide (官方)](https://react.dev/blog/2022/03/08/react-18-upgrade-guide) — 18 升级指南
- [React Native Versions (官方)](https://reactnative.dev/versions) — React Native 版本信息（用于交叉参考架构协同)
- [React Update: 18 RC (官方)](https://react.dev/blog/2022/03/08/react-18-rc) — 18 RC 公告
- [React v17 announcement announcement (官方)](https://legacy.reactjs.org/blog/2020/10/20/react-v17.html) — 17 详细说明
- [captureOwnerStack (官方文档)](https://react.dev/reference/react/captureOwnerStack) — Owner Stack API 文档
- [View Transition (官方文档)](https://react.dev/reference/react/ViewTransition) — ViewTransition 组件文档（Canary）
- [Activity (官方文档)](https://react.dev/reference/react/Activity) — Activity 组件文档
- [useEffectEvent (官方文档)](https://react.dev/reference/react/useEffectEvent) — useEffectEvent 文档
- [cacheSignal (官方文档)](https://react.dev/reference/react/cacheSignal) — cacheSignal 文档
- [useSyncExternalStore (官方文档)](https://react.dev/reference/react/useSyncExternalStore) — 外部 store 同步文档
- [React Source ReactVersions.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/ReactVersions.js) — 版本号管理
- [React Source ReactRootTags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactRootTags.js) — LegacyRoot / ConcurrentRoot 定义
- [React Source ReactFeatureFlags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactFeatureFlags.js) — feature flag 管理（如 disableLegacyMode）
