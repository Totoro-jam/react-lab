---
title: "RSC 与 Suspense 边界：嵌套、流式、补水"
---


> 对应源码：[`ReactFiberSuspenseComponent.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberSuspenseComponent.js), [`ReactFiberThrow.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js)

## 1. Suspense 在 RSC 中的角色

在 React Server Components 架构中，Suspense 不仅是"loading 占位符"——它是组件树的**暂停/恢复调度机制**。它在多个层级发挥作用：

```
Server：
  async component 执行 → throw Promise → Suspense 捕获 → 流式输出 fallback → 数据就绪 → 流式输出真实内容

Client（hydration 阶段）：
  服务端已流式输出的 HTML 中含 Suspense 占位
  → hydration 时 React 知道哪些部分需要水合
  → 不同 Suspense 边界独立水合

Client（运行时）：
  Client Component 中 use(Promise) 或 use lazy() → throw Promise
  → Suspense 显示 fallback
  → Promise resolve → 重新渲染
```

[React 官方 Suspense 文档](https://react.dev/reference/react/Suspense) 详细描述了这些场景。

## 2. 三种触发源

Suspense 在以下场景被激活：

```
1. 数据获取（通过 use / Suspense-enabled data source）
   async function Comments() {
     const comments = await fetchComments();  // server-side
     return <List items={comments} />;
   }
   → 客户端收到 `<Suspense>` 包裹的 Comments → 显示 fallback → 数据就绪 → 渲染

2. 懒加载代码（React.lazy / 动态 import）
   const Chart = lazy(() => import('./Chart'));
   <Suspense fallback={<Spinner/>}><Chart/></Suspense>
   → chunk 加载中显示 fallback → 加载完成渲染

3. 慢资源（Suspensey resources, 比如 fonts、images）
   → 浏览器加载资源时 Suspense 自动显示 fallback
```

React 19 新增：`use()` hook 可以直接读 Promise 或 Context，在条件中调用——这是 Render 阶段的 Suspense 触发。

## 3. 嵌套 Suspense 边界

### 3.1 单层 Suspense

```jsx
<Suspense fallback={<Loading/>}>
  <Biography/>
  <Albums/>
</Suspense>
```

**整体一起揭示**——如果 Biography 或 Albums 任何一个 suspend，整个 children 被替换为 `Loading`。两个都 ready 后一起显示。

### 3.2 嵌套 Suspense

```jsx
<Suspense fallback={<BigSpinner/>}>
  <Biography/>
  <Suspense fallback={<AlbumsGlimmer/>}>
    <Panel><Albums/></Panel>
  </Suspense>
</Suspense>
```

**分层揭示**——Biography 和 Albums 独立加载：

1. 如果 Biography 还没好→ 显示 BigSpinner
2. Biography 就绪 → BigSpinner 消失，显示 Biography
3. 同时如果 Albums 没好 → 内层显示 AlbumsGlimmer
4. Albums 就绪 → 显示 Albums

### 3.3 边界粒度选择

```
边界过粗：用户体验差（一步到位变成"全部等"）
边界过细：动画过多（多个 spinner 同时闪）

最佳实践：
  - 用 Design 时定义的 loading 状态作为 Suspense 边界
  - 不要把边界放在每个组件外面
  - 区分"等待整片内容"vs"渐进加载更多内容"
```

## 4. Re-suspend 行为

如果已显示的 Suspense 内容**再次 throw promise**：

```
默认行为：
  → Suspense 边界回到显示 fallback
  → 已显示的内容"消失"——用户体验差

如果在 startTransition 内更新那么 React 会保留旧内容直到新内容就绪：
  startTransition(() => {
    setPage('/other-profile');  // 触发新 fetch
  })
  → 在新内容就绪前，旧内容继续显示
  → 不显示 fallback
  → 新内容就绪 → 才替换
```

### 4.1 已揭示内容的"消失"问题

```jsx
// 没有 startTransition → 切换时旧内容消失，显示 fallback
function navigate(url) {
  setPage(url);
}

// 有 startTransition → 保留旧内容直到新就绪
function navigate(url) {
  startTransition(() => {
    setPage(url);
  });
}
```

React 官方建议：路由库应该自动把导航包入 `startTransition`。这是 [React 官方 useTransition 文档](https://react.dev/reference/react/useTransition) 推荐的模式。

### 4.2 重置边界用 key

```jsx
// 切换不同 Profile 时不希望看到旧 Profile 内容
<Suspense fallback={<ProfileSkeleton/>}>
  <Profile id={currentId}/>
</Suspense>

// 如果 currentId 改为 2，但 Profile 的数据还没好 → 旧内容仍显示
// 解决方法：基于 id 给 Suspense 加 key

<Suspense fallback={<ProfileSkeleton/>} key={currentId}>
  <Profile id={currentId}/>
</Suspense>
```

key 变化时，React 把新的 Suspense 视为新的边界 → 必然回到 fallback。

## 5. 300ms 节流

> [React 19.2 官方文档](https://react.dev/blog/2025/10/01/react-19-2) 明确提到：**"React reveals suspended content at most once every 300ms, measured from the last reveal."**

如果多个 Suspense 边界在短时间内 ready：

- 第一个揭示时计时
- 300ms 内 ready 的其他边界会一起揭示（不一个个弹出）
- 300ms 过后下一个揭示时再计时

React 19.2 新增 SSR 场景的批量揭示节流——和这个客户端 300ms 节流互补对齐。

## 6. useDeferredValue 与 Suspense

`useDeferredValue` 可以避免在快速连续输入时显示 fallback——让 UI "滞后"显示旧结果：

```jsx
function App() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <Suspense fallback={<Loading/>}>
        <SearchResults query={deferredQuery} />
      </Suspense>
    </>
  );
}
```

行为：

- `query` 立即更新 → 输入框立即响应
- `deferredQuery` 滞后更新
- 在 `SearchResults` 加载新数据前，仍显示旧结果（带 `isStale` 指示）
- 不触发 fallback

## 7. SSR 中的 Suspense 边界

### 7.1 流式输出顺序

```
Server: renderToPipeableStream(<App/>)

输出顺序：
1. HTML shell（含 head/body、立即完成的求助找）
2. Suspense 边界的 fallback（暂时占位）
3. 当数据就绪 → 流式输出真实内容 + <script> 替换 fallback
```

### 7.2 React 19.2 的批量揭示

React 19.2 的 [Batching Suspense Boundaries for SSR](https://react.dev/blog/2025/10/01/react-19-2)：

- 之前：每个 Suspense 边界就绪立即流式揭示 → 内容"逐个弹出"
- 之后：短时间内的多个边界揭示批量发出 → 内容"一起出现"
- 启发式：检测总加载时间，接近 LCP 阈值（2.5s）时停止 batching → 立即揭示
- 目的：为实现 `<ViewTransition>` for Suspense 时一次性动画多块内容

## 8. 源码机制

### 8.1 throwException 路径

[ReactFiberThrow.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js) 中：

- 当组件 render 时 throw 一个 Promise (`thenable`)
- `throwException` 检测到 `value.then` 是函数
- 标记最近的 Suspense/Activity/SuspenseList 边界 → 设 `ShouldCapture` → 进入 suspended 状态
- 注册 `wakeable.then()` → resolve 时 ping → 重新渲染

### 8.2 Suspense 的状态

```
Suspense 边界的 flags:
  ShouldCapture → 等待被渲染（初次或恢复）
  DidCapture → 已捕获 → 用 fallback 渲染
  ForceClientRender → SSR 期间数据超时 → 客户端重渲染

边界工作流：
1. 子组件 throw promise
2. throwException 调用 getSuspenseHandler() 找到边界
3. 标记边界 ShouldCapture + 当前 fiber Incomplete
4. unwindWork retail到边界
5. 重新渲染边界 → 渲染 fallback
6. wakeable resolve → ping → 标记边界可以恢复
7. 重新渲染边界 → 渲染真实 children
```

### 8.3 嵌套时的优先级

如果多个嵌套边界中有挂起，**最内层先处理**（最近的边界捕获）。外层 Suspense 不感知直到内层 reassume 前再触发 fallback（如果 fallback 自身也 throw 则向上冒泡）。

## 9. 实践清单

| 场景 | 建议 |
| ------ | ------ |
| 页面切换 | 包入 `startTransition`，避免已揭示内容消失 |
| 切换 Profile 用 key | 主动 reset 边界，避免加载旧内容 |
| 异步搜索列表 | 用 `useDeferredValue` 保留旧结果 |
| 嵌套 Suspense | 层层递进，不上下一起等 |
| 边界粒度 | 等于 Design 时的 loading 状态 |
| RSC 流式输出 | 由 `<Suspense>` 自动提供 fallback 流式 |
| Fast scroll navigation | React Router 6+/Next.js 已自动包入 transition |

## 下一步

- [Partial Pre-rendering](/09-react-server/05-partial-prerendering) — Partial Pre-rendering 详细机制
- [cache() 与 cacheSignal](/09-react-server/06-cache-signal) — cacheSignal 与 cache() 生命周期
- [Suspense 机制](/06-concurrent-features/02-suspense) — Suspense 在客户端和 SSR 的完整实现

## 参考资料

- [React Suspense 官方文档](https://react.dev/reference/react/Suspense) — ★ React 19.2 最权威 API 文档
- [React Suspense for Data Fetching (Next.js)](https://rebeccamdeprey.com/blog/rsc-streaming-suspense) — ★ Stream + Suspense 模式
- [React Suspense bundled with Server Components (Medium)](https://windmaomao.medium.com/react-suspense-bundled-with-server-components-9c13bde7d627) — RSC 中的 Suspense
- [How to Handle React Suspense for Data Fetching (OneUptime)](https://oneuptime.com/blog/post/2026-01-24-react-suspense-data-fetching/view) — 数据获取调优
- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — 19.2 Batched reveals
- [React 19 Server Components Deep Dive (DEV)](https://dev.to/a1guy/react-19-server-components-deep-dive-what-they-are-how-they-work-and-when-to-use-them-2h2e) — 19 RSC 深度
- [Separating Events from Effects (官方)](https://react.dev/learn/separating-events-from-effects) — useEffectEvent 理念
- [React useTransition 文档](https://react.dev/reference/react/useTransition) — startTransition 机制
- [React Source ReactFiberSuspenseComponent.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberSuspenseComponent.js) — Suspense 内部
- [React Source ReactFiberThrow.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js) — throwException 实现
- [ReactFiberUnwindWork.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberUnwindWork.js) — 错误/Suspense 回退流转
- [Suspense: Work better with async data (BetterBugs)](https://www.betterbugs.io/blog/reactjs-suspense-async-data) — 实战示例
- [New Suspense SSR Architecture in React 18 (React WG #37)](https://github.com/reactwg/react-18/discussions/37) — SSR 流式架构
- [并发渲染相关 hooks 文档](https://react.dev/reference/react/useDeferredValue) — useDeferredValue
- [Suspensey resources](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) — Suspense 对资源加载的支持
