---
title: "Flight 协议"
---



> 对应源码：[`packages/react-server-dom-webpack/src/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-webpack/src)

## 1. Flight 是什么

Flight 是 React Server Components 的**序列化协议**。它将服务端执行的组件树序列化为一种紧凑的文本格式，客户端解析后重建 React Element 树。要深入理解 Flight 格式的设计动机，推荐阅读 [Understanding React Server Components (Tony Alicea)](https://tonyalicea.dev/blog/understanding-react-server-components/)。

## 2. 格式示例

一个简单的 Server Component：

```jsx
// Server Component
export default function Home() {
  return (
    <main>
      <h1>Hello World</h1>
      <ClientButton onClick={() => {}} />
    </main>
  );
}
```

序列化后的 Flight 数据（简化）：

```
["$","main",null,{"children":[
  ["$","h1",null,{"children":"Hello World"}],
  ["$","button",null,{"onClick":...,"children":"Click"},"$1"]
]}]
```

格式说明：

- `$` = React Element 的标记
- `"main"` = type
- `null` = key
- `{...}` = props
- `"$1"` = Client Component 模块引用（需要客户端代码）

## 3. 特殊标记

基于 `ReactFlightServer.js` 源码中的 `serializeXxx` 函数，Flight 特殊标记如下：

```
Flight 特殊标记（值以 $ 开头的转义序列，源自 ReactFlightServer.js）:

元素/引用标记：
  $      → 值引用（$ + 十六进制 chunk ID，即 serializeByValueID）
  $L     → Lazy 模块引用（$L + hex，serializeLazyID，用于 Client Component）
  $h     → Server Action 引用（$h + hex，serializeServerReferenceID，'use server' 函数）

类型序列化标记：
  $S     → Symbol 引用（$S + name，serializeSymbolReference，如 $Sreact.element）
  $@     → Promise 引用（$@ + hex，serializePromiseID，异步数据）
  $w     → Weak Promise 引用（$w + hex，serializeWeakPromiseID）
  $Z     → Error 引用（$Z + hex 或裸 $Z，serializeErrorValue）
  $T     → Template 引用（$T + reference，serializeTypedArrayReference）
  $Y     → 延迟对象（$Y + hex 或裸 $Y，serializeDeferredObject）
  $D     → Date 序列化（$D + ISO date string，serializeDate）
  $n     → BigInt 序列化（$n + decimal string，serializeBigInt）

集合类型标记：
  $Q     → Map 序列化（$Q + hex chunk ID）
  $W     → Set 序列化（$W + hex chunk ID）
  $K     → FormData 序列化（$K + hex chunk ID）

流式标记：
  $B     → ReadableStream / Blob 引用（$B + hex chunk ID）

特殊值标记：
  $-0 / $Infinity / $-Infinity / $NaN → 特殊数字
  $undefined                            → undefined

示例流式 Flight 序列:
  行1: $Sreact.startTransition
  行2: 空行
  行3: 0:["$","main",null,{...}]       ← 数组中的 "$" = REACT_ELEMENT_TYPE
  行4: 1:L2          ← $L2 = Lazy 模块引用（Client Component）
  行5: 2:["$","div",null,{...}]          ← 数据就绪后到达
```

## 4. 流式解析

```
客户端收到 Flight 流:

T=0:    收到行3 → 解析出 <main><h1>Hello</h1></main>
T=0:    收到行4 → L2 → 标记为 Lazy → 触发 Suspense fallback
T=500:  收到行5 → 解析出<div>...</div> → Lazy resolve
T=500:  Suspense 切换：fallback → 真实内容

Flight 天然支持流式，这与 [React 18 的流式 SSR 架构](https://github.com/reactwg/react-18/discussions/37)一脉相承：
  每行是独立的 JSON
  前面的行可以先解析和渲染
  后面的行到达后更新
```

## 5. 模块的延迟加载

Client Component 在 Flight 中只引用模块 ID，不内联代码：

```
Flight: ["$","button",null,{...},"@1"]
  "@1" → 模块引用 → 映射到客户端已有的 JS bundle

如果模块还没加载:
  → 动态 import 模块
  → 加载完成后渲染 Client Component
```

这是 RSC 减小客户端 bundle 的核心——服务端组件不发送任何 JS，客户端组件只发送被引用的模块。[React 19](https://www.qed42.com/insights/reacts-latest-evolution-a-deep-dive-into-react-19) 对此做了进一步优化。

## 下一步

- [Server Actions](/09-react-server/03-server-actions) — Server Actions 的实现
- [RSC 缓存与流式渲染](/09-react-server/04-rsc-caching-streaming) — RSC 缓存策略与流式渲染
- [RSC 中的 Suspense 边界](/09-react-server/07-rsc-suspense-boundaries) — RSC 中 Suspense 边界的详细分析

## 参考资料

- [Understanding React Server Components (Tony Alicea)](https://tonyalicea.dev/blog/understanding-react-server-components/) — Flight 格式详解
- [React 19 Deep Dive](https://www.qed42.com/insights/reacts-latest-evolution-a-deep-dive-into-react-19)
- [RSC Payload Parser (Alvar Lagerlöf)](https://github.com/alvarlagerlof/rsc-parser) — Flight 解析工具
