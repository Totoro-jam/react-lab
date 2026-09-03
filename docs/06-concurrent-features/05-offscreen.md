---
title: "Offscreen / Activity 组件"
---



> 对应源码：[ReactFiberActivityComponent.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberActivityComponent.js)（原 `ReactFiberOffscreenComponent.js`）

## 1. 什么是 Offscreen/Activity

`<Offscreen>` 最早在 React 18 开发周期中提出，后在源码中改名为 `<Activity>`。**React 19.2 正式将 `<Activity>` 作为稳定 API 发布**——不再是实验性特性。[React 19.2 官方博客](https://react.dev/blog/2025/10/01/react-19-2)对其有完整说明。[React v18.0 博客](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)中提到了原始的 Offscreen 设计目标。

```jsx
// React 19.2 稳定用法
import { Activity } from 'react';

// 替代条件渲染：
// 之前：{tab === 'a' && <PanelA />}
// 之后：
<Activity mode={tab === 'a' ? 'visible' : 'hidden'}>
  <PanelA />
</Activity>
<Activity mode={tab === 'b' ? 'visible' : 'hidden'}>
  <PanelB />
</Activity>
```

`<Activity>` 目前支持两种模式：

- `visible`：正常渲染，mount effects，正常处理更新
- `hidden`：隐藏子树，unmount effects，推迟所有更新直到没有其他工作要做

> 未来计划添加更多模式（如 `prerender`）用于不同场景。

## 2. 工作原理

```
mode="visible":
  正常渲染，组件树出现在 DOM 中

mode="hidden":
  组件树仍存在于 DOM 中（通过 display:none 隐藏，不是移除）
  Fiber 树和 state 保存在内存中
  所有 Effect 被 cleanup（useEffect/useLayoutEffect 的 destroy 函数执行）
  子组件仍会重新渲染响应新 props（但以低优先级）
  切换回 visible 时恢复 state 并重新创建 Effect

效果：
  从 PanelA 切到 PanelB 再切回 PanelA
  PanelA 的 state（输入框内容、滚动位置等）保持不变
  不需要手动 state 持久化
```

## 3. WorkTag 演变

在源码中可以看到：

- `OffscreenComponent = 22`
- `ActivityComponent = 31`

React 团队在探索 [Offscreen](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberActivityComponent.js) 的过程中将其重命名为 Activity，但底层机制相同。

## 4. 使用场景

> [Suspense RFC](https://github.com/reactjs/rfcs/blob/main/text/0213-suspense-in-react-18.md) 中描述了 Offscreen 与 Suspense 配合实现平滑过渡的场景。

- 标签页切换时保持各Tab的 state
- 路由切换时保持前一个页面的 state
- 预渲染即将出现的 UI
- 与 Suspense 配合实现平滑过渡

## 5. 内部实现：从 mode 到 Fiber

`<Activity>` 在源码中映射为 `ActivityComponent`（WorkTag=31）。[React 官方文档](https://react.dev/reference/react/Activity) 和 React 19.2 博文对其行为有完整说明。

### beginWork 中的处理

`updateActivityComponent`（`ReactFiberBeginWork.js:1144-1193`）根据 `mode` prop 分两条路径：

```javascript
// 简化版
function updateActivityComponent(current, workInProgress, renderLanes) {
  const nextProps = workInProgress.pendingProps;  // { mode, children }

  if (current === null) {
    // === Mount ===
    if (getIsHydrating()) {
      if (nextProps.mode === 'hidden') {
        // SSR 没有渲染 hidden Activity → 不需要水合，用 OffscreenLane 延迟
        const child = mountActivityChildren(workInProgress, nextProps, renderLanes);
        workInProgress.lanes = laneToLanes(OffscreenLane);
        return bailoutOffscreenComponent(null, child);
      } else {
        // visible → 正常水合
        return mountDehydratedActivityComponent(workInProgress, dehydrated, renderLanes);
      }
    }
    // 非水合场景的正常 mount
    return mountActivityChildren(workInProgress, nextProps, renderLanes);
  }

  // === Update ===
  // 检查是否从 dehydrated 状态恢复
  if (prevState !== null) {
    return updateDehydratedActivityComponent(current, workInProgress, ...);
  }
  // 正常更新路径
  return updateActivityChildren(...);
}
```

### `mode="hidden"` 如何工作：三个机制

```
mode="hidden" 时的三个内部机制：

1. Visibility flag
   ─ completeWork 阶段为 children 标记 Visibility flag
   ─ ReactDOM 通过 display:none 隐藏 DOM（不删除 DOM！）
   ─ DOM state（textarea 文本、滚动位置）自动保留

2. OffscreenLane 优先级
   ─ 整个子树的更新被分配 OffscreenLane（bit 29）
   ─ OffscreenLane 优先级几乎最低（仅高于 DeferredLane）
   ─ ensureRootIsScheduled 会优先处理高优先级任务
   ─ 效果：hidden 子树只在"没有更紧急的工作时"才更新

3. Effect 清理
   ─ 切到 hidden 时，React 执行所有 useEffect/useLayoutEffect 的 cleanup
   ─ 概念上等效于 unmount（但 state 和 DOM 保留）
   ─ 回到 visible 时，重新执行 effect 的 create 函数
```

### Fragment 包装

和 Suspense 一样，Activity 用一个 Fragment fiber 包装 children。这个 Fragment 的 `memoizedState` 存储了 `OffscreenState`：

```javascript
// ReactFiberOffscreenComponent.js 中的类型
type OffscreenState = {
  baseLanes: Lanes,       // 子树的基准优先级
  cachePool: SpawnCachePool | null,  // 缓存池
};
```

`baseLanes` 决定了子树内更新的最低优先级。当 Activity 处于 hidden 状态时，`baseLanes` 被提升为 `OffscreenLane`，确保子树更新被延迟。

## 6. 预渲染：提前加载隐藏内容

Activity 不只是"隐藏已有的内容"——它能预渲染尚未展示的内容：

```jsx
const [tab, setTab] = useState('home');

// 首次渲染时 Posts 组件已经在预渲染（低优先级 + 无 effects）
<Activity mode={tab === 'home' ? 'visible' : 'hidden'}>
  <Home />
</Activity>
<Activity mode={tab === 'posts' ? 'visible' : 'hidden'}>
  <Posts />  {/* 首次加载时已预渲染，用户点击后立即展示 */}
</Activity>
```

预渲染期间，`Posts` 会执行组件函数、加载需要的数据（如果使用了 `use`/Suspense），但不会 mount effects。这意味着：数据加载提前开始，用户切换标签时无需等待。

> 注意：只有通过 `use` 或Suspense 触发的数据获取才会在预渲染期间执行。`useEffect` 内部的数据获取不会预渲染——因为 hidden 状态下 effects 被清理。

## 7. 选择性水合：加速首屏交互

Activity 不需要 `mode="hidden"` 也能提升水合性能。即使永远 visible，Activity 边界也能将组件树分割为独立的水合单元：

```jsx
// 不带 mode 也能受益于选择性水合
<Activity>
  <Comments />  {/* 可以独立于 <Post> 先水合 */}
</Activity>
```

[React 19.2 官方博客](https://react.dev/blog/2025/10/01/react-19-2)指出，Activity 边界和 Suspense 边界一样参与选择性水合。React 能先水合 tab 按钮，再在空闲时水合各 tab 内容——即使页面不使用多个 Suspense。

## 8. 隐藏内容的副作用陷阱

`display: none` 保留了 DOM 但不阻止 DOM 副作用。`<video>`、`<audio>`、`<iframe>` 的副作用在隐藏后仍然存在：

```jsx
// 问题：hidden 不停止视频播放！
<Activity mode={isVisible ? 'visible' : 'hidden'}>
  <video src="..." autoPlay />
</Activity>

// 解决：用 useLayoutEffect 清理
function VideoPlayer() {
  const ref = useRef();
  useLayoutEffect(() => {
    return () => {
      ref.current?.pause();  // Activity hidden 时执行 cleanup
    };
  }, []);
  return <video ref={ref} controls playsInline src="..." />;
}
```

用 `useLayoutEffect` 而非 `useEffect`——因为清理逻辑与"视觉隐藏"紧耦合，而 `useEffect` 可能因 Suspense 或 ViewTransition 而延迟执行。

## 下一步

- [View Transitions](/06-concurrent-features/06-view-transitions) — Activity 与 ViewTransition 的协作动画
- [Gesture Transitions](/06-concurrent-features/07-gesture-transitions) — Gesture Transitions
- [Suspense 机制](/06-concurrent-features/02-suspense) — Suspense 的实现机制
- [选择性水合](/08-renderer/04-selective-hydration) — Activity 如何参与选择性水合

## 参考资料

- [Activity 官方文档 (React.dev)](https://react.dev/reference/react/Activity) — ★ API 参考、用法、注意事项
- [React 19.2 官方博客](https://react.dev/blog/2025/10/01/react-19-2) — Activity 稳定化公告
- [React 源码 ReactFiberActivityComponent.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberActivityComponent.js) — ActivityState 类型定义
- [React 源码 ReactFiberBeginWork.js updateActivityComponent (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js) — beginWork 中的处理逻辑
- [React v18.0 - Offscreen (官方博客)](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html) — 原始设计动机
- [Tried React 19's Activity Component (Medium)](https://javascript.plainenglish.io/tried-react-19s-activity-component-here-s-what-i-learned-b0f714003a65) — 实测分析
- [React 19.2 Activity Component (Medium)](https://medium.com/@ignatovich.dm/react-19-2-activity-component-300025b76883) — 特性分析
