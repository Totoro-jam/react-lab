---
title: "View Transitions：React 与浏览器原生动画的集成"
---


> 对应源码：[`ReactFiberViewTransitionComponent.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberViewTransitionComponent.js), [`ReactFeatureFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactFeatureFlags.js)

## 1. 什么是 View Transition

[React Labs: View Transitions, Activity, and more](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) 公告了 `<ViewTransition>` 组件——React 与浏览器 [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API) 的原生集成。

浏览器 View Transition API 的工作原理：

1. 对当前 DOM 拍摄"旧快照"
2. 在 `startViewTransition(callback)` 中更新 DOM
3. 对更新后的 DOM 拍摄"新快照"
4. 用 CSS 动画在两个快照之间过渡（默认交叉淡入）

React 的 `<ViewTransition>` 组件就是把这个 API 用 React 的渲染模型包装起来——你声明"动画什么"和"什么时候动画"，React 和浏览器协作完成动画。

## 2. 状态：Canary / Experimental

> **重要**：`<ViewTransition>` 目前只在 React 的 [Canary 和 Experimental 通道](https://react.dev/reference/react/ViewTransition) 可用，尚未进入 stable。
>
> 源码中的 feature flag 状态：
>
> ```javascript
> // packages/shared/ReactFeatureFlags.js
> export const enableViewTransition: boolean = true;                    // 主体已默认启用
> export const enableViewTransitionParentEnterExit = __EXPERIMENTAL__;  // 父级 enter/exit 仍在实验
> export const enableViewTransitionForPersistenceMode: boolean = false; // Persistent 模式未启用
> ```
>
> React 19.2 stable 版本不包含 `<ViewTransition>`——仅 Canary 可用。

## 3. 三个触发器

`<ViewTransition>` 自己不会启动动画——动画由以下三种"触发器"激活：

```jsx
// 触发器 1：startTransition
startTransition(() => {
  setView('detail');  // 在 transition 内的状态更新 → 触发 ViewTransition 动画
});

// 触发器 2：useDeferredValue
const deferredQuery = useDeferredValue(query);
// query 变化时 → deferredQuery 延迟更新 → 触发 ViewTransition

// 触发器 3：Suspense 边界切换
<Suspense fallback={<Spinner />}>
  <Data />  {/* 数据就绪 → fallback 切换到内容 → 触发 ViewTransition */}
</Suspense>
```

注意：**普通的 `setState`（不在 transition 中）不会触发 ViewTransition**。只有上述三种异步更新路径才会。

## 4. 四种动画类型

React 根据 DOM 变化自动决定动画类型：

| 类型 | 触发条件 | 典型场景 |
| ------ | --------- | --------- |
| `enter` | `<ViewTransition>` 被插入 | 列表新增项、展开面板 |
| `exit` | `<ViewTransition>` 被删除 | 列表删除项、关闭面板 |
| `update` | DOM 属性变更或位置/尺寸变化 | props 变化、列表重排序 |
| `share` | 同名 `<ViewTransition>` 在删除和插入中配对 | 缩略图 → 全屏图查看 |

### 共享元素动画（share）

`share` 是最独特的——当用户从列表项进入详情页时，列表项的图片应该"飞到"详情页的位置。这通过给两边同名 `<ViewTransition>` 实现：

```jsx
<ViewTransition name={`photo-${id}`}>
  <img src={photo.url} />
</ViewTransition>
```

如果删除树中有 `name="photo-1"`，插入树中也有 `name="photo-1"`，React 自动配对播放 share 动画。

## 5. 源码内部机制

### 5.1 ViewTransitionComponent 工作原理

在 Fiber 架构中，`<ViewTransition>` 对应 `ViewTransitionComponent` (tag=30)：

```javascript
// ReactFiberViewTransitionComponent.js
export type ViewTransitionState = {
  autoName: null | string,    // 自动生成或显式的 view-transition-name
  paired: null | ViewTransitionState,  // commit 阶段配对状态
  clones: null | Array<Instance>,      // 克隆的 DOM 节点
  ref: null | ViewTransitionInstance,   // 当前 ref 实例
};
```

### 5.2 与 Commit 阶段的集成

React 的 View Transition 集成发生在 commit 阶段。参见 [`ReactFiberWorkLoop.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js) 中的 `commitRoot`：

```javascript
// 简化版 commitRoot 中的 ViewTransition 流程
if (enableViewTransition && shouldStartViewTransition) {
  pendingViewTransition = startViewTransition(
    suspendedState,
    root.containerInfo,
    pendingTransitionTypes,
    flushMutationEffects,      // 在 startViewTransition 回调中执行 DOM 变更
    flushLayoutEffects,
    flushAfterMutationEffects,
    flushSpawnedWork,
    flushPassiveEffects,
    ...
  );
} else {
  // 非 ViewTransition 路径：正常同步 flush
  flushMutationEffects();
  flushLayoutEffects();
  flushSpawnedWork();
}
```

关键流程：

```
1. React 检测到 transition 中有需要动画的 DOM 变更
2. React 调用浏览器的 startViewTransition(updateCallback)
   → 浏览器拍"旧快照"
3. 在 updateCallback 内部：
   a. flushMutationEffects() → 应用所有 DOM 变更
   b. 等待字体加载
   c. flushLayoutEffects() → componentDidMount/useLayoutEffect/refs
   d. 等待所有 pending Navigation 完成
   e. 测量布局变化，决定哪些边界需要动画
4. 浏览器拍"新快照"
5. ready Promise resolve → React 调用 onEnter/onExit/onUpdate/onShare
6. finished Promise resolve → React 调用 useEffect
```

### 5.3 Static Flags

`<ViewTransition>` 使用静态 flag 跟踪——确保 commit 阶段时知道哪些子树包含 ViewTransition 边界：

```javascript
// ReactFiberFlags.js
export const ViewTransitionStatic = 0b0000010000000000000000000000000;
// 与 PassiveStatic、LayoutStatic 等其他静态标记类似
// 跨渲染持续存在，用于 commit 阶段跳过无关子树
```

### 5.4 Transition Types

React 19.2 添加了 `addTransitionType` API（Canary），允许在同一 transition 中声明多种"类型"，`<ViewTransition>` 可以按类型匹配不同的动画：

```jsx
// 调用导航库内部
import {addTransitionType} from 'react';
addTransitionType('forward');

// 组件中按类型匹配
<ViewTransition
  default="none"
  enter={{
    "forward": 'slide-in',    // forward 类型用 slide-in
    "default": 'auto'          // 其他用默认
  }}
/>
```

源码中，Transition Types 通过 `pendingTransitionTypes` 管理：

```javascript
// ReactFiberWorkLoop.js
if (includesOnlyViewTransitionEligibleLanes(lanes)) {
  pendingTransitionTypes = claimQueuedTransitionTypes(root);
  passiveSubtreeMask = PassiveTransitionMask;
} else {
  pendingTransitionTypes = null;
  passiveSubtreeMask = PassiveMask;
}
```

## 6. CSS 定制

默认动画是交叉淡入。可以定制：

### 6.1 View Transition Class

```jsx
<ViewTransition
  enter="slide-up"
  exit="slide-down"
  default="none"  ← 关闭非指定的动画
/>
```

CSS 中：

```css
::view-transition-old(.slide-up) {
  animation: 300ms ease-out fade-out;
}
::view-transition-new(.slide-up) {
  animation: 300ms ease-in fade-in;
}
```

### 6.2 View Transition Events（JavaScript 动画）

```jsx
<ViewTransition
  onEnter={(instance, types) => {
    const anim = instance.new.animate(
      [{opacity: 0}, {opacity: 1}],
      {duration: 500}
    );
    return () => anim.cancel();  // 清理函数
  }}
/>
```

## 7. 与 Activity 的配合

`<Activity>` 和 `<ViewTransition>` 是天作之合——`<Activity>` 保持组件状态（不卸载），`<ViewTransition>` 负责动画：

```jsx
<Activity mode={isVisible ? 'visible' : 'hidden'}>
  <ViewTransition enter="auto" exit="auto" default="none">
    <Counter />  ← 状态保留，进出时动画
  </ViewTransition>
</Activity>
```

隐藏（`hidden`）时触发 `exit` 动画，显示（`visible`）时触发 `enter` 动画，而 `Counter` 内部的 count 状态不会被重置。

## 8. 限制与约束

```
1. 仅 DOM 环境：
   ReactFiberViewTransitionComponent.js 只在 DOM HostConfig 中实现
   React Native 暂不支持

2. flushSync 会跳过动画：
   动画依赖 startViewTransition 的异步特性
   如果中间有 flushSync → 跳过 transition

3. 只在顶层触发 enter/exit：
   <ViewTransition> 必须在 DOM 节点之前
   <div><ViewTransition>...</ViewTransition></div>  ← 不会触发！

4. 不是逐元素动画：
   浏览器是对整个"快照"做动画（交叉淡入/位移）
   不会逐个移动内部元素的位置
   这比逐元素动画性能更好，但可能缺少精细控制

5. prefers-reduced-motion 不会自动禁用：
   开发者需要用 @media (prefers-reduced-motion) 手动处理
```

## 下一步

- [Offscreen / Activity](/06-concurrent-features/05-offscreen) — `<Activity>` 组件与 ViewTransition 的配合
- [过渡更新 Transitions](/06-concurrent-features/03-transitions) — Transition 如何触发 ViewTransition 动画
- [关键设计决策](/00-overview/06-design-decisions) — 为什么 React 集成 View Transitions
- [Profiler 计时器](/12-internal-mechanisms/02-profiler-timer) — ViewTransition 对 Commit 阶段计时的影响

## 参考资料

- [React Labs: View Transitions, Activity, and more (官方博客)](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) — ★ ViewTransition 和 Activity 的官方公告
- [React `<ViewTransition>` API (官方文档 Canary)](https://react.dev/reference/react/ViewTransition) — ★ 完整 API 文档，含 Deep Dive "How does `<ViewTransition>` work?"
- [View Transitions in React, Next.js, and Multi-Page Apps (Rebecca DePrey)](https://rebeccamdeprey.com/blog/view-transition-api) — ★ `<ViewTransition>` 组件与手动 `startViewTransition` 对比
- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — 19.2 公告，含 Performance Tracks 中 ViewTransition 相关
- [API View Transition API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API) — 浏览器 View Transition API 原始文档
- [React 19: What's New for Developers (Scrimba 2026)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — 2026 年的 React 19 状态
- [React Source ReactFiberViewTransitionComponent.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberViewTransitionComponent.js) — 官方源码
- [React Source ReactFeatureFlags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactFeatureFlags.js) — enableViewTransition flag
- [React Source ReactFiberFlags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberFlags.js) — ViewTransitionStatic flag 定义
