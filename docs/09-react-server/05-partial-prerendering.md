---
title: "Partial Pre-rendering：静态 Shell + 动态续载"
---


> 对应源码：[`ReactFizzServer.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-server/src/ReactFizzServer.js), [`ReactDOMFizzStaticBrowser.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom/src/server/ReactDOMFizzStaticBrowser.js)

## 一个被浪费的渲染

你的电商产品页面有导航栏、产品标题、产品描述、评论列表、实时价格。问题：**每来一个用户请求，你的服务器都把全部内容重新渲染一遍——包括导航栏和产品描述这种对每个用户都一样的内容**。

```
用户 1 请求 /products/42：
  服务器渲染 <html><nav>...</nav><h1>Product 42</h1><p>...</p>...</html>
  → 导航栏 HTML 完全一样，但每次都重渲染
  → 产品描述 HTML 完全一样，但每次都重渲染
  → 只有实时价格是用户专属的

用户 2 请求 /products/42：
  又来了 → 又全渲染一遍
```

这就是 React SSR 的核心矛盾：**SSR 必须在服务器渲染才能返回完整 HTML，但大量内容是静态的**。SSG 可以缓存静态 HTML，但无法处理动态内容。Suspense 的流式输出缓解了"全部等待"的问题，但仍然每次都要从零渲染。

React 19.2 给出了答案：**把整页拆成静态部分和动态部分，静态部分提前渲染存 CDN，动态部分在请求时"续载"填充**。[React 19.2 官方博客](https://react.dev/blog/2025/10/01/react-19-2) 称之为 Partial Pre-rendering。

### API 演进：从 unstable_prerender 到稳定 API

`prerender` / `resume` API 并非 React 19.2 首创，它有一个明确的实验-稳定演进过程：

| 版本 | API 名称 | PR | 状态 |
| ------ | ---------- | ---- | ------ |
| React 19.1 (2025-03) | `unstable_prerender` | [#31724](https://github.com/facebook/react/pull/31724) | 实验性 |
| React 19.1 (同上) | `resume` / `resumeToPipeableStream` | 同上 | 实验性 |
| React 19.2 (2025-10) | `prerender` / `prerenderToNodeStream` | [React 19.2 Blog](https://react.dev/blog/2025/10/01/react-19-2) | **稳定** |
| React 19.2 (同上) | `resumeAndPrerender` / `resumeAndPrerenderToNodeStream` | 同上 | **稳定** |

`unstable_` 前缀移除意味着 API 签名和返回值结构已稳定。当前源码中不再存在 `unstable_prerender`，已全部替换为 `prerender`：

```javascript
// packages/react-dom/src/server/ReactDOMFizzStaticBrowser.js:68
function prerender(children, options) { ... }  // ← 不再是 unstable_prerender

// packages/react-dom/src/server/ReactDOMFizzServerBrowser.js:169
function resume(children, postponedState, options) { ... }

// packages/react-dom/src/server/ReactDOMFizzStaticBrowser.js:158
function resumeAndPrerender(children, postponedState, options) { ... }
```

[React 19.1 Changelog](https://github.com/facebook/react/blob/eafeac097b/CHANGELOG.md) 中同时记录的还有流式传输出 Environments 优化（[#31852](https://github.com/facebook/react/pull/31852)），为 PPR 的 Edge 部署奠定了基础。

## 核心思路：prerender + resume

```
传统 SSR：
  每个用户请求 → 完整渲染 → 输出
  → 服务器负载高、TTFB 慢
  → 静态内容每次都重新渲染

Partial Pre-rendering：
  构建时/定时：prerender → 生成静态 shell → 存 CDN
  用户请求时：resume → 只渲染动态部分 → 流式填充
  → CDN 静态：TTFB 几毫秒
  → 服务器只需补动态部分
```

预渲染的输出有两部分：

- **prelude**：静态 HTML shell（含导航栏、产品描述等所有不会变的内容）
- **postponed**：一个序列化的状态对象（记录了哪些 Suspense 边界需要续载、渲染上下文在哪中断）

```javascript
const { prelude, postponed } = await prerender(<App />, { signal: controller.signal });
await savePostponedState(postponed);
await savePreludeToCDN(prelude);

// 后续用户请求时：
const resumeStream = await resume(<App />, postponed);
resumeStream.pipe(res);  // 动态部分流式填充
```

## 与传统 SSR / SSG / RSC 的关系

| 方式 | 何时生成 | 内容 | 个性化 |
| ------ | --------- | ------ | -------- |
| CSR | 客户端运行 JS | 空 HTML + JS | 支持 |
| SSR | 每次请求 | 完整动态 HTML | 完全支持 |
| SSG | 构建时 | 完整静态 HTML | 不支持 |
| ISR | 定时 | 完整静态 + 重新生成 | 部分 |
| **PPR** | 预渲染 + 请求时续 | 静态 shell + 动态补充 | **支持** |
| **RSC** | 请求时 | 服务端组件树 + Flight 格式 | 完全支持 |

PPR 的精妙之处：**静态部分 CDN 加速（毫秒 TTFB），动态部分仅在请求时填充，和 React 流式渲染无缝对接**。

## API：prerender + resume

### 3.1 prerender

```javascript
// packages/react-dom/src/server/ReactDOMFizzStaticBrowser.js:68-97

function prerender(children, options) {
  return new Promise((resolve, reject) => {
    function onAllReady() {
      const stream = new ReadableStream({
        type: 'bytes',
        pull: (controller) => startFlowing(request, controller),
        cancel: (reason) => {
          stopFlowing(request);
          abort(request, reason);
        },
      });
      
      const result = {
        postponed: getPostponedState(request),  // ['★ 核心：postponed state']
        prelude: stream,                         // ['★ 静态 shell 流']
      };
      resolve(result);
    }
    // ...创建 request，处理 signal...
  });
}
```

返回值：

- `prelude`：HTML 流（含静态部分的内容）
- `postponed`：可序列化的 Postponed State（用于后续 resume）

### 3.2 resume / resumeAndPrerender

```javascript
// packages/react-dom/src/server/ReactDOMFizzStaticBrowser.js:158-216

function resumeAndPrerender(children, postponedState, options) {
  return new Promise((resolve, reject) => {
    function onAllReady() {
      const stream = new ReadableStream({...});
      const result = {
        postponed: getPostponedState(request),  // ['★ resume 后可能还有再 postpone']
        prelude: stream,                         // ['★ 完整 HTML（静态+动态）']
      };
      resolve(result);
    }
    
    const request = resumeAndPrerenderRequest(
      children,
      postponedState,           // ['★ 接收之前保存的 postponed state']
      resumeRenderState(postponedState.resumableState, undefined),
      ...
    );
    // ...处理 AbortSignal、开始 work...
  });
}
```

### 3.3 使用方式

```javascript
// 步骤 1：预生成（部署前定时运行）
const { prelude, postponed } = await prerender(<App/>, {
  signal: controller.signal  // 总超时信号
});

// prelude → 保存到 CDN 或文件系统（HTML shell，含所有静态部分）
// postponed → 保存到 KV store（序列化的 PostponedState）

await savePostponedState(postponed);
await savePreludeToCDN(prelude);

// 步骤 2：用户请求时 resume
const postponedState = await getPostponedState(request);
const resumeStream = await resume(<App/>, postponed);
// 直接管道流给客户端的 HTTP Response：
resumeStream.pipe(res);

// 或者通过 resumeAndPrerender 得到完整 HTML（用于 SSG）：
const { prelude } = await resumeAndPrerender(<App/>, postponed);
// 发送完整 HTML（原生 SSG）
```

## 内部机制

### 4.1 Postponed State 包含什么

```javascript
// packages/react-server/src/ReactFizzServer.js
// Request 对象的 postponedState 字段

postponedState: null | PostponedState,
// PostponedState 包含：
//   - resumableState（可恢复状态：已写入的指令集、bootstrap、segment ID 等）
//   - rootFormatContext（根格式上下文：HTML format、是否 in select、是否 text 等）
//   - progressiveChunkSize（渐进 chunk 大小）
//   - nextSegmentId（下一个可用的 segment ID）
```

设计原则：**postponed state 包含了从暂停位置恢复渲染所需的全部上下文**。保存成本低（可序列化），恢复速度快。

### 4.2 什么是"postponed"部分

在 prerender 时，如果遇到需要动态数据的部分（通常是包裹在 `<Suspense>` 中的异步操作），React 会：

1. 暂停那个区域的渲染（类似 Suspense 的 throw promise）
2. 在 HTML shell 中放入一个占位符（如 `<div id="B:1"></div>`），但不立即流式输出 fallback
3. 记录"这里需要 resume"。这是 PPR 与普通流式 SSR 的关键差异

```javascript
// ReactFizzServer.js 内部逻辑简化
// 当 render 中遇到 Suspense + 异步数据 →
 
// 1. 普通 SSR：立即流式输出 fallback → wait → 流式替换为真实内容
//    问题：fallback 提前发送后就无法 revoke

// 2. PPR/prerender：
//    → 暂停到这里 → 不输出 fallback → 记录 postponed → 返回到 onAllReady
//    → 应用层决定何时 resume（在真正用户请求时）

// resume 时：
//    → 从 postponed 点继续 → 执行异步获取数据 → 流式填充内容
```

### 4.3 客户端水合与 PPR

PPR 输出的 HTML 包含一个特殊的 bootstrap 脚本——客户端水合时知道哪些是 prelude（预渲染部分）、哪些是 dynamic（动态部分），hydration 机制会 accordingly 处理：

```
服务端 prerender 输出的 HTML:
  <html>
    <head>static_meta...</head>
    <body>
      <nav>static navigation</nav>           ← prelude（静态，CDN cache）
      <main>
        <div id="P:1"><!-- PPR postpone marker --></div>  ← 动态区域占位符
      </main>
    </body>
    <script>R4>${PPR_INFO}</script>          ← PPR 恢复信息
  </html>

客户端接收到完整 HTML（prelude + resume 的动态填充）：
  <html>...
    <main>
      <div id="P:1">动态内容</div>   ← resume 阶段填充
    </main>
  </html>

水合过程：
  hydrateRoot 对完整 HTML 水合
  → 注意：之前接收到的 prelude 可能是个"半产物"
  → 但 hydrateRoot 水合的是完整 HTML
  → 因此水合逻辑和普通 SSR 一致
```

## 与 Next.js Cache Components 的关系

[Next.js 16 的 Cache Components](https://nextjs.org/docs/app/getting-started/caching) 基于 React 的 prerender/resume 底层 API 构建了完整的框架级 PPR 体验。启用方式：

```javascript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,  // ★ 启用 Cache Components，PPR 成为默认行为
}

export default nextConfig
```

### `'use cache'` 指令

`cacheComponents: true` 后获得的核心工具，作用于两个层级：

**数据级缓存**——缓存异步函数的返回值：

```javascript
import { cacheLife, cacheTag } from 'next/cache'

export async function getProducts() {
  'use cache'
  cacheLife('hours')        // ← 缓存有效期
  cacheTag('products')      // ← 缓存标签（用于失效）
  return db.query('SELECT * FROM users')
}
```

**UI 级缓存**——缓存整页或整个组件：

```javascript
export default async function Page() {
  'use cache'
  cacheLife('hours')
  const users = await db.query('SELECT * FROM users')
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}
```

函数参数和闭包变量**自动成为缓存键**——不同参数产生不同的缓存条目，实现个性化缓存。

### 渲染模型：Static Shell + Dynamic Holes

| 组件类型 | 行为 | 处理方式 |
| ---------- | ------ | ---------- |
| 纯同步组件 | 自动进入 static shell | 构建时完成 |
| `'use cache'` 组件 | 缓存后进入 static shell | 预渲染 + CDN |
| `<Suspense>` 包裹的动态组件 | 请求时流式填充 | resume |
| 未包裹 `<Suspense>` 的动态组件 | **构建错误** | 必须显式处理 |

Next.js 16 严格要求：访问运行时 API（如 `cookies()`）、执行非确定性操作（如 `crypto.randomUUID()`）的组件**必须**用 `<Suspense>` 包裹或标记 `'use cache'`，否则构建时报 `"Uncached data was accessed outside of <Suspense>"` 错误。

### 缓存生命周期与失效

| 函数 | 用途 | 示例 |
| ------ | ------ | ------ |
| `cacheLife('hours')` | 设置缓存有效期 | 来自 `next/cache` |
| `cacheTag('products')` | 打标签用于批量失效 | 来自 `next/cache` |
| `updateTag('products')` | 手动批量失效标签 | 来自 `next/cache` |
| `connection()` | 显式标记请求时机 | 来自 `next/server` |

```javascript
// 管理 Server Action 中手动失效缓存
async function createPost(formData) {
  'use server'
  await db.post.create({ data: { title: formData.get('title') } })
  updateTag('posts')  // ★ 失效所有带 'posts' 标签的缓存
}
```

### React prerender/resume vs Next.js Cache Components

| 维度 | React (底层 API) | Next.js (框架级) |
| ------ | ------------------ | ------------------ |
| 缓存策略 | 手动管理 prelude + postponed | `'use cache'` 声明式 |
| 缓存失效 | 无内建机制 | `cacheTag` + `updateTag` |
| 缓存存储 | 手动持久化 | 默认内存 + 可扩展远端 |
| 构建校验 | 无 | 构建时报错防遗漏 |
| PPR | 手动编排 | 默认行为 |
| 路由级拆分 | 手动 | 自动（每个 `page.tsx` 独立包） |

React 的 `prerender`/`resume` 是底层 primitive，Next.js 在其上构建了框架级体验：自动 Suspense boundary（`loading.js`）、声明式缓存指令、构建时校验、CDN 集成。

## 注意事项

### 6.1 何时使用 prerender vs renderToPipeableStream

```
prerender + resume：
  → 适合：有显著静态部分的页面（blog、文档站、商品页）
  → 适合：CDN 缓存静态 shell 提升首屏
  → 不适合：全动态页面（如用户 dashboard）

renderToPipeableStream：
  → 适合：完全动态页（每个请求都不同）
  → 简单：一次调用，流式输出到 response
  → 没有静态缓存点
```

### 6.2 Node.js vs Web Streams

React 19.2 引入了 Node Streams 支持。源码中有多个入口：

```javascript
// 多个入口根据环境选择
// - react-dom/src/server/react-dom-server.node.js → Node Streams 环境
// - react-dom/src/server/react-dom-server.browser.js → 浏览器/Web Stream
// - react-dom/src/server/react-dom-server.edge.js → Edge 环境（Cloudflare Workers 等）
// - react-dom/src/server/react-dom-server.bun.js → Bun 环境
```

[React 19.2 Blog](https://react.dev/blog/2025/10/01/react-19-2) 的 Pitfall 警告："在 Node.js 环境仍推荐 Node Streams（`renderToPipeableStream`、`resumeToPipeableStream`），因为 Node Streams 更快，且 Web Streams 不默认压缩"。

## API 速查表

| API | 用途 | 返回 |
| ----- | ------ | ------ |
| `prerender` (Web Stream) | 生成静态 shell + postponed state | `{ prelude, postponed }` |
| `prerenderToNodeStream` (Node Streams) | 同上，Node 环境 | 同上 |
| `resume` (Web Stream) | 从 postponed state 续载到流 | `ReadableStream` |
| `resumeToPipeableStream` (Node Streams) | 同上，Node 环境 | `PipeableStream` |
| `resumeAndPrerender` (Web Stream) | 续载到完整静态 HTML | `{ prelude }` |
| `resumeAndPrerenderToNodeStream` (Node Streams) | 同上 Node | 同上 |

## 下一步

- [RSC 缓存与流式渲染](/09-react-server/04-rsc-caching-streaming) — RSC 缓存策略（`use cache`、`cacheSignal`）与 PPR 配合
- [cache() 与 cacheSignal](/09-react-server/06-cache-signal) — cacheSignal 与 cache() 生命周期
- [完整水合生命周期](/08-renderer/05-hydration-complete) — 完整水合生命周期
- [SSR 渲染（Fizz）](/08-renderer/02-ssr-fizz) — SSR Fizz 流式渲染基础

## 参考资料

- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — ★ Partial Pre-rendering 官方公告，含 API 示例
- [React 19.1 Changelog (GitHub)](https://github.com/facebook/react/blob/eafeac097b/CHANGELOG.md) — unstable_prerender 引入记录（PR #31724）
- [React 19.2, Simply Explained (Medium)](https://medium.com/@natanael280198/react-19-2-simply-explained-630f158688b9) — 简明指南
- [What's New in React 19.2 (certificates.dev)](https://certificates.dev/blog/whats-new-in-react-192) — Activity + useEffectEvent + PPR 概览
- [React Server DOM Static API: prerender (官方)](https://react.dev/reference/react-dom/static/prerender) — API 文档
- [React Server DOM Static API: resume (官方)](https://react.dev/reference/react-dom/static/resume) — resume API 文档
- [Next.js Cache Components (官方)](https://nextjs.org/docs/app/getting-started/caching) — `cacheComponents: true` + `'use cache'` 完整指南
- [Next.js use cache directive (官方)](https://nextjs.org/docs/app/api-reference/directives/use-cache) — `cacheLife` / `cacheTag` / `updateTag` API
- [Next.js cacheComponents flag (官方)](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) — `cacheComponents` 配置
- [Next.js 16 Deep Dive: Caching Architecture (Medium)](https://medium.com/@sureshdotariya/next-js-16-deep-dive-understanding-the-new-caching-architecture-574041fe7c6d) — 缓存架构深度分析
- [Next.js 16 Cache Components Explained (webkul)](https://webkul.com/blog/next-js-16-cache-components-explained/) — 通俗讲解
- [Different hydration and rendering strategies (Neciu Dan)](https://neciudan.dev/hydration-and-rendering-strategies) — SSR / SSG / ISR / PPR / RSC 多策略对比
- [React Source ReactFizzServer.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-server/src/ReactFizzServer.js) — postpone/resume 实现
- [React Source ReactDOMFizzStaticBrowser.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom/src/server/ReactDOMFizzStaticBrowser.js) — prerender / resumeAndPrerender 公共 API
- [React Source ReactVersions.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/ReactVersions.js) — 版本管理
