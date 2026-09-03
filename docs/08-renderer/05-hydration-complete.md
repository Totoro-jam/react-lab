---
title: "完整水合生命周期：从 SSR 到 Selection Hydration"
---


> 对应源码：[`ReactFiberHydrationContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHydrationContext.js), [`ReactFiberLane.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js), [`ReactFizzServer.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-server/src/ReactFizzServer.js)

## 1. 水合的定位

Hydration（水合）是把服务端渲染的 HTML 与客户端 React 状态连接的过程——给已有的 HTML"注入灵魂"。

```
浏览器收到：
  <div>...React 服务端渲染的 HTML...</div>

React 水合：
  遍历 Fiber 树（类似 render）
  → 不创建 DOM（DOM 已存在）
  → attach 事件监听器
  → 验证 server HTML 和 client render 是否一致
  → 不一致 → warning（开发模式）

React 18+ 选择性水合：
  → 不同区域可以独立水合
  → 用户交互区域优先水合
```

## 2. 六个 Hydration Lane

React 在 Lane 模型中为水合设计了 6 个专用 Lane（每个常规 Lane 都对应一个 Hydration Lane）：

```javascript
// packages/react-reconciler/src/ReactFiberLane.js:46-106

export const SyncHydrationLane: Lane =              0b0000000000000000000000000000001; // bit 0
const InputContinuousHydrationLane: Lane =         0b0000000000000000000000000000100; // bit 2
const DefaultHydrationLane: Lane =                 0b0000000000000000000000000010000; // bit 4
const TransitionHydrationLane: Lane =              0b0000000000000000000000010000000; // bit 7
export const SelectiveHydrationLane: Lane =        0b0000100000000000000000000000000; // bit 26
export const IdleHydrationLane: Lane =             0b0001000000000000000000000000000; // bit 27

export const HydrationLanes =
  SyncHydrationLane | InputContinuousHydrationLane | DefaultHydrationLane |
  TransitionHydrationLane | SelectiveHydrationLane | IdleHydrationLane;
```

注释说明：每个 HydrationLane 都和对应的常规 Lane 在同一位上的优先级对应。**但 Hydration Lanes 不能携带更新**——它们只表示水合任务本身。

`SelectiveHydrationLane` (bit 26) 是特殊存在——不在常规 Lane 的序列中，专门用于**选择性水合时被分配给用户交互的目标区域**。

## 3. 水合的四个阶段

### 3.1 阶段 1：服务端流式渲染（Fizz）

[React 18 中新的 SSR 架构](https://github.com/reactwg/react-18/discussions/37) 提供的 `renderToPipeableStream` 流式输出 HTML：

```
Server: renderToPipeableStream(<App />, ...)
  → 立即输出 <html><head>...</head><body>
  → <Header> 完成立即输出
  → <Suspense fallback={<Spinner/>}> <Comments/> </Suspense>
     → 先输出 <div id="B:1"><!--$--><Spinner/></div><!--/$-->
     → 数据就绪时 → 流式输出 <div hidden id="B:1"><template>真实内容</template><script>$RC("B:1")</script></div>
  → 附带 hydration <script> → 包含 Hydration 元数据
  → 完成流式输出

Client: 接收到流式 HTML
  → 逐步显示内容
  → 加载 JS → 开始水合
```

参见 **02-ssr-fizz.md** 和 **00-overview/01-architecture-evolution.md** 的流式 SSR 示例。

### 3.2 阶段 2：客户端水合连接（prepareToHydrateHostInstance）

```javascript
// ReactFiberHydrationContext.js（简化）
function prepareToHydrateHostInstance(fiber, rootContainer, hostContext) {
  const instance = fiber.stateNode;  // 已存在的 DOM 节点
  const wasHydrated = hydrateInstance(
    instance,
    fiber.type,
    fiber.pendingProps,
    rootContainer,
    hostContext,
  );
  
  // 把 fiber 的 stateNode 指向已有的 DOM
  // 把从 DOM 上读到的属性对比 fiber.pendingProps
  
  if (!wasHydrated) {
    // 水合失败 → 标记 ForceClientRender
    // → 重渲染此节点（创建新 DOM 覆盖）
  }
}
```

### 3.3 阶段 3：选择性水合（Selective Hydration）

React 18 引入选择性水合，用户可以在不同 Suspense 边界之间优先水合：

```
渲染状态（hydration 正在进行）：
  <App>
    <Sidebar />            ← 已加载 JS, 已 hydrate
    <Suspense><Profile /></Suspense>  ← 等待数据
    <Suspense><Comments /></Suspense>  ← 用户点击这里！
  </App>

用户点击 <Comments /> 区域的某个按钮（即使还没 hydrate）：
  React 检测到点击事件
  → 选择性水合：<Comments /> 区域被分配到 SelectiveHydrationLane
  → <Comments /> 子树优先水合
  → 水合完成后 React 再回放被记录的点击事件
  → 用户的点击被响应
  
其他区域（如 <Profile />）继续等待
```

实施机制见 `ReactFiberWorkLoop.js`：

- `enterHydrationState(fiber)` 开始一个 hydration 范围
- 每个范围是独立的，不会被打断（除非更高优先级插入）
- `isHydrating` 标志在任何时刻只在 root / Maximum-Depth 上为 true

### 3.4 阶段 4：流式水合

React 18 的流式 SSR 水合过程可以**分多轮**——服务端流式输出多个 chunk，每接收到一个 chunk 就触发一次水合：

```
Server 流式输出 3 个 chunk:
  C1: <html><body><Header/>...</body></html>      [立即]
  C2: <script>$RC("B:1")</script>  [数据就绪]  [Comments]
  C3: <script>$RC("B:2")</script>  [数据就绪]  [Profile]

Client 接收 C1 → 开始水合 Header 等
Client 接收 C2 → 流式更新 Suspense B:1 → 触发水合 Comments
Client 接收 C3 → 流式更新 Suspense B:2 → 触发水合 Profile
```

这里 `useSyncExternalStore` 中的 `getIsHydrating()` 起作用——水合过程中的 `useSyncExternalStore` 会用 `getServerSnapshot()` 保证一致性。

## 4. 水合与 React 17 的差异

[React 17 重要变化：事件委托从 document 移到 root container](https://legacy.reactjs.org/blog/2020/10/20/react-v17.html) 直接为选择性水合铺路：

```
React 16/17 之前：
  事件委托吸附在 document 上
  → 不同 React 应用并存时事件冲突
  → 没有"root 概念" → 无法选择性水合

React 17：
  事件委托吸附在 `createRoot(container)` 的 root container 上
  → 每个 React root 独立事件系统
  → 为选择性水合创建了"root"概念
  → 不同 Suspense 边界可以独立水合

React 18：
  正式提供选择性水合
  → 不同 Suspense 边界独立水合
  → 用户交互区域优先水合
```

## 5. React 19.2：Suspense 边界批量揭示

[React 19.2 Blog](https://react.dev/blog/2025/10/01/react-19-2) 的一个重要修复：**SSR 期间，Suspense 边界批量揭示**。

```
React 19.1 之前：
  Server Streaming：Suspense boundary 完成 → 立即发送 $RC 替换 fallback
  → 极快的边界快速揭示，慢的边界慢速揭示
  → 用户看到"瀑布式"内容出现（fallback → ripple reveal）

React 19.2：
  Server Streaming：所有的 Suspense 完成事件小幅批量发送
  → 极快的边界也等待一下，组成"一组"同时揭示
  → 用户体验更流畅（reveal 一次性发生）
  → 为 View Transition for Suspense SSR 铺路（Batch 内放一起动画）

工作原理：
  React 内部使用启发式算法
  → 如果总加载时间接近 2.5s（LCP 阈值）
  → 停止 batching，立即揭示，避免影响 Core Web Vitals
```

## 6. Partial Pre-rendering：React 19.2 SSR 的新范式

React 19.2 引入了 [Partial Pre-rendering](https://react.dev/blog/2025/10/01/react-19-2)：

```
1. prerender(<App />, { signal })
   → 输出：prelude (HTML shell) + postponed state
   → 静态部分立即输出到 CDN
   → 动态部分（如 Suspense boundary 内）记录为 postponed state

2. postponed state 保存：
   resumableState / rootFormatContext / nextSegmentId / 其他场景信息

3. resume(<App />, postponed)
   → 接收 postponed state
   → 把渲染继续到 SSR 流，补上动态部分
```

源码中的 `postponed state`：

```javascript
// packages/react-server/src/ReactFizzServer.js
// request 对象的 postponedState 字段
postponedState: null | PostponedState,
// 包含：
//   resumableState（可恢复状态）
//   rootFormatContext（格式上下文）
//   nextSegmentId（下一个 segment ID）
//   等等...
```

这实现了"静态预渲染 + 动态续渲染"的分离模型——CDN 缓存静态 shell，用户请求时 resume 到 SSR 流产动态内容。

## 7. 源码文件索引

| 文件 | 职责 |
| ------ | ------ |
| `ReactFiberHydrationContext.js` | 水合核心：enterHydrationState、prepareToHydrateHostInstance、popHydrationState |
| `ReactFiberLane.js` | 6 个 HydrationLanes + SelectiveHydrationLane |
| `ReactFiberWorkLoop.js` | 水合过程中的 root 调度、并发性 |
| `ReactFiberBeginWork.js` | `isHydrating()` 检查（如 useSyncExternalStore 中） |
| `ReactFizzServer.js` | 服务端流式 SSR + Partial Pre-rendering |
| `ReactFizzInstructionSetShared.js` | `$RC` 等流式指令集 |
| `react-dom-bindings/src/client/ReactDOMEventListener.js` | 选择性水合中的事件**捕获**（记录点击但暂不触发） |

## 8. 完整生命周期图

```
[Server]                                          [Client]

prerender(<App/>)                                 
  ├→ 静态 HTML shell                  ─发送─→     立即显示（CDN cache）
  ├→ 静态部分已生成                   ─等待─→     
  └→ 动态部分标记 postponed                         
                                                   ↓
resume(<App/>, postponed)                          
  ├→ 读取 postponed state                          
  └→ 流式 SSR 动态内容                ─流式发送─→  Suspense boundary 揭示
                                                   ↓
                                                  hydrateRoot
                                                    ↓
                                                  开始水合
                                                  ├→ walked through tree
                                                  ├→ 验证 server HTML
                                                  ├→ 触发事件监听 attach
                                                  └→ 不同 Suspense 边界各自独立水合
                                                    ↓
                                                  用户点击 <Comment/>
                                                  (即使没 hydrate)
                                                    ↓
                                                  → 选择性水合触发
                                                  → 分配 SelectiveHydrationLane
                                                  → <Comment/> 优先水合
                                                  → 水合完成后回放点击事件
                                                    ↓
                                                  全部水合完成
                                                  → 进入 normal client render
```

## 下一步

- [选择性水合](/08-renderer/04-selective-hydration) — 选择性水合的初步介绍
- [SSR 渲染（Fizz）](/08-renderer/02-ssr-fizz) — SSR 流式渲染（Fizz）基础
- [Partial Pre-rendering](/09-react-server/05-partial-prerendering) — Partial Pre-rendering 详细机制
- [useSyncExternalStore](/04-hooks-internals/10-external-store) — useSyncExternalStore 在水合中的行为

## 参考资料

- [New Suspense SSR Architecture in React 18 (React WG #37)](https://github.com/reactwg/react-18/discussions/37) — ★ 流式 SSR 与选择性水合的官方架构指南
- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — ★ Partial Pre-rendering、Batching Suspense Boundaries
- [React v17 Blog (官方)](https://legacy.reactjs.org/blog/2020/10/20/react-v17.html) — ★ 事件委托从 document 移到 root container
- [React 18 Blog (官方)](https://react.dev/blog/2022/03/29/react-v18) — 并发渲染 + 流式 SSR + 选择性水合
- [The Perils of Hydration (Josh Comeau)](https://www.joshwcomeau.com/react/the-perils-of-rehydration/) — ★ Hydration 常见 bug 详解
- [Selective Hydration (patterns.dev)](https://www.patterns.dev/react/react-selective-hydration/) — 选择性水合的可视化说明
- [Different hydration and rendering strategies (Neciu Dan)](https://neciudan.dev/hydration-and-rendering-strategies/) — ★ 全局视角的 hydration/渲染策略对比
- [React 19: What's New for Developers (Scrimba 2026)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — 2026 年视角的 React 19.x 完整状态
- [React 18 Upgrade Guide (官方)](https://react.dev/blog/2022/03/08/react-18-upgrade-guide) — createRoot / hydrateRoot 升级指南
- [hydratedRoot 文档 (官方)](https://react.dev/reference/react-dom/client/hydrateRoot) — `hydrateRoot` API 文档
- [React Source ReactFiberHydrationContext.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHydrationContext.js) — 水合核心源码
- [React Source ReactFiberLane.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js) — Hydration Lanes 定义
- [React Source ReactFizzServer.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-server/src/ReactFizzServer.js) — Partial Pre-rendering postpone/resume 实现
