---
title: "Gesture Transitions：手势驱动的连续过渡"
---


> 对应源码：[`ReactFiberGestureScheduler.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberGestureScheduler.js), [`ReactStartTransition.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactStartTransition.js)

## 1. 什么是 Gesture Transition

Gesture Transition 是 React 最前沿的实验特性之一——让用户的手势（如拖拽、滑动）**直接驱动 UI 的连续过渡**，而不是离散的状态更新。

[React Labs: View Transitions, Activity, and more](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) 中提到了这个方向。它扩展了 React 18 的 `startTransition` 模型——从"离散更新"变为"连续输入驱动"。

```
普通 Transition：
  用户点击 → startTransition → setState → 渲染完成 → commit
  整个过程是离散的：开始 → 完成

Gesture Transition：
  用户开始拖拽 → startGestureTransition
  → 手势移动 → 实时更新 UI（跟手移动）
  → 手势释放 → 决定最终状态（确认或回滚）
  → commit 或 revert
  整个过程是连续的：开始 → 实时跟随 → 确认/回滚
```

## 2. 状态：Experimental

> **注意**：`enableGestureTransition` 为 `__EXPERIMENTAL__`，仅在实验通道可用：
>
> ```javascript
> // packages/shared/ReactFeatureFlags.js
> export const enableGestureTransition = __EXPERIMENTAL__;
> ```
>
> 在 stable 和 canary 版本中均不可用。API 可能随时变化。

## 3. GestureLane

Gesture Transition 使用专门的 **GestureLane**（bit 6）：

```javascript
// packages/react-reconciler/src/ReactFiberLane.js:59
export const GestureLane: Lane = 0b0000000000000000000000001000000;  // bit 6
```

GestureLane 在优先级排序中位于 `DefaultLane` (bit 5) 和 `TransitionHydrationLane` (bit 7) 之间。

在 `requestUpdateLane` 中，如果检测到当前 transition 有 gesture，会使用 GestureLane：

```javascript
// ReactFiberWorkLoop.js: requestUpdateLane（简化）
const transition = requestCurrentTransition();
if (transition !== null) {
  if (enableGestureTransition) {
    if (transition.gesture) {
      // 在手势 transition 中 → 使用 GestureLane
      // 并且限制只能调用 useOptimistic，不能普通 setState
      throw new Error(
        'Cannot setState on regular state inside a startGestureTransition. ' +
        'Gestures can only update the useOptimistic() hook.'
      );
    }
  }
}
```

**关键约束**：手势 transition 内部只能调用 `useOptimistic`——不能 `setState`、不能更新普通 state。这是因为手势的目的是实时驱动 UI 预览，不应触发完整的 re-render 流程。

## 4. API：startGestureTransition

```javascript
// packages/react/src/ReactStartTransition.js:120-186
export function startGestureTransition(
  provider: GestureProvider,    // 手势时间线提供者
  scope: () => void,              // 手势开始时执行的 scope
  options?: GestureOptions & StartTransitionOptions,
): () => void                     // 返回 cancel 函数
{
  // 1. 设置 transition 上下文（类似 startTransition）
  const currentTransition = {};
  currentTransition.gesture = provider;  // ← 标记为 gesture transition
  ReactSharedInternals.T = currentTransition;

  // 2. 执行 scope（不能是 async！）
  const returnValue = scope();
  if (typeof returnValue === 'object' && returnValue !== null) {
    console.error('Cannot use an async function in startGestureTransition.');
  }

  // 3. 通过 gesture dispatcher 启动手势
  const onStartGestureTransitionFinish = ReactSharedInternals.G;
  if (onStartGestureTransitionFinish !== null) {
    return onStartGestureTransitionFinish(currentTransition, provider, options);
  }

  // 4. 恢复 prev transition
  ReactSharedInternals.T = prevTransition;
  return noop;
}
```

与 `startTransition` 的关键区别：

- `startTransition(scope)` — scope 可以是 async
- `startGestureTransition(provider, scope)` — scope **不能** async，必须立即开始
- 需要额外的 `provider` 参数（GestureProvider 时间线）
- 返回 cancel 函数而非无返回值

## 5. 内部调度机制

### 5.1 ScheduledGesture

React 为每个活动手势维护一个 `ScheduledGesture` 状态：

```javascript
// packages/react-reconciler/src/ReactFiberGestureScheduler.js:31-43
export type ScheduledGesture = {
  provider: GestureTimeline,          // 手势时间线
  count: number,                     // 同一 provider 被启动的次数
  rangeStart: number,                // "当前"状态的起点（百分比）
  rangeEnd: number,                  // "目标"状态的终点（百分比）
  types: null | TransitionTypes,     // addTransitionType 调用
  running: null | RunningViewTransition,  // 运行中的 View Transition（可取消）
  commit: null | (() => void),       // 待提交的 commit 回调
  committing: boolean,               // 是否处于提交状态
  revertLane: Lane,                  // 回滚时使用的 Lane
  prev: null | ScheduledGesture,    // 队列中的前一个手势
  next: null | ScheduledGesture,     // 队列中的后一个手势
};
```

### 5.2 手势生命周期

```
1. startGestureTransition(provider, scope) 调用
   → 设置 ReactSharedInternals.T.gesture = provider
   → 执行 scope() → 触发 useOptimistic 更新（使用 GestureLane）
   → 注册到 GestureScheduler 的手势队列

2. 手势进行中（用户拖拽中）
   → provider 提供 timeline 进度（0 → 1.0）
   → React 根据 rangeStart / rangeEnd 计算插值
   → 实时更新 useOptimistic 的值 → UI 跟随手势
   → 可能驱动 RunningViewTransition（浏览器 View Transition）

3. 手势释放
   → 判断是否"成功"（过了 threshold?）
   → 成功：commit → 正常 commit 渲染 → 最终状态
   → 失败：revert → 使用 revertLane 回滚到初始状态
       → useOptimistic 恢复到原始值
       → View Transition 可能播放回滚动画

4. 多手势叠加
   → 同一 provider 可启动多次（count 追踪）
   → 手势队列（prev/next）管理多个并发手势
```

### 5.3 与 View Transition 的集成

手势进行中可能有 `RunningViewTransition`（运行中的浏览器 View Transition）：

```javascript
running: null | RunningViewTransition
```

这意味着手势可以驱动 View Transition 的实时进度——用户拖拽时，View Transition 的"旧快照 → 新快照"交叉淡入程度**直接跟随手势进度**，而不是预设动画曲线。手势释放后：

- 如果 commit → View Transition 继续完成
- 如果 revert → View Transition 回滚到旧快照

## 6. useOptimistic 和手势

`useOptimistic` 是手势 transition 中唯一允许更新的 state hook：

```javascript
// 手势中使用 useOptimistic 跟随
function Item({ item }) {
  const [optimisticX, setOptimisticX] = useOptimistic(item.x);
  
  const onDrag = (e) => {
    startGestureTransition(gestureProvider, () => {
      setOptimisticX(e.clientX);  // 实时更新，跟随手指
    });
  };

  return <div style={{ left: optimisticX }}>{item.content}</div>;
}
```

为什么只能用 `useOptimistic`？

- `useOptimistic` 是特别为"乐观更新"设计的——它的值可以即时变化，但在 commit 前"不正式"
- 如果手势 revert，useOptimistic 自动恢复到原始值
- 同时 `useOptimistic` 的 `lastRenderedReducer` 被设为 `null` → 跳过 Eager State 优化
- 不干扰普通 state 的渲染流程

## 7. 与普通 Transition 的关系

```
startTransition：
  适用：低优先级离散更新（搜索结果、页面切换）
  机制：setState → 调度渲染 → 必要时中断 → 最终 commit
  可以使用：所有 Hooks
  与 View Transition：可以触发 ViewTransition 动画

startGestureTransition：
  适用：连续输入驱动的实时过渡（拖拽、滑动）
  机制：useOptimistic → 跟随 gesture timeline → commit 或 revert
  只能使用：useOptimistic
  与 View Transition：可以驱动 RunningViewTransition 实时进度

startTransition + startGestureTransition 可以嵌套：
  在 startGestureTransition 内部调 startTransition → 允许
  （gesture 内部可以触发普通 transition）
```

## 8. 源码文件索引

| 文件 | 职责 |
| ------ | ------ |
| `react/src/ReactStartTransition.js` | `startGestureTransition` 公共 API |
| `react-reconciler/src/ReactFiberGestureScheduler.js` | 手势调度器核心（`ScheduledGesture` 管理） |
| `react-reconciler/src/ReactFiberLane.js` | `GestureLane` (bit 6) 定义 |
| `react-reconciler/src/ReactFiberWorkLoop.js` | `requestUpdateLane` 中 gesture 检测 |
| `react-reconciler/src/ReactFiberHooks.js` | `useOptimistic` 实现（`dispatchOptimisticSetState`） |
| `shared/ReactFeatureFlags.js` | `enableGestureTransition = __EXPERIMENTAL__` |

## 下一步

- [过渡更新 Transitions](/06-concurrent-features/03-transitions) — 普通 Transition 机制（对比理解 Gesture 的差异）
- [View Transitions](/06-concurrent-features/06-view-transitions) — View Transition 与 Gesture 的集成
- [useTransition / useDeferredValue](/04-hooks-internals/07-concurrent-hooks) — useOptimistic 的实现细节
- [React 19 新 Hooks](/04-hooks-internals/08-react19-hooks) — React 19 新 Hooks 概览

## 参考资料

- [React Labs: View Transitions, Activity, and more (官方博客)](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) — Activity 和 View Transitions 的实验公告
- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — 19.2 特性概览
- [React Source ReactStartTransition.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactStartTransition.js) — `startGestureTransition` 实现
- [React Source ReactFiberGestureScheduler.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberGestureScheduler.js) — 手势调度器核心
- [React Source ReactFiberLane.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js) — GestureLane 定义
- [React Source ReactFeatureFlags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactFeatureFlags.js) — `enableGestureTransition` flag
- [React 19: What's New for Developers (Scrimba 2026)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — 2026 年状态总览
