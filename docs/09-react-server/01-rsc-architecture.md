---
title: "React Server Components 架构"
---



> 对应源码：[`packages/react-server/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server), [`packages/react-server-dom-webpack/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-webpack)

## 1. 你的组件代码在跑两遍

你的产品页有一个组件树：导航栏、产品列表、评论区。你用了 SSR，所以用户打开页面就能看到完整 HTML。但客户端还需要：

1. 下载所有组件的 JavaScript 代码（即使这些组件只为渲染 HTML 服务，之后不会再交互）
2. 在浏览器里重新执行这些组件函数（hydration）
3. 给每个组件绑定事件监听器

导航栏组件不会交互——它只是个静态 HTML。但它 30KB 的代码（含所有子组件依赖）还是要下载、解析、执行。**为什么客户端要为一个已经渲染好的静态 HTML 下载组件代码？**

2020 年，React 团队给了答案：[Server Components](https://tonyalicea.dev/blog/understanding-react-server-components/)。组件代码在服务端执行后，只发送渲染结果（Flight 数据）给客户端——**服务端组件的 JavaScript 代码永远不会到客户端**。

```
传统 SSR:
  服务端执行组件 → 生成 HTML → 发给客户端
  客户端还要下载 JS + 重新执行组件 → hydration
  → 组件代码在服务端和客户端都执行了

RSC:
  服务端执行组件 → 生成 [Flight 数据](https://tonyalicea.dev/blog/understanding-react-server-components/)（序列化的 Element 树）
  客户端从 Flight 数据重建 Element 树 → 渲染
  → 服务端组件的 JS 代码不发送到客户端
  → 客户端不需要重新执行服务端组件
```

## 2. 五种"渲染"的定义

```
1. Classical Client-Side: 浏览器计算布局、绘制像素
2. React Client-Side: 在浏览器执行组件函数构建 Virtual DOM
3. Classical Server-Side: 服务端生成 HTML 字符串
4. React Server-Side SSR: 服务端执行组件生成 HTML + 客户端 hydrate
5. React Server-Side RSC: 服务端执行组件生成 Flight payload → 客户端重建 Virtual DOM
```

## 3. 组件类型

```
Server Component（默认，无需标记）:
  ✓ 直接访问数据库、文件系统
  ✓ 不发送到客户端（bundle 减小）
  ✗ 没有 state、event handler、浏览器 API
  ✗ 不能使用 useState/useEffect

Client Component ('use client'):
  ✓ 有 state、event handler
  ✓ 发送到客户端
  ✗ 不能直接访问数据库

注意：
  'use server' 是 Server Actions 的指令（标记可在服务端执行的函数）
  不是用来标记 Server Component 的
  Server Component 就是默认行为，无需任何指令
```

## 4. RSC 渲染流程

```
Server:
  executeServerComponent()
    → Component 执行 → 返回 JSX
    → 序列化为 Flight 格式

Flight Payload 示例:
  ["$","div",null,{"children":
    ["$","h1",null,{"children":"Hello"}]
  }]

  $ → React 元素标记
  "div" → type
  null → key
  {"children":...} → props

  特殊标记:
  "$L" → Lazy 模块引用（Client Component 通过此标记引用）
  "$S" → Symbol 引用（如 Symbol.for 注册的全局符号）
  "$@" → Promise 引用（异步数据）
  "$h" → Server Action 引用（'use server' 函数）
  "$D" → Date 序列化
  "$Y" → 延迟对象（Deferred）
  "$undefined" / "$NaN" / "$Infinity" → 特殊值

Client:
  parseFlightPayload()
    → 重建 React Element 树
    → Client Component 的引用被实际的 JS 模块替换
    → 正常的 Reconciler 渲染流程
```

## 5. "Double Data" 问题

RSC 在有 SSR 的情况下会同时发送两种数据：

```
一次 RSC + SSR 请求返回:
  1. HTML（浏览器立即渲染）→ 快速首屏
  2. Flight Payload（React 重建 Virtual DOM）→ 后续交互

两种格式有冗余（同样的信息被编码两次）
但压缩后冗余开销可接受
```

> 想深入了解 RSC 在 React 19 中的演进，推荐阅读 [React 19 Deep Dive (QED42)](https://www.qed42.com/insights/reacts-latest-evolution-a-deep-dive-into-react-19)。

## 下一步

- [Flight 协议](/09-react-server/02-flight-protocol) — RSC 的序列化协议
- [Server Actions](/09-react-server/03-server-actions) — Server Actions 的实现
- [RSC 缓存与流式渲染](/09-react-server/04-rsc-caching-streaming) — RSC 缓存策略与流式渲染

## 参考资料

- [Understanding React Server Components (Tony Alicea)](https://tonyalicea.dev/blog/understanding-react-server-components/) — 最详细的 RSC 分析
- [React 19 Deep Dive (QED42)](https://www.qed42.com/insights/reacts-latest-evolution-a-deep-dive-into-react-19) — RSC + Actions
