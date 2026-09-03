---
title: "Scheduler 设计哲学"
---



> 对应源码：[`Scheduler.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js), [`SchedulerPriorities.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerPriorities.js), [`SchedulerFeatureFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerFeatureFlags.js)

## 1. Scheduler 的角色

Scheduler 是 React 中独立于 Reconciler 的模块。它的职责是**决定什么时候执行任务，按什么顺序执行**。

```
没有 Scheduler：
  setState → 立刻同步渲染 → 如果组件树很大，主线程被阻塞

有 Scheduler：
  setState → 创建任务放入队列 → Scheduler 决定何时执行
  → 时间片到了才执行，时间片用完就暂停
  → 高优先级任务先执行
  → 主线程不被长时间独占
```

## 2. 核心设计：合作式调度

Scheduler 实现的是**合作式调度**（Cooperative Scheduling）——任务主动检查是否应该让出主线程。[React Design Principles](https://legacy.reactjs.org/docs/design-principles.html) 中的 Scheduling 章节解释了这一设计决策：

```javascript
// ReactFiberWorkLoop.js
function workLoopConcurrentByScheduler() {
  while (workInProgress !== null && !shouldYield()) {
    //                                  ^^^^^^^^^^
    //  每个 Fiber 处理完后检查：还要不要继续？
    performUnitOfWork(workInProgress);
  }
}
```

`shouldYield()` 检查当前时间片是否用完：

```javascript
// packages/scheduler/src/forks/Scheduler.js
let frameInterval = frameYieldMs;  // 默认 5ms
let startTime = -1;
let needsPaint = false;            // 浏览器是否需要绘制

function shouldYieldToHost(): boolean {
  if (!enableAlwaysYieldScheduler && enableRequestPaint && needsPaint) {
    // 浏览器需要绘制了 → 立刻让出（优先于时间片检查）
    return true;
  }
  const timeElapsed = getCurrentTime() - startTime;
  if (timeElapsed < frameInterval) {
    // 主线程被阻塞的时间还没超过帧间隔 → 继续
    return false;
  }
  // 主线程被阻塞超过 frameInterval（5ms）→ 让出
  return true;
}

function requestPaint() {
  // React Commit 完成后调用，告诉 Scheduler：让浏览器有机会绘制
  if (enableRequestPaint) {
    needsPaint = true;
  }
}
```

### `needsPaint`：与浏览器渲染的协调

`needsPaint` 是 Scheduler 和浏览器渲染之间的**信号灯**。理解它需要知道一个前提：Scheduler 在 `MessageChannel` 宏任务中执行 React 工作，这段时间浏览器无法绘制。

```
时间轴：

  宏任务(React工作)    宏任务(浏览器渲染)    宏任务(下一轮React工作)
  ──────────────┐    ──────────────┐    ──────────────
  shouldYield?  │    浏览器画一帧  │    needsPaint已被重置
  needsPaint=   │    60fps动画    │    = false
  true → 让出   │    用户交互反馈  │
                ▼                ▼
```

完整流程：

1. React Commit 完成后调用 `requestPaint()`（`ReactFiberWorkLoop.js:4189`）→ `needsPaint = true`
2. 如果 React 还有残余工作（下一轮 `shouldYieldToHost()` 检查），`needsPaint === true` → **立即让出**，即使 5ms 时间片没用完
3. `MessageChannel` 让出后，浏览器有机会执行渲染：画一帧、处理用户输入
4. 浏览器渲染完毕，下一轮 `performWorkUntilDeadline` 开始 → `needsPaint = false`（重置）
5. React 继续处理残余工作

这个机制确保了：**即使 React 有大量渲染工作，每次 Commit 后浏览器都能至少画一帧**。注释明确写道"Tell Scheduler to yield at the end of the frame, so the browser has an opportunity to paint"。

> `enableAlwaysYieldScheduler`（实验性 flag，`__EXPERIMENTAL__`）如果开启，会跳过 `needsPaint` 检查并在 `flushWork` 中对每个任务都 yield——用于调试"每帧只处理一个任务"的极端场景。

## 3. 五级优先级

```javascript
// [`SchedulerPriorities.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerPriorities.js)
export const NoPriority = 0;
export const ImmediatePriority = 1;  // 已弃用（见下方注释）
export const UserBlockingPriority = 2; // 用户交互
export const NormalPriority = 3;     // 普通
export const LowPriority = 4;        // 低
export const IdlePriority = 5;       // 空闲
```

> **ImmediatePriority 不再被 React 使用**——`ReactFiberRootScheduler.js:482-484` 注释：
> "Scheduler does have an 'ImmediatePriority', but now that we use microtasks for sync work we no longer use that."
> Discrete 和 Continuous 事件在 Scheduler 层都映射为 `UserBlockingPriority(2)`。

每个优先级对应的超时时间：

```javascript
// [`SchedulerFeatureFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerFeatureFlags.js)
export const frameYieldMs = 5;                        // 时间片：5ms
export const userBlockingPriorityTimeout = 250;       // UserBlocking: 250ms 后过期
export const normalPriorityTimeout = 5000;            // Normal: 5000ms 后过期
export const lowPriorityTimeout = 10000;              // Low: 10000ms 后过期
```

超时意味着"如果这个时间后任务还没执行，就不管优先级了，必须执行"。

## 4. 时间切片的实现：MessageChannel

Scheduler 不用 `requestIdleCallback`（兼容性差、行为不稳定），而是用 `MessageChannel`。[React 技术揭秘](https://react.iamkasong.com/concurrent/scheduler.html) 对这一选择的原因做了分析：

```javascript
const channel = new MessageChannel();
const port = channel.port2;
channel.port1.onmessage = performWorkUntilDeadline;

function schedulePerformWorkUntilDeadline() {
  port.postMessage(null);
  // postMessage 是宏任务，在下一个事件循环执行
  // 浏览器有机会在这之前做其他事（如处理用户输入、渲染）
}

function performWorkUntilDeadline() {
  if (isMessageLoopRunning) {
    const currentTime = getCurrentTime();
    // 记录开始时间，用于测量主线程被阻塞多久
    startTime = currentTime;

    let hasMoreWork = true;
    try {
      hasMoreWork = flushWork(currentTime);
    } finally {
      if (hasMoreWork) {
        // 还有工作 → 再次调度
        schedulePerformWorkUntilDeadline();
      } else {
        isMessageLoopRunning = false;
      }
    }
  }
}
```

```
时间切片的工作方式：

  [Scheduler 开始工作]
    startTime = now()
    执行任务...
    ↓ shouldYield() → now() - startTime < 5ms → 继续
    执行任务...
    ↓ shouldYield() → now() - startTime < 5ms → 继续
    执行任务...
    ↓ shouldYield() → now() - startTime >= 5ms → true → 让出

  [让出主线程]
    浏览器处理渲染、用户输入...
    ↓ 下一个事件循环
    MessageChannel.onmessage → 继续执行

  循环直到所有任务完成
```

## 5. 任务调度的入口

```javascript
function scheduleCallback(priorityLevel, callback) {
  const currentTime = getCurrentTime();
  const startTime = currentTime;

  let timeout;
  switch (priorityLevel) {
    case ImmediatePriority:
      timeout = -1; // 立即过期
      break;
    case UserBlockingPriority:
      timeout = userBlockingPriorityTimeout; // 250ms
      break;
    case NormalPriority:
      timeout = normalPriorityTimeout; // 5000ms
      break;
    case LowPriority:
      timeout = lowPriorityTimeout; // 10000ms
      break;
    case IdlePriority:
      timeout = maxSigned31BitInt; // 永不过期（直到空闲）
      break;
  }

  const expirationTime = startTime + timeout;

  const newTask = {
    id: taskIdCounter++,
    callback,           // 要执行的函数
    priorityLevel,
    startTime,          // 开始时间
    expirationTime,     // 过期时间（用于排序）
    sortIndex: -1,      // 排序索引（初始设为 expirationTime）
  };

  if (startTime > currentTime) {
    // 延迟任务 → 放入 timerQueue
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);
  } else {
    // 立即任务 → 放入 taskQueue
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
    // 如果没有正在执行的任务，开始调度
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
  }
  return newTask;
}
```

## 6. flushWork：取出任务执行

```javascript
function flushWork(initialTime) {
  isHostCallbackScheduled = false;
  isPerformingWork = true;

  let currentTime = initialTime;
  let currentTask = peek(taskQueue); // 从堆顶取最高优先级任务

  while (currentTask !== null) {
    if (currentTask.callback === null) {
      // 任务被取消了
      pop(taskQueue);
    } else if (currentTask.expirationTime > currentTime && shouldYieldToHost()) {
      // 任务未过期 且 时间片用完 → 暂停
      break;
    } else {
      // 执行任务
      const continuationCallback = currentTask.callback(currentTime);
      if (typeof continuationCallback === 'function') {
        // 任务返回了续接函数 → 更新任务，放回队列
        currentTask.callback = continuationCallback;
      } else {
        // 任务完成 → 弹出
        pop(taskQueue);
      }
      currentTask = peek(taskQueue); // 取下一个
      currentTime = getCurrentTime();
    }
  }

  isPerformingWork = false;
  return currentTask !== null; // 是否还有任务
}
```

## 下一步

- [最小堆优先级队列](/05-scheduler/02-min-heap) — 最小堆的详细实现
- [时间切片](/05-scheduler/03-time-slicing) — 时间切片的细节
- [优先级体系](/05-scheduler/04-priority-levels) — 优先级与 Lane 的映射

## 参考资料

- [React Design Principles - Scheduling (React 官方)](https://legacy.reactjs.org/docs/design-principles.html)
- [Inside Fiber (Max Koretskyi) - Scheduler](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/)
- [React 技术揭秘 - Scheduler 的原理与实现 (卡颂)](https://react.iamkasong.com/concurrent/scheduler.html)
- [React 源码 Scheduler.js](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js)
