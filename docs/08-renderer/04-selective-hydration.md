---
title: "选择性水合与渐进式水合"
---


> 对应源码：[`packages/react-reconciler/src/ReactFiberHydrationContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHydrationContext.js), [`packages/react-reconciler/src/ReactFiberSuspenseContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberSuspenseContext.js)

## 同一页面的两面

服务器送来完整 HTML——用户立刻看到了页面。但页面还不能交互。因为交互需要 JavaScript：事件监听器、状态、React 的 Fiber 树。

"让 HTML 变成可交互的 React 应用"——这个过程叫水合（hydration）。

SSR HTML 到达浏览器
JavaScript 下载 + 执行
页面变为可交互 ← TTI (Time to Interactive)

## 传统水合的问题

React 17 之前，水合是**全有或全无**的：

```
必须等所有 JavaScript 下载完 → 才能开始水合 → 一次性水合整棵树

问题 1: 大组件阻塞小组件
  你的页面有 100 个组件
  其中 99 个很小，1 个很大（比如地图组件）
  → 必须等地图组件的 JS 下载完，才能水合任何组件
  → 页面在这段时间内完全不可交互

问题 2: 数据慢的组件阻塞数据快的组件
  组件 A 数据已就绪
  组件 B 数据还在请求
  → 必须等 B 的数据就绪，才能返回 HTML
  → A 的 HTML 也被延迟发送
```

## React 18 的解决方案：流式 SSR + 选择性水合

### 流式 SSR：先返回就绪的部分

```jsx
// 服务端
<Suspense fallback={<Spinner />}>
  <SlowComponent />   {/* 数据还没好 */}
</Suspense>
<FastComponent />     {/* 数据已就绪 */}
```

```
T=0ms:    流式返回 <html><body><FastComponent>
          流式返回 <Suspense><Spinner/>  ← fallback
T=2000ms: SlowComponent 数据就绪
          流式返回 <div>SlowComponent 的真实内容</div>
          流式返回 <script> 替换 Spinner</script>
```

不再等所有数据——先返回就绪的，慢的用 Suspense fallback 占位，数据就绪后流式补充。

### 选择性水合：按需水合

React 18 + Suspense + `hydrateRoot` 实现了选择性水合：

```
关键洞察：不是所有组件都需要在页面加载时立即交互

  首屏组件（导航栏、搜索框）→ 高优先级，立即水合
  下面的组件（评论区、推荐列表）→ 低优先级，可以晚点水合

  甚至更聪明：
  如果用户尝试点击一个还没水合的组件
  → React 立刻优先水合那个组件！
```

### 源码实现机制

选择性水合的核心在 `ReactFiberHydrationContext.js` 和 `ReactFiberSuspenseContext.js` 中：

hydrateRoot(container, <App />)
创建 FiberRoot，标记为需要水合
beginWork 遇到 Suspense 边界
→ pushPrimaryTreeSuspenseHandler
→ 如果子组件的 JS 还没加载 → 暂停水合该子树
→ 继续水合其他子树（不阻塞！）
子组件 JS 加载完成
→ resolve Suspense
→ 恢复该子树的水合
用户点击一个还没水合的元素
→ React 捕获事件（根容器上的委托监听器已注册）
→ 标记该组件为高优先级
→ SelectiveHydrationLane
→ 立即水合该组件所在子树
→ 水合完成后触发点击事件

### SelectiveHydrationLane

在 Lane 模型中有一个专门的 `SelectiveHydrationLane`：

```javascript
// packages/react-reconciler/src/ReactFiberLane.js:102
export const SelectiveHydrationLane: Lane = /*          */ 0b0000100000000000000000000000000;
```

当用户尝试与未水合的组件交互时，React 会用这个 Lane 提高该组件的水合优先级，让它跳过排队被优先处理。

## 实际效果：Wix 的案例

Wix 在生产环境中部署了选择性水合后，获得了显著效果（来源：[Wix Engineering Blog](https://www.wix.engineering/post/40-faster-interaction-how-wix-solved-react-s-hydration-problem-with-selective-hydration-and-suspen)）：

```
关键指标：
  JavaScript payload 减少 20%
  INP (Interaction to Next Paint) 改善 40%
  "Good INP" 比例从 <40% 提升到行业领先水平
```

### Wix 的实现方式

```jsx
// 用 Suspense + IntersectionObserver 延迟水合
function LazyHydrate({ children }) {
  const ref = useRef(null);
  const { promise, resolve } = useMemo(() => createPromise(), []);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        resolve();        // 进入视口 → 解除暂停
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <Suspense>
        <SuspenseInner promise={promise}>
          {children}
        </SuspenseInner>
      </Suspense>
    </div>
  );
}

function SuspenseInner({ children, promise }) {
  // 在客户端：promise 没 resolve 就 throw → Suspense 暂停
  // 在服务端：不 throw → 正常渲染 HTML
  if (typeof window !== 'undefined' && !promise.fulfilled) {
    throw promise;
  }
  return children;
}
```

React 19 中可以用 `use()` 替代手动 throw：

```jsx
function SuspenseInner({ children, promise }) {
  if (typeof window === 'undefined') {
    return children; // 服务端直接渲染
  }
  use(promise);     // 客户端用 use() 挂起
  return children;
}
```

## 渐进式水合的层次

React 的水合不是全有或全无（all-or-nothing）——它分多个层次逐步增强：

```
层次 0: 原始 HTML 到达浏览器
  → 内容已可见，但不可交互
  → 用户能阅读、滚动、查看布局

层次 1: JS 下载 + 解析
  → React 运行时 + 组件代码就绪
  → 还未 attach 事件监听器

层次 2: hydrateRoot 开始水合
  → 遍历组件树，attach 事件监听器
  → 但不是一次性水合全部——是分批的
  → Suspense 边界内的子树可以延迟水合

层次 3: 选择性水合
  → 优先水合首屏可见区域
  → 低优先级子树（如屏幕下方的评论区）稍后
  → 用户点击某区域 → 立即提升该区域优先级

层次 4: 完全水合
  → 所有子树完成水合
  → 整个应用完全可交互
  → 但如果某些子树从不进入视口，可能永远不被水合
```

每一层提升都让用户获得更多交互能力——这正是"渐进式"的含义：**不要等所有东西准备好才让用户开始用，先给能给的，再逐步补齐。**

## 下一步

- [ReactDOM 渲染流程](/08-renderer/01-dom-renderer) — ReactDOM 的 createRoot 和 hydrateRoot
- [Suspense 机制](/06-concurrent-features/02-suspense) — Suspense 机制如何支持流式渲染
- [RSC 架构原理](/09-react-server/01-rsc-architecture) — RSC 如何实现"零水合"

## 参考资料

- [Selective Hydration (patterns.dev)](https://www.patterns.dev/react/react-selective-hydration/) — React 18 选择性水合概念解释
- [40% Faster Interaction: Wix's Selective Hydration (Wix Engineering)](https://www.wix.engineering/post/40-faster-interaction-how-wix-solved-react-s-hydration-problem-with-selective-hydration-and-suspen) — ★ 生产环境实战，包含完整代码示例和 INP 改善数据
- [New in 18: Selective Hydration (React 18 WG)](https://github.com/reactwg/react-18/discussions/130) — 官方公告
- [New Suspense SSR Architecture in React 18](https://github.com/reactwg/react-18/discussions/37) — 流式 SSR + 选择性水合的完整架构说明
- [The Perils of Hydration (Josh Comeau)](https://www.joshwcomeau.com/react/the-perils-of-rehydration/) — 水合的常见陷阱和解决方案
- [150ms to 15ms: Optimizing React Hydration (Medium)](https://medium.com/better-dev-nextjs-react/150ms-to-15ms-optimizing-react-hydration-with-progressive-enhancement-92f87e974689) — 渐进式水合优化实战
- [Progressive Hydration (patterns.dev)](https://www.patterns.dev/react/progressive-hydration/) — 渐进式水合的策略和实现
- [React 19: What's New (Scrimba)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — React 19 中 use() 替代手动 throw promise
- [React 源码 ReactFiberHydrationContext.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHydrationContext.js) — 水合上下文源码
- [React 19 use() Hook Deep Dive (DEV)](https://dev.to/a1guy/react-19-use-hook-deep-dive-using-promises-directly-in-your-components-1plp) — use() 与水合的配合
