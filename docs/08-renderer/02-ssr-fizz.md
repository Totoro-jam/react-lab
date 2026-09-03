---
title: "SSR 渲染（Fizz）"
---



> 对应源码：[`packages/react-dom/src/server/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-dom/src/server), [`packages/react-server-dom-webpack/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-webpack)

## 1. SSR 的两种模式

```
传统 SSR（React 16-17）:
  renderToString(element) → 返回完整 HTML 字符串
  → 客户端 hydrate（重新执行所有组件代码）
  问题：必须等所有数据准备好才能返回 HTML

流式 SSR（React 18+）:
  renderToPipeableStream(element)
  → 流式返回 HTML chunks
  → [Suspense](https://react.dev/reference/react/Suspense) 边界允许部分内容先返回
  → 数据就绪后流式补充剩余内容

```

> React 18 引入了[全新的 SSR 架构](https://github.com/reactwg/react-18/discussions/37)，支持流式输出和选择性水合。

## 2. 流式 SSR 的工作方式

```
Server:
<html>
<head>...</head> ← 立即流式返回
<body>
<header>Nav</header> ← 立即返回（无Suspense包裹）
<Suspense fallback={<Spinner/>}>
<Comments />  ← 需要等数据
</Suspense>
</body>
Timeline:
T=0:    流式返回 <html><head><body><header>Nav</header>
T=0:    流式返回 <div hidden id="B:1"><!--$-->  ← Suspense 占位符
T=0:    流式返回 <div class="spinner"></div>     ← fallback UI
T=0:    流式返回 <!--/$--></div>
T=0:    流式返回 <script>...</script>           ← hydration JS
T=2s:   数据就绪
T=2s:   流式返回 <div hidden id="B:1">
T=2s:   <template>...Comments HTML...</template>
T=2s:   <script>$RC("B:1")</script>            ← 替换 fallback 为真实内容
```

## 3. Hydration

[Hydration](https://www.joshwcomeau.com/react/the-perils-of-rehydration/) 是将服务端返回的 HTML 与客户端 React 状态连接的过程：

```
SSR 返回的 HTML:
  <div data-reactroot>
    <span>Hello</span>
    <button>Click</button>
  </div>

客户端 hydrate:
  → React 遍历组件树（与 render 类似）
  → 不创建 DOM（DOM 已存在）
  → 而是 attach 事件监听器
  → 验证 server HTML 和 client render 是否一致
  → 如果不一致 → warning（开发模式）

React 18 [Selective Hydration](https://www.patterns.dev/react/react-selective-hydration/)：
  → 用户点击某个区域 → 优先 hydrate 那个区域
  → 不需要等待整页 hydrate 完成
```

## 下一步

- [选择性水合](/08-renderer/04-selective-hydration) — 选择性水合
- [完整水合生命周期](/08-renderer/05-hydration-complete) — 完整水合生命周期
- [自定义渲染器](/08-renderer/03-custom-renderer) — 自定义渲染器

## 参考资料

- [New Suspense SSR Architecture in React 18](https://github.com/reactwg/react-18/discussions/37)
- [The Perils of Hydration (Josh Comeau)](https://www.joshwcomeau.com/react/the-perils-of-rehydration/)
- [Selective Hydration (patterns.dev)](https://www.patterns.dev/react/react-selective-hydration/)
