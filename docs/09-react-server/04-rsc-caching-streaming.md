---
title: "RSC 缓存策略与流式渲染"
---


> 对应源码：[`packages/react-server/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server), [Next.js Caching 文档](https://nextjs.org/docs/app/getting-started/caching)

## RSC 的缓存层次

RSC 引入了多层次的缓存机制，每一层解决不同的问题。

### 四层缓存模型

> [YLD 的 RSC 缓存指南](https://www.yld.com/blog/the-ultimate-guide-to-faster-more-efficient-rendering-with-rsc-caching-in-next-js)和 [Next.js 官方缓存文档](https://nextjs.org/docs/app/getting-started/caching)对这四层有详细说明。

| 层级 | 作用域 | 失效方式 | 说明 |
| ------ | -------- | ---------- | ------ |
| `'use cache'` 指令 | 单个函数/组件 | `cacheTag` + `updateTag` | React 19.2，参数自动成为 cache key |
| PPR（Partial Prerendering） | 页面级 | 静态 shell 存 CDN | 静态部分预渲染，动态部分请求时补充 |
| Data Cache | `fetch()` 调用 | `revalidate` / 时间过期 | 跨请求缓存 fetch 结果 |
| Full Route Cache | 整个路由 | 重新部署 / 时间过期 | 构建时预渲染的完整页面 |

前两层由 React 原语提供，后两层由框架（如 Next.js）管理。

### `use cache` 指令（React 19.2+）

> 注意：`'use cache'` 是 React 框架层规范（由 React Compiler 和框架如 Next.js 实现），不在 React 核心源码中。`cacheLife`/`cacheTag` 等配套 API 由框架提供。

React 19.2 引入了 `use cache` 指令来声明缓存边界：

```javascript
// 数据级缓存——缓存函数的返回值
async function getUsers() {
  'use cache';
  cacheLife('hours');
  return db.query('SELECT * FROM users');
}

// UI 级缓存——缓存整个组件的渲染结果
async function BlogPosts() {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');

  const res = await fetch('https://api.vercel.app/blog');
  const posts = await res.json();
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

`use cache` 的设计要点：

- **参数自动成为 cache key**——不同参数产生独立的缓存条目
- `cacheLife()` 设置缓存生存期（'hours', 'days', 'default' 等预设）
- `cacheTag()` 给缓存打标签，允许通过 `updateTag('posts')` 精确失效
- 默认存内存，`'use cache: remote'` 可用持久化存储

### Partial Prerendering (PPR)

```
PPR = 静态 Shell + 动态 Streaming

构建时：
  能预渲染的部分 → 静态 HTML + RSC Payload
  不能预渲染的部分 → Suspense 边界 + fallback

请求时：
  立即返回静态 Shell → 用户秒看到大部分页面
  动态部分在请求时执行 → 数据就绪后流式补充
```

PPR 让"静态"和"动态"可以共存在同一页面中，不需要全页面二选一。

## `'use server'` 的编译时行为

> [React 19 官方博客](https://react.dev/blog/2024/12/05/react-19)和 [Josh Comeau 的 RSC 教程](https://www.joshwcomeau.com/react/server-components/)对指令的语义有详细解释。

```
'use client':
  → 标记文件中的所有 export 为 Client Component
  → 打包器将这些组件包含在客户端 bundle 中
  → 该文件中可以使用 useState/useEffect/onClick 等
  → 'use client' 之上的 import 不会被打包到客户端

'use server':
  → 标记文件中的 async 函数 export 为 Server Action
  → 打包器不为这些函数生成客户端代码
  → 客户端通过加密引用调用它们（不包含函数源码）
  → 只能用在 module 顶层 export（不能嵌套在组件中）

'use cache' (React 19.2+):
  → 标记函数的返回值应被缓存
  → 参数和闭包变量自动成为 cache key
  → 编译器注入缓存逻辑（缓存命中则跳过函数体）
```

### 编译器如何处理指令

```
源码：
'use server';
async function submitForm(data) {
  await db.insert(data);
}

编译后（客户端 bundle 中）：
// 函数体被替换为远程调用 stub
async function submitForm(data) {
  return callServer('encrypt_hash_id', [data]);
}
// 'encrypt_hash_id' 是一个加密的闭包引用
// 包含：文件路径 + 函数名 + 闭包变量（加密的）

编译后（服务端）：
// 原始函数体保留在这里
// 通过 RPC 协议接收参数 → 执行 → 返回结果
```

## RSC + Suspense 的流式渲染

> [Rebecca DePrey 的 RSC Streaming 指南](https://rebeccamdeprey.com/blog/rsc-streaming-suspense)对不同场景的流式模式有完整分析。

### 瀑布流问题

```
没有流式：
  等待 getUser() → 50ms
  等待 getAnalytics() → 2000ms
  等待 getNotifications() → 100ms
  总计：2150ms 后才看到任何内容

有流式 + Suspense：
  T=0ms: <Suspense> 包裹 AnalyticsPanel → 先发送 fallback
  T=50ms: getUser() 完成 → 立即发送 Header
  T=100ms: getNotifications() 完成 → 流式发送 NotificationFeed
  T=2000ms: getAnalytics() 完成 → 流式替换 fallback 为真实内容

  用户在 T=50ms 就看到了 Header
  在 T=100ms 看到了通知
  在 T=2000ms 看到了分析面板
```

### 嵌套 Suspense 的渐进式渲染

```jsx
export default function ProductPage({ productId }) {
  return (
    <div>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductDetails id={productId} />
        {/* 产品详情先到 */}
        <Suspense fallback={<ReviewsSkeleton />}>
          <ProductReviews id={productId} />
          {/* 评论后到——嵌套边界，独立流式 */}
        </Suspense>
      </Suspense>
    </div>
  );
}
```

外层 Suspense 显示 ProductSkeleton 直到 ProductDetails 就绪。ProductDetails 出来后，内层 Suspense 的 ReviewsSkeleton 继续显示直到评论数据到达。这创造了自然的渐进式体验。

### 并行数据获取

```jsx
// 每个组件自己 fetch 数据 → React 自动并行
async function Dashboard() {
  return (
    <div>
      <Suspense fallback={<Skeleton />}>
        <UserCard />      {/* fetches its own data */}
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <RevenueChart />  {/* fetches its own data, in parallel */}
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <RecentOrders />  {/* fetches its own data, in parallel */}
      </Suspense>
    </div>
  );
}
```

三个 fetch 同时开始——总等待时间是最慢的请求的耗时，而不是所有请求的总和。

## 下一步

- [RSC 架构原理](/09-react-server/01-rsc-architecture) — RSC 架构原理
- [Flight 协议](/09-react-server/02-flight-protocol) — Flight 序列化协议
- [Server Actions](/09-react-server/03-server-actions) — Server Actions 与变更
- [Suspense 机制](/06-concurrent-features/02-suspense) — Suspense 在客户端和 SSR 的完整实现

## 参考资料

- [Next.js Caching (官方文档)](https://nextjs.org/docs/app/getting-started/caching) — ★ 四层缓存模型和 `use cache` 指令
- [React 19 Blog (官方)](https://react.dev/blog/2024/12/05/react-19) — 'use server'/'use client'/'use cache' 指令说明
- [The ultimate guide to RSC caching (YLD)](https://www.yld.com/blog/the-ultimate-guide-to-faster-more-efficient-rendering-with-rsc-caching-in-next-js) — ★ RSC 缓存的完整实践指南
- [Making Sense of React Server Components (Josh Comeau)](https://www.joshwcomeau.com/react/server-components/) — ★ 边界规则和客户端/服务端组合
- [RSC Streaming and Suspense (Rebecca DePrey)](https://rebeccamdeprey.com/blog/rsc-streaming-suspense) — ★ 流式渲染的完整模式分析
- [React Server Components Performance (DeveloperWay)](https://www.developerway.com/posts/react-server-components-performance) — CSR vs SSR vs RSC 的性能对比
- [Four Layers of Caching in Next.js (Reddit)](https://www.reddit.com/r/nextjs/comments/1d40srv/four_layers_of_caching_in_nextjs_14_server/) — 缓存层次讨论
- [React Suspense bundled with Server Components (Medium)](https://windmaomao.medium.com/react-suspense-bundled-with-server-components-9c13bde7d627) — Suspense + RSC 配合
- [Why use Suspense in RSC (StackOverflow)](https://stackoverflow.com/questions/78013664/why-use-suspense-in-react-server-components) — 社区讨论 RSC 中 Suspense 的必要性
- [Dan Abramov - Progressive JSON](https://overreacted.io/progressive-json/) — 流式 JSON 的设计理念
- [Dan Abramov - JSX Over The Wire](https://overreacted.io/jsx-over-the-wire/) — RSC 序列化的设计动机
