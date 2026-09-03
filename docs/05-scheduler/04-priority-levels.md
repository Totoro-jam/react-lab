---
title: "优先级体系"
---



> 对应源码：[`SchedulerPriorities.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerPriorities.js), [`ReactFiberLane.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js)

## 1. 三套优先级系统的对照

[What are Lanes in React?](https://jser.dev/react/2022/03/26/lanes-in-react/) 系统地梳理了 Lane、Event Priority、Scheduler Priority 三套优先级之间的映射关系：

```
Lane (Reconciler)          Event Priority              Scheduler Priority
─────────────────────────  ──────────────────────────  ──────────────────────
SyncHydrationLane          (微任务，不经 Scheduler)
SyncLane (click, keydown)  → DiscreteEventPriority     (微任务调度，不走 Scheduler)
                                                       理论映射: UserBlockingPriority(2)
InputContinuousLane        → ContinuousEventPriority   → UserBlockingPriority (2)
  (mousemove, drag)
DefaultLane                → DefaultEventPriority      → NormalPriority (3)
  (网络回调, setTimeout)
TransitionLanes (×14)      → default 分支              → NormalPriority (3)
  (startTransition)
RetryLanes (×4)                                        → NormalPriority (3)
IdleLane                   → IdleEventPriority         → IdlePriority (5)
OffscreenLane                                          → IdlePriority (5)
DeferredLane                                           → IdlePriority (5)
```

注意：`ImmediatePriority (1)` 不再被使用——源码注释说明"now that we use microtasks for sync work we no longer use that"。

## 2. 映射的实现

```javascript
// [ReactFiberRootScheduler.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberRootScheduler.js)（简化）

function ensureRootIsScheduled(root, nextLanes) {
  // SyncLane → 微任务调度，不经过 Scheduler
  if (includesSyncLane(nextLanes)) {
    // 同步工作在微任务末尾 flush，不需要调度额外的 callback
    root.callbackPriority = SyncLane;
    root.callbackNode = null;
    return SyncLane;
  }

  // 并发任务 → 经过 Scheduler
  let schedulerPriorityLevel;
  switch (lanesToEventPriority(nextLanes)) {
    case DiscreteEventPriority:   // SyncLane
    case ContinuousEventPriority: // InputContinuousLane
      schedulerPriorityLevel = UserBlockingSchedulerPriority;
      break;
    case DefaultEventPriority:    // DefaultLane + TransitionLanes
      schedulerPriorityLevel = NormalSchedulerPriority;
      break;
    case IdleEventPriority:       // IdleLane
      schedulerPriorityLevel = IdleSchedulerPriority;
      break;
    default:
      schedulerPriorityLevel = NormalSchedulerPriority;
      break;
  }
  scheduleCallback(
    schedulerPriorityLevel,
    performConcurrentWorkOnRoot.bind(null, root)
  );
}
```

## 3. 过期机制

每个 Scheduler 任务都有 `expirationTime`。如果任务长时间没被执行（低优先级任务被高优先级抢占了），到期后就会被强制执行（变成同步）。[React v18.0 官方博文](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html) 强调了这一机制的重要性——它确保低优先级任务不会被无限期饿死：

```javascript
// [Scheduler.js](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js) 中 flushWork 的过期检查
const isTaskExpired = currentTask.expirationTime <= currentTime;
if (isTaskExpired) {
  // 过期了 → 不检查 shouldYield，强制执行
  // 即使时间片用完也要执行（防止低优先级任务永远不被执行）
}
```

## 4. 优先级打断

```
高优先级打断低优先级的完整流程：

T=0:  用户开始搜索 → startTransition 中 setSearchQuery("abc")
      → TransitionLane1
      → Scheduler 调度 NormalPriority 任务
      → WorkLoop 开始并发渲染

T=3ms: 用户输入下一个键 → setInputValue("abcd")
      → SyncLane（高优先级！）
      → 通过微任务直接调度同步渲染（不经 Scheduler）
      → WorkLoop 被中断（shouldYield = true）
      → workInProgress 树被丢弃
      → 新的同步渲染开始
      → "abcd" 立即显示在输入框

T=8ms: 同步渲染完成
      → 立即开始新的 TransitionLane 渲染（用 "abcd" 搜索）
      → 用户最终看到 "abcd" 的搜索结果

关键：旧的 "abc" 渲染工作被完全丢弃
      用户只需等待最新的 "abcd" 结果
      输入框始终保持流畅响应
```

## 下一步

- [Lane 优先级模型](/02-fiber-architecture/04-lanes-priorities) — Lane 模型详解
- [并发渲染原理](/06-concurrent-features/01-concurrent-rendering) — 并发特性的完整分析

## 参考资料

- [What are Lanes in React? (JSer.dev)](https://jser.dev/react/2022/03/26/lanes-in-react/) — 三套优先级系统的映射
- [React v18.0 - Concurrent React (官方)](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)
- [React 源码 SchedulerPriorities.js](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerPriorities.js)
