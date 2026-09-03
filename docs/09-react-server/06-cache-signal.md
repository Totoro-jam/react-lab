---
title: "cacheSignal：RSC 缓存的生命周期信号"
---


> 对应源码：[`ReactCacheImpl.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactCacheImpl.js) — `cache()` 和 `cacheSignal()` 实现

## 一个被浪费的请求

你在 React Server Components 中写了一个产品页：

```javascript
async function ProductPage({ id }) {
  const product = await fetch(`/api/products/${id}`).then(r => r.json());
  return <Product product={product} />;
}
```

这能工作。但有个问题——如果用户在 `fetch` 还没完成时就导航离开了，那个网络请求**仍在后台跑**。它在浪费带宽、占用数据库连接、拖慢整个服务器。

```
用户请求 /products/42:
  RSC 渲染开始 → fetch('/api/products/42') ← 数据库查询启动
  用户失去耐心，导航到 /products/43：
  RSC 请求中止 → 但 fetch 仍在后台运行 → 浪费带宽！
```

那如果手动传 `AbortSignal` 呢？

```javascript
const controller = new AbortController();
fetch(url, { signal: controller.signal });
// 什么时候 abort？
// 用户走了就 abort？但你怎么知道用户走了？
```

你需要一个信号：**"这次 RSC 渲染已经不需要了，请清理所有资源"**。这就是 `cacheSignal()` 要解决的问题。

## cache()：请求级去重

在理解 `cacheSignal` 之前，先理解它配套的 `cache()`。[React 19.2 官方文档](https://react.dev/blog/2025/10/01/react-19-2)明确了 `cache()` 是 RSC 的请求级去重原语：

```javascript
import { cache } from 'react';

const getUser = cache(async (id) => {
  return await db.users.get(id);
});

// 在同一个 RSC 请求中：
const user1 = await getUser('1');   // → 数据库查询
const user2 = await getUser('2');   // → 数据库查询（不同参数）
const user3 = await getUser('1');   // → 缓存命中！不查询
```

关键：`cache()` 是**请求级**的——缓存只在一次 RSC 渲染请求内有效。请求结束后缓存失效。这是与 `useMemo`（组件级）的本质区别：`cache()` 不跨请求。

## 源码实现

### 核心：CacheNode 树形结构

```javascript
// packages/react/src/ReactCacheImpl.js:12-41

const UNTERMINATED = 0;  // 未终止（正在计算）
const TERMINATED = 1;    // 已终止（有结果）
const ERRORED = 2;       // 出错了

type CacheNode<T> = {
  s: 0 | 1 | 2,           // 状态
  v: T | mixed,           // 值（成功时的返回值或错误时的 error）
  o: null | WeakMap,      // 对象参数缓存（用 WeakMap 因为非原始参数可能有大量引用）
  p: null | Map,          // 原始参数缓存（用常规 Map）
};
```

设计巧思：用对象（WeakMap）和原始值（Map）分离——对**所有参数**（对象和原始值）都可以作为缓存 key。

### cache(fn) 的实现

```javascript
// ReactCacheImpl.js:55-129

export function cache(fn) {
  return function () {
    const dispatcher = ReactSharedInternals.A;
    if (!dispatcher) {
      // ['★ 无 dispatcher → 不缓存（如客户端调用）']
      return fn.apply(null, arguments);
    }

    // 获取 cache-root（WeakMap，每个 fn 一个）
    const fnMap = dispatcher.getCacheForType(createCacheRoot);
    let cacheNode = fnMap.get(fn);
    if (cacheNode === undefined) {
      cacheNode = createCacheNode();
      fnMap.set(fn, cacheNode);
    }

    // 按参数逐层走 cache node 树
    for (let i = 0; i < arguments.length; i++) {
      const arg = arguments[i];
      if (typeof arg === 'function' || (typeof arg === 'object' && arg !== null)) {
        // 对象参数 → WeakMap
        let objectCache = cacheNode.o;
        if (objectCache === null) { cacheNode.o = objectCache = new WeakMap(); }
        const objectNode = objectCache.get(arg);
        if (objectNode === undefined) {
          cacheNode = createCacheNode();
          objectCache.set(arg, cacheNode);
        } else {
          cacheNode = objectNode;
        }
      } else {
        // 原始参数 → Map
        let primitiveCache = cacheNode.p;
        if (primitiveCache === null) { cacheNode.p = primitiveCache = new Map(); }
        const primitiveNode = primitiveCache.get(arg);
        if (primitiveNode === undefined) {
          cacheNode = createCacheNode();
          primitiveCache.set(arg, cacheNode);
        } else {
          cacheNode = primitiveNode;
        }
      }
    }

    // 根据 cacheNode 状态决定行为
    if (cacheNode.s === TERMINATED) {
      return cacheNode.v;          // ['★ 缓存命中']
    }
    if (cacheNode.s === ERRORED) {
      throw cacheNode.v;           // ['★ 重抛之前的错误']
    }

    // UNTERMINATED → 计算
    try {
      const result = fn.apply(null, arguments);
      cacheNode.s = TERMINATED;
      cacheNode.v = result;
      return result;
    } catch (error) {
      cacheNode.s = ERRORED;
      cacheNode.v = error;
      throw error;
    }
  };
}
```

### cacheSignal()

```javascript
// ReactCacheImpl.js:131-141

export function cacheSignal(): null | AbortSignal {
  const dispatcher = ReactSharedInternals.A;
  if (!dispatcher) {
    // 无 dispatcher → 返回 null
    return null;
  }
  return dispatcher.cacheSignal();  // ['★ RSC dispatcher 负责实际 abort signal 管理']
}
```

## 3. cacheSignal 解决的问题

[React 19.2 官方文档](https://react.dev/blog/2025/10/01/react-19-2) 列出的 `cacheSignal` 用途：在 RSC 缓存作用域结束时通知"即将被丢弃的自定义资源"。

核心场景：

```
RSC 请求开始 → cache scope 开始
  组件调用 getUser('123')
  → getUser 调用 db.fetch('user/123', { signal: cacheSignal() })
  → db.fetch 注册回调，开始从数据库读取

RSC 请求完成 / 失败 / 中断 → cache scope 结束
  → cacheSignal() 返回的 AbortSignal 触发 abort 事件
  → db.fetch 收到 abort → 取消数据库查询，清理资源
```

### 典型使用

```javascript
import { cache, cacheSignal } from 'react';

const dedupedFetch = cache(async (url) => {
  return await fetch(url, { signal: cacheSignal() });
});

async function ProductPage({ id }) {
  const data = await dedupedFetch(`/api/products/${id}`);
  return <Product product={data} />;
}
```

这样在 RSC 渲染完成或中断时，所有未完成的 fetch 会被自动 abort。

### 何时不需要 cacheSignal

- `cache()` 内部封装的 db 查询或 fetch 库内置了生命周期管理
- 单次同步操作不需要取消
- 简单的纯函数（不需要清理资源）

## 三个使用时机

`cacheSignal()` 返回的 AbortSignal 会在以下三种情况触发 abort：

```
情况 1：RSC 渲染成功完成
  → 所有 RSC 已生成 → 请求结束
  → cache scope 释放
  → AbortSignal abort

情况 2：RSC 渲染被中止（如用户导航离开了）
  → 路由切换导致请求 abort
  → cache scope abort
  → AbortSignal abort

情况 3：RSC 渲染失败（组件 throw error）
  → 错误传播到顶层
  → cache scope abort
  → AbortSignal abort
```

注释解释（ReactCacheImpl.js:133-138）：
> If there is no dispatcher, then we treat this as not having an AbortSignal since in the same context, a cached function will be allowed to be called but it won't be cached. So it's neither an infinite AbortSignal nor an already resolved one.

## 与 framework 的关系

`cache()` 和 `cacheSignal()` 都是**React 提供的 primitive**，实际生产使用主要在框架层：

| 角色 | 职责 |
| ------ | ------ |
| React core | `cache()` 提供 memoization / `cacheSignal()` 提供生命周期信号 |
| Next.js | 在 `cache()` 之上构建 `'use cache'` 指令、`cacheLife()`、`cacheTag()` 等 |
| Remix | 提供自己的 Cache primitive 包装 |
| 自建 RSC | 需要自己在 dispatcher 中实现 `getCacheForType` 和 `cacheSignal()` |

注意：`cache()` 不在 React 核心源码中实现完整逻辑——Memory cache 只是默认 dispatcher 的实现。标准化在不同 framework 上被替换为不同后端。

## 与 useMemo 的区别

```
useMemo                     cache
─────────────────────       ──────────────────
作用域：组件实例             作用域：RSC 请求
生命周期：组件挂载期间        生命周期：一次请求
客户端 / 服务端都可用         仅 RSC 环境有效
Hook                      普通函数
有依赖列表                 参数自动成为 key
可以使用 Reactive deps      可以直接缓存 async 函数
```

[React 19.2 Blog](https://react.dev/blog/2025/10/01/react-19-2) 中强调了 `cacheSignal` 是 `cache()` 的配套基础设施：

> "cacheSignal allows you to know when the `cache()` lifetime is over"

## 下一步

- [Partial Pre-rendering](/09-react-server/05-partial-prerendering) — Partial Pre-rendering 与 cache 的配合
- [自动批量更新](/06-concurrent-features/04-batching) — 客户端的 batching vs 服务端的 cache
- [React 设计哲学](/00-overview/04-design-philosophy) — React 的 Common Abstraction 原则如何体现于 cache

## 参考资料

- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — ★ cacheSignal 公告
- [React cache documentation (官方)](https://react.dev/reference/react/cache) — 官方 cache API 文档
- [React cacheSignal documentation (官方)](https://react.dev/reference/react/cacheSignal) — 官方 cacheSignal 文档
- [Next.js Caching Documentation](https://nextjs.org/docs/app/getting-started/caching) — framework 层面的 cache 策略
- [React 源码 ReactCacheImpl.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactCacheImpl.js) — 完整源码实现
- [React Source ReactFiberThenable.js 相关 (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThenable.js) — use hook 与 thenable 相关
- [React 19: What's New for Developers (Scrimba 2026)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — 2026 年状态总览
