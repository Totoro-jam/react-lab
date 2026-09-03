---
title: "Server Actions：从客户端调用服务端函数"
---


> 对应源码：[`packages/react-server-dom-webpack/src/ReactFlightWebpackNodeRegister.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-server-dom-webpack/src/ReactFlightWebpackNodeRegister.js), Dan Abramov 的 [What Does "use client" Do?](https://overreacted.io/what-does-use-client-do/) 和 [Impossible Components](https://overreacted.io/impossible-components/)

## 如果函数能跨网络传递呢

你在客户端组件里写了 `<form action={createPost}>`。`createPost` 需要访问数据库——它绝不能在客户端运行。但你希望调用它像调用本地函数一样自然。

Server Actions 就是这个——**一个在服务端执行，但可以从客户端代码直接调用的函数**。

```jsx
// app/actions.ts
'use server'  ← 这个指令告诉打包器：这个函数是服务端的

export async function createPost(formData: FormData) {
  const title = formData.get('title');
  await db.posts.create({ title });
  revalidatePath('/posts');
}
```

```jsx
// app/page.tsx ← Server Component
import { createPost } from './actions';

export default function Page() {
  return (
    <form action={createPost}>
      <input name="title" />
      <button type="submit">Create</button>
    </form>
  );
}
```

用户提交表单 → `createPost` 在服务端执行 → 数据库写入 → 重新验证缓存 → 返回新 UI。

没有 API 路由。没有 `fetch`。没有 JSON 序列化。客户端代码里只有一个函数引用。

## "use server" 做了什么

> Dan Abramov 在 [What Does "use client" Do?](https://overreacted.io/what-does-use-client-do/) 中解释了 `'use client'` 和 `'use server'` 的语义。

`'use server'` 是一个**编译时指令**——它不做任何运行时的事情。打包器（webpack/turbopack）看到这个指令后：

```
'use server' 在文件顶部 → 所有 export 的 async 函数都是 Server Actions
  → 打包器为每个函数生成一个唯一 ID
  → 客户端侧：函数被替换为一个"引用代理"（proxy）
  → 服务端侧：函数保留完整实现
  → 客户端调用代理 → 代理发送 POST 请求到服务端 → 服务端执行真正的函数
```

### 两种使用方式

```javascript
// 方式 1：模块级别 'use server'
'use server'  ← 整个文件的 export 都是 Server Actions

export async function createPost(formData) { ... }
export async function deletePost(id) { ... }


// 方式 2：函数级别 'use server'
async function createPost(formData) {
  'use server'  ← 只有这个函数是 Server Action
  // ...
}
```

模块级别更常见——一个 `actions.ts` 文件包含所有 Server Actions，客户端和服务器都可以导入。

## 从客户端调用 Server Actions

Server Actions 不限于 `<form>`。它们可以从任何客户端代码调用：

```jsx
'use client';
import { likePost } from './actions';
import { useTransition, useOptimistic } from 'react';

export function LikeButton({ postId, initialLikes }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticLikes, addOptimisticLike] = useOptimistic(initialLikes);

  return (
    <button
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          addOptimisticLike(n => n + 1);  // 立刻显示
          await likePost(postId);           // 服务端执行
        });
      }}
    >
      👍 {optimisticLikes}
    </button>
  );
}
```

### progressive enhancement（渐进增强）

> [Next.js Server Actions 文档](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) 详细说明了渐进增强的行为。

当 Server Action 用在 `<form action={...}>` 上时：

```
JS 已加载（水合完成）：
  → 表单提交被 React 拦截
  → 通过 fetch 发送 POST 请求到服务端
  → 不刷新页面
  → 收到 Flight 响应 → 更新 UI

JS 还没加载（或被禁用）：
  → 表单正常提交（浏览器原生行为）
  → POST 请求到相同 URL
  → 服务端处理 → 返回新 HTML
  → 页面刷新

两种场景都能工作——这就是 progressive enhancement。
```

## 与 React Hooks 的集成

Server Actions 与 React 19 的几个新 Hooks 天然配合：

```
useActionState
  → 管理 Action 的状态（result、isPending、error）
  → 串行队列：多次调用依次执行
  → 参考 ../04-hooks-internals/08-react19-hooks.md

useOptimistic
  → 在 Action 执行期间显示乐观状态
  → Action 完成后恢复真实状态
  → 参考 ../04-hooks-internals/08-react19-hooks.md

useFormStatus（react-dom）
  → 获取表单提交状态（pending、data、method、action）
  → 在表单内部组件中使用

<form action={...}>
  → React 自动包裹在 startTransition 中
  → 不需要手动调 startTransition
```

## 闭包与加密

Server Actions 可以捕获组件作用域的变量：

```jsx
export default function Page() {
  const publishVersion = await getLatestVersion();

  async function publish(formData) {
    'use server';
    // publishVersion 被闭包捕获
    if (publishVersion !== await getLatestVersion()) {
      throw new Error('Version changed');
    }
    // ...
  }

  return <form action={publish}><button>Publish</button></form>;
}
```

这些被捕获的变量需要发送到客户端再传回服务端。为了安全，Next.js **自动加密**闭包变量——每次 build 生成新的加密密钥。这意味着不同 build 的 Server Actions 不能互相调用。

## 安全考量

```
Server Actions = 公开的 HTTP 端点
  → 任何人都可以用 POST 请求调用
  → 必须做认证和授权检查

最佳实践：
  1. 在 Action 内部验证用户身份
  2. 验证输入（用 zod 等）
  3. 不要把敏感数据放在闭包中传递
  4. Next.js 默认比较 Origin 和 Host header 防 CSRF
```

## 与 RSC 的关系

```
RSC 关注的是"渲染"：
  Server Component → Flight Payload → 客户端重建 Virtual DOM
  → 双向数据：server → client

Server Actions 关注的是"变更"（mutation）：
  客户端调用 → POST 请求 → 服务端执行 → 返回 Flight Payload（含新 UI）
  → 双向数据：client → server → client

一次 Server Action 调用的完整流程：
  1. 客户端调用 createPost(formData)
  2. React 把 formData 序列化 → POST 请求
  3. 服务端执行 createPost → 写入数据库 → revalidatePath
  4. 服务端重新渲染相关 Server Components → 生成新 Flight Payload
  5. 客户端解析 Flight → 更新 Virtual DOM → 更新 UI
  6. 用户看到新内容，没有页面刷新
```

这就是 Dan Abramov 说的 "One Roundtrip Per Navigation" 理念在 mutation 场景的体现——一个 POST 请求完成"执行 + 重新渲染 + 返回新 UI"。

## 下一步

- [RSC 架构原理](/09-react-server/01-rsc-architecture) — RSC 架构原理
- [Flight 协议](/09-react-server/02-flight-protocol) — Flight 序列化协议
- [React 19 新 Hooks](/04-hooks-internals/08-react19-hooks) — useActionState 和 useOptimistic 的内部机制
- [自动 Memoization 内部机制](/10-react-compiler/01-compiler-internals) — React Compiler 如何优化 Server Actions

## 参考资料

- [What Does "use client" Do? (Dan Abramov)](https://overreacted.io/what-does-use-client-do/) — ★ 'use client' 和 'use server' 的语义解释
- [Impossible Components (Dan Abramov)](https://overreacted.io/impossible-components/) — ★ 跨服务端/客户端组合的"不可能"场景
- [JSX Over The Wire (Dan Abramov)](https://overreacted.io/jsx-over-the-wire/) — Server Actions 如何序列化
- [One Roundtrip Per Navigation (Dan Abramov)](https://overreacted.io/one-roundtrip-per-navigation/) — 单次 round-trip 的设计理念
- [Server Actions and Mutations (Next.js 文档)](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) — ★ 完整使用指南和最佳实践
- [Next.js Server Actions: The Complete Guide 2026 (MakerKit)](https://makerkit.dev/blog/tutorials/nextjs-server-actions) — 2026 年的完整生产指南
- [React 19 Deep Dive (QED42)](https://www.qed42.com/insights/reacts-latest-evolution-a-deep-dive-into-react-19) — Actions 和 Server Actions 在 React 19 中的演变
- [React 19: What's New (Scrimba)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — React 19.0-19.2 全部新特性
- [React Server Components, without a framework? (Tim's Tech Blog)](https://timtech.blog/posts/react-server-components-rsc-no-framework/) — ★ 不用框架实现 RSC + Server Actions 的深度实验
- [React Server Components: Do They Really Improve Performance? (Nadia Makarevich)](https://www.developerway.com/posts/react-server-components-performance) — CSR vs SSR vs RSC 性能对比
- [Next.js 16 Performance: Server Components Guide (Digital Applied)](https://www.digitalapplied.com/blog/nextjs-16-performance-server-components-guide) — 2026 年 RSC + Turbopack 性能指南
- [RSC and Server Action bundle practice (web-infra-dev)](https://github.com/orgs/web-infra-dev/discussions/23) — RSC 打包实践讨论
- [Making Sense of React Server Components (Josh Comeau)](https://www.joshwcomeau.com/react/server-components/) — RSC 的动机和边界规则
- [Understanding React Server Components (Tony Alicea)](https://tonyalicea.dev/blog/understanding-react-server-components/) — RSC 深度分析
