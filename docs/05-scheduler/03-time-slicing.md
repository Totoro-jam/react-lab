---
title: "时间切片"
---



> 对应源码：[`SchedulerFeatureFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerFeatureFlags.js), [`Scheduler.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js)

## 1. 时间切片的原理

浏览器一帧的时间线（60fps = 16.6ms/帧）：

```
| JS 执行 | 样式计算 | 布局 | 绘制 | 合成 | 空闲 |
```

Scheduler 的工作策略：在"空闲"和"JS 执行"部分进行 React 工作，每次最多用 5ms（`frameYieldMs`），然后让出主线程给浏览器处理用户输入和渲染。

## 2. 时间切片的核心参数

```javascript
// [`SchedulerFeatureFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerFeatureFlags.js)
export const frameYieldMs = 5;  // 每次工作最多 5ms
```

在 [ReactFiberWorkLoop.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js) 中还有一个内部时间管理：

```javascript
// [ReactFiberWorkLoop.js:3056-3062](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js)
function workLoopConcurrent(nonIdle: boolean) {
  if (workInProgress !== null) {
    // Transition/Retry 每 25ms yield（限制到 ~30fps）
    // Idle 工作每 5ms yield
    const yieldAfter = now() + (nonIdle ? 25 : 5);
    // ...
  }
}
```

设计意图：Transition 渲染给动画留更多帧（25ms = ~40fps 渲染速度，动画 60fps 不受影响），Idle 工作更频繁地让步（5ms）。

## 3. shouldYield 的实现

```javascript
// Scheduler.js
let frameInterval = frameYieldMs;  // 默认 5ms
let startTime = -1;                // 工作开始时间

function shouldYieldToHost(): boolean {
  if (enableRequestPaint && needsPaint) {
    return true;
  }
  const timeElapsed = getCurrentTime() - startTime;
  if (timeElapsed < frameInterval) {
    // 主线程被阻塞时间还没超过 5ms → 继续
    return false;
  }
  // 超过 5ms → 让出
  return true;
}

function performWorkUntilDeadline() {
  if (isMessageLoopRunning) {
    const currentTime = getCurrentTime();
    startTime = currentTime; // 记录开始时间

    let hasMoreWork = true;
    try {
      hasMoreWork = flushWork(currentTime);
    } finally {
      if (hasMoreWork) {
        schedulePerformWorkUntilDeadline();
      } else {
        isMessageLoopRunning = false;
      }
    }
  }
}
```

## 4. MessageChannel：让出主线程的机制

[React 技术揭秘](https://react.iamkasong.com/concurrent/scheduler.html) 详细解析了 Scheduler 选择 `MessageChannel` 而非 `setTimeout` 的原因：

```javascript
const channel = new MessageChannel();
const port = channel.port2;
channel.port1.onmessage = performWorkUntilDeadline;

function schedulePerformWorkUntilDeadline() {
  port.postMessage(null);
}
```

```
为什么用 MessageChannel 而不是 setTimeout？

setTimeout(fn, 0) 的最小延迟在现代浏览器中是 4ms
  → 频繁使用会导致大量不必要的 4ms 等待

MessageChannel 是宏任务，但延迟接近 0
  → 比 setTimeout 更快
  → 但仍然是宏任务，不会阻塞浏览器渲染

优先级：微任务 > MessageChannel > setTimeout
  微任务不会让浏览器渲染
  MessageChannel 恰好让浏览器有机会渲染
```

## 5. 任务的续接

```javascript
function flushWork(initialTime) {
  let currentTask = peek(taskQueue);

  while (currentTask !== null) {
    if (currentTask.expirationTime > currentTime && shouldYieldToHost()) {
      break; // 时间片用完
    }

    const continuationCallback = currentTask.callback(currentTime);

    if (typeof continuationCallback === 'function') {
      // 任务没做完 → 返回续接函数
      currentTask.callback = continuationCallback;
      // 不 pop！任务留在队列中
    } else {
      pop(taskQueue); // 完成了 → 移出队列
    }

    currentTask = peek(taskQueue);
  }

  return currentTask !== null; // 还有任务 → 返回 true
}
```

React 传入的 `performConcurrentWorkOnRoot` 正是一个返回续接函数的 callback：

```javascript
function performConcurrentWorkOnRoot(root, didTimeout) {
  // ... 渲染逻辑

  if (workInProgress !== null) {
    // 还有没处理完的 Fiber
    return performConcurrentWorkOnRoot.bind(null, root);
    // 返回续接函数 → 下个时间片继续
  }

  return null; // 完成了
}
```

## 下一步

- [优先级体系](/05-scheduler/04-priority-levels) — 优先级体系详解
- [并发渲染原理](/06-concurrent-features/01-concurrent-rendering) — 并发特性如何利用时间切片

## 参考资料

- [React Design Principles - Scheduling (官方)](https://legacy.reactjs.org/docs/design-principles.html)
- [React 技术揭秘 - Scheduler (卡颂)](https://react.iamkasong.com/concurrent/scheduler.html)
- [React 源码 Scheduler.js](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js)
