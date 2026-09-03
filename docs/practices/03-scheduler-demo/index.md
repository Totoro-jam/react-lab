---
title: "实践练习：手写时间切片调度器"
---


> 目标：从零实现一个带优先级和时间切片的任务调度器

## 1. 项目目标

手写一个简化版的 Scheduler，理解：

- 最小堆优先级队列的工作方式
- MessageChannel 时间切片的实现
- shouldYield 的检查逻辑
- 任务续接机制

## 2. 实现步骤

### Step 1: 最小堆

```javascript
// 实现 push, pop, peek, siftUp, siftDown
// 比较函数：先比 sortIndex（过期时间），再比 id
const heap = [];

function push(node) {
  const i = heap.length;
  heap.push(node);
  siftUp(i);
}
function pop() {
  const first = heap[0];
  const last = heap.pop();
  if (last !== first) {
    heap[0] = last;
    siftDown(0);
  }
  return first;
}
```

### Step 2: 时间切片

```javascript
const channel = new MessageChannel();
let deadline = 0;
const frameYieldMs = 5;

channel.port1.onmessage = () => {
  // 时间到了，执行任务
  flushWork();
};

function shouldYield() {
  return performance.now() >= deadline;
}

function schedulePort() {
  channel.port2.postMessage(null);
}
```

### Step 3: scheduleCallback

```javascript
function scheduleCallback(priorityLevel, callback) {
  const startTime = performance.now();
  let timeout;
  switch (priorityLevel) {
    case 1: timeout = -1; break;      // Immediate
    case 2: timeout = 250; break;      // UserBlocking
    case 3: timeout = 5000; break;     // Normal
    case 4: timeout = 10000; break;    // Low
    case 5: timeout = 1073741823; break; // Idle
  }
  const task = {
    id: taskIdCounter++,
    callback,
    startTime,
    expirationTime: startTime + timeout,
    sortIndex: startTime + timeout,
  };
  push(task);
  schedulePort();
}
```

### Step 4: flushWork

```javascript
function flushWork() {
  deadline = performance.now() + frameYieldMs;
  let task = peek();
  while (task) {
    if (shouldYield() && task.expirationTime > performance.now()) {
      break; // 时间片用完
    }
    const continuation = task.callback();
    if (typeof continuation === 'function') {
      task.callback = continuation; // 续接
    } else {
      pop();
    }
    task = peek();
  }
  if (peek()) {
    schedulePort(); // 还有任务 → 下个循环继续
  }
}
```

## 3. 验证

```javascript
// 高优先级任务先执行
scheduleCallback(1, () => { console.log('Immediate'); });
scheduleCallback(3, () => { console.log('Normal'); });
scheduleCallback(2, () => { console.log('UserBlocking'); });

// 输出顺序：Immediate → UserBlocking → Normal

// 时间切片测试
scheduleCallback(3, () => {
  let work = 0;
  while (work < 100) {
    if (shouldYield()) {
      console.log('yielding at', work);
      return () => { /* continuation */ }; // 续接
    }
    work++;
  }
  console.log('done');
});
```

## 下一步

- [手写 mini-react](/practices/01-mini-react/) — 从零实现 React 核心
- [Fiber 树可视化](/practices/04-fiber-visualizer/) — Fiber 树可视化
- [时间切片](/05-scheduler/03-time-slicing) — 时间切片的细节

## 参考资料

- [React 源码 Scheduler.js](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js) — 调度器主逻辑
- [React 源码 SchedulerMinHeap.js](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerMinHeap.js) — 最小堆实现
- [React 技术揭秘 - Scheduler (卡颂)](https://react.iamkasong.com/concurrent/scheduler.html) — 中文 Scheduler 分析
