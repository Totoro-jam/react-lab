---
title: "工作循环全景"
---


> 对应源码：[`packages/react-reconciler/src/ReactFiberWorkLoop.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js)

## 1. 全景图

React 的渲染过程分为两大阶段——**Render 阶段**和 **Commit 阶段**。工作循环（Work Loop）就是 Render 阶段的核心引擎。关于这个过程的全景，[Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) 提供了最详细的逐行分析。

```
┌─────────────────────────────────────────────────────────────────┐
│                      一次完整的更新流程                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ Render 阶段（可中断）─────────────────────────────────────┐ │
│  │                                                            │ │
│  │  workLoopConcurrentByScheduler():                          │ │
│  │    while (workInProgress !== null && !shouldYield())      │ │
│  │      performUnitOfWork(workInProgress)                     │ │
│  │                                                            │ │
│  │  performUnitOfWork:                                        │ │
│  │    beginWork     → 向下处理：创建/更新子 Fiber               │ │
│  │    completeWork  → 向上冒泡：创建 DOM、收集 flags            │ │
│  │                                                            │ │
│  │  产出：一棵带 flags 标记的 workInProgress Fiber 树          │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│  ┌─ Commit 阶段（不可中断）───────────────────────────────────┐ │
│  │                                                            │ │
│  │  commitRoot():                                             │ │
│  │    0. 调度 passive effects（三阶段之前）                     │ │
│  │    1. beforeMutation  → getSnapshotBeforeUpdate            │ │
│  │    2. mutation         → DOM 增删改                        │ │
│  │    切换 current 指针（mutation 之后、layout 之前）            │ │
│  │    3. layout           → componentDidMount/Update          │ │
│  │                        → useLayoutEffect                   │ │
│  │    4. passive          → useEffect（异步，paint 之后）       │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 两种工作循环

```javascript
// packages/react-reconciler/src/ReactFiberWorkLoop.js:2772-2777
// [源码位置](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js)

// 同步循环：不可中断，一口气跑完
function workLoopSync() {
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

// packages/react-reconciler/src/ReactFiberWorkLoop.js:3073-3079
// 并发循环：可被 Scheduler 中断
function workLoopConcurrentByScheduler() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```

区别只有一个：`!shouldYield()`。Scheduler 的 `shouldYield()` 会检查当前时间片是否已经用完（默认 `frameYieldMs = 5`）。如果用完了就返回 true，退出 while 循环，让出主线程。这正是 [React 技术揭秘 - render 阶段](https://react.iamkasong.com/render/flow.html) 中描述的"可中断渲染"的实现方式。

还有一种内部管理时间的工作循环：

```javascript
// ReactFiberWorkLoop.js:3056-3071
function workLoopConcurrent(nonIdle: boolean) {
  // Transition/Retry 每 25ms yield（限制动画到 30fps）
  // Idle 工作每 5ms yield
  if (workInProgress !== null) {
    const yieldAfter = now() + (nonIdle ? 25 : 5);
    // ...
  }
}
```

## 3. performUnitOfWork：一次"递归"的两半

`performUnitOfWork` 是整个工作循环的核心。它实现了"递"（beginWork）和"归"（completeWork）两个阶段：

```javascript
// packages/react-reconciler/src/ReactFiberWorkLoop.js:3081-3123

function performUnitOfWork(unitOfWork: Fiber): void {
  // current 是 unitOfWork 的 alternate（上一轮渲染的结果）
  const current = unitOfWork.alternate;

  let next;

  // === 第一半：beginWork（递）===
  // 返回子 Fiber，或 null（叶子节点）
  next = beginWork(current, unitOfWork, entangledRenderLanes);

  // 保存 props（pendingProps → memoizedProps）
  unitOfWork.memoizedProps = unitOfWork.pendingProps;

  if (next === null) {
    // === 第二半：completeWork（归）===
    // beginWork 返回 null 说明没有子节点了
    // 进入 completeUnitOfWork 向上冒泡
    completeUnitOfWork(unitOfWork);
  } else {
    // 有子节点，workInProgress 变成子节点
    // 下一轮循环处理子节点（继续"递"）
    workInProgress = next;
  }
}
```

```
                    performUnitOfWork 的"递"和"归"
════════════════════════════════════════════════════════════════════════════

    ┌─ App ─┐                          ← 第1次 performUnitOfWork
    │       │ beginWork → 返回 div         beginWork(App) → div
    └───┬───┘                             memoizedProps = pendingProps
        │ child                          ↓
        ▼
    ┌─ div ─┐                          ← 第2次 performUnitOfWork
    │       │ beginWork → 返回 span        beginWork(div) → span
    └───┬───┘                             memoizedProps = pendingProps
        │ child                          ↓
        ▼
    ┌─ span ─┐                         ← 第3次 performUnitOfWork
    │        │ beginWork → 返回 "Hi"       beginWork(span) → "Hi"
    └────┬───┘                             memoizedProps = pendingProps
         │ child                          ↓
         ▼
    ┌─ "Hi" ─┐                         ← 第4次 performUnitOfWork
    │  text  │ beginWork → 返回 null       beginWork(text) → null
    └────────┘
         │ next === null
         ▼
    completeUnitOfWork(text)            ← "归"开始
         │ completeWork(text)
         │ 没有兄弟 → 向上到 span
         ▼
    completeUnitOfWork(span)           ← 继续"归"
         │ completeWork(span)
         │ 没有兄弟 → 向上到 div
         ▼
    completeUnitOfWork(div)            ← 继续"归"
         │ completeWork(div)
         │ 没有兄弟 → 向上到 App
         ▼
    completeUnitOfWork(App)            ← 到根了
         │ completeWork(App)
         │ 没有兄弟，没有 return → 完成！
         ▼
    workInProgress = null → 工作循环结束
```

## 4. completeUnitOfWork 的向上冒泡

```javascript
// packages/react-reconciler/src/ReactFiberWorkLoop.js:3368-3431

function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork: Fiber = unitOfWork;
  do {
    // 检查是否有错误
    if ((completedWork.flags & Incomplete) !== NoFlags) {
      // 有错误 → 切换到 unwind 模式
      unwindUnitOfWork(completedWork, skipSiblings);
      return;
    }

    const current = completedWork.alternate;
    const returnFiber = completedWork.return;

    // 调用 completeWork 处理当前节点
    let next = completeWork(current, completedWork, entangledRenderLanes);

    if (next !== null) {
      // completeWork 产生了新工作（如 Suspense 边界）
      workInProgress = next;
      return;
    }

    // 检查兄弟节点
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      // 有兄弟 → 下次处理兄弟（回到 performUnitOfWork 的 beginWork）
      workInProgress = siblingFiber;
      return;
    }

    // 没有兄弟 → 向上回到父节点，继续 completeWork
    completedWork = returnFiber;
    workInProgress = completedWork;
  } while (completedWork !== null);

  // 到根了，标记完成
  workInProgressRootExitStatus = RootCompleted;
}
```

这个 do-while 循环实现了"向上冒泡"：

```
  completeUnitOfWork("Hi")
  │
  │ do {
  │   completeWork("Hi")     ← 处理文本节点
  │   sibling = null          ← 没有兄弟
  │   completedWork = span    ← 向上到父节点
  │ } ← 继续 do
  │
  │   completeWork(span)      ← 处理 span 节点
  │   sibling = null          ← 没有兄弟
  │   completedWork = div     ← 向上到父节点
  │ } ← 继续 do
  │
  │   completeWork(div)       ← 处理 div 节点
  │   sibling = null
  │   completedWork = App     ← 向上
  │ } ← 继续 do
  │
  │   completeWork(App)       ← 处理 App 节点
  │   sibling = null
  │   completedWork = null    ← App 的 return = null（根节点）
  │ } ← while(null) → 退出

  workInProgressRootExitStatus = RootCompleted
```

## 5. workInProgress 变量：工作进度指针

整个工作循环的核心状态就是一个 `workInProgress` 变量——它指向"下一个要处理的 Fiber"。

```
workInProgress 的变化轨迹：

初始:  workInProgress = HostRoot Fiber
       │
       ▼ beginWork 返回子节点
       workInProgress = App Fiber
       │
       ▼ beginWork 返回子节点
       workInProgress = div Fiber
       │
       ▼ beginWork 返回子节点
       workInProgress = span Fiber
       │
       ▼ beginWork 返回子节点
       workInProgress = text Fiber
       │
       ▼ beginWork 返回 null → completeUnitOfWork
       │                         ↑ 没有兄弟，向上到 span
       │                         ← completeWork 返回 null → 继续
       │
       ▼ completeUnitOfWork 中找到 sibling 或向上
       ...
       │
       ▼ 所有节点处理完
       workInProgress = null → 循环退出
```

中断和恢复就靠这个指针：

```
中断：
  shouldYield() = true → 退出 while 循环
  workInProgress 保持在当前值（比如指向 span Fiber）
  内存中的 workInProgress 树保留所有中间结果

恢复：
  下一个时间片 → workLoopConcurrentByScheduler() 再被调用
  while (workInProgress !== null && !shouldYield())
    performUnitOfWork(workInProgress) ← 从 span 继续！
```

## 6. beginWork 做了什么（概览）

```javascript
// packages/react-reconciler/src/ReactFiberBeginWork.js（简化）
// [源码位置](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js)
  // 1. 检查是否可以 bailout（跳过）
  if (current !== null) {
    const oldProps = current.memoizedProps;
    const newProps = workInProgress.pendingProps;
    if (
      oldProps !== newProps || hasLegacyContextChanged()
    ) {
      didReceiveUpdate = true; // props 或 context 变了 → 需要处理
    } else {
      // props 和 context 都没变 → 检查是否有调度更新
      if (
        !checkScheduledUpdateOrContext(current, renderLanes) &&
        (workInProgress.flags & DidCapture) === NoFlags
      ) {
        // bailout：跳过子树
        return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
      }
    }
  }

  // 2. 根据 tag 分发到不同的处理函数
  switch (workInProgress.tag) {
    case FunctionComponent:
      return updateFunctionComponent(current, workInProgress, renderLanes);
    case ClassComponent:
      return updateClassComponent(current, workInProgress, renderLanes);
    case HostComponent:
      return updateHostComponent(current, workInProgress, renderLanes);
    case HostText:
      return updateHostText(current, workInProgress);
    case SuspenseComponent:
      return updateSuspenseComponent(current, workInProgress, renderLanes);
    // ... 更多类型
  }
}
```

每种类型的处理函数最终都会调用 `reconcileChildren()` 来处理子节点——这就是 Diff 算法发生的地方。

## 7. completeWork 做了什么（概览）

```javascript
// packages/react-reconciler/src/ReactFiberCompleteWork.js（简化）
// [源码位置](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCompleteWork.js)

function completeWork(current, workInProgress, renderLanes) {
  switch (workInProgress.tag) {
    case FunctionComponent:
      // 函数组件在 completeWork 中几乎不做事情
      // hooks 的 effect 在 commit 阶段处理
      return null;

    case HostComponent:  // <div>, <span> 等
      if (current !== null && workInProgress.stateNode != null) {
        // 更新：对比 props 变化，准备 DOM 更新队列
        updateHostComponentDOM(current, workInProgress, ...);
      } else {
        // 首次渲染：创建真实 DOM 节点
        const instance = createInstance(workInProgress.type, ...);
        // 将子节点的 DOM 挂载到当前 DOM 上
        appendAllChildren(instance, workInProgress);
        workInProgress.stateNode = instance;
      }
      return null;

    case HostText:  // 纯文本
      if (current !== null && workInProgress.stateNode != null) {
        // 更新文本内容
        updateHostText(current, workInProgress, ...);
      } else {
        // 首次渲染：创建 TextNode
        const instance = createTextInstance(...);
        workInProgress.stateNode = instance;
      }
      return null;
  }
}
```

## 8. 从 setState 到工作循环的完整链路

```
你调用 setState / dispatch
         │
         ▼
创建 Update 对象，分配 Lane
         │
         ▼
scheduleUpdateOnFiber(root, fiber, lane)
  ├─ packages/react-reconciler/src/[ReactFiberWorkLoop.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js)
  │
  │  markRootUpdated(root, lane) → 更新 pendingLanes
  │
  ▼
ensureRootIsScheduled(root)
  ├─ packages/react-reconciler/src/[ReactFiberRootScheduler.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberRootScheduler.js)
  │
  │  根据最高优先级 Lane 决定 Scheduler 优先级
  │  scheduleCallback(schedulerPriority, performConcurrentWorkOnRoot)
  │
  ▼
Scheduler 将任务放入最小堆
  ├─ packages/scheduler/src/forks/Scheduler.js
  │
  │  等待时间片 → 从堆顶取出任务执行
  │
  ▼
performConcurrentWorkOnRoot(root)
  ├─ packages/react-reconciler/src/[ReactFiberWorkLoop.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js)
  │
  │  renderRootConcurrent(root, lanes)
  │    prepareFreshStack(root, lanes)
  │      → createWorkInProgress(root.current)
  │      → workInProgress = HostRoot
  │
  ▼
workLoopConcurrentByScheduler()
  │
  │  while (workInProgress !== null && !shouldYield())
  │    performUnitOfWork(workInProgress)
  │      → beginWork（递）
  │      → completeUnitOfWork / completeWork（归）
  │
  ▼ 所有 Fiber 处理完毕
finishConcurrentRender(root)
  │
  ▼
commitRoot(root)
  ├─ packages/react-reconciler/src/ReactFiberWorkLoop.js
  │
  │  调度 passive effects（在三阶段之前）
  │    └─ scheduleCallback(flushPassiveEffects) — 异步执行
  │
  │  commitBeforeMutationEffects
  │    └─ getSnapshotBeforeUpdate
  │
  │  commitMutationEffects
  │    └─ DOM 增删改 + ref detach
  │
  │  root.current = finishedWork  ← 切换（mutation 之后、layout 之前）
  │
  │  commitLayoutEffects
  │    └─ componentDidMount/Update + useLayoutEffect + ref attach
  │
  ▼
（异步）flushPassiveEffects — useEffect 执行（paint 之后）
```

## 下一步

现在你对工作循环有了全景理解，可以深入每个环节。如果想要"从零构建"理解这个过程，[Build your own React (Rodrigo Pombo)](https://pomb.us/build-your-own-react/) 是最好的渐进式教程。

- [beginWork 详解](/03-work-loop/02-begin-work) — beginWork 的详细分析，包括 bailout、不同组件类型的处理
- [completeWork 详解](/03-work-loop/03-complete-work) — completeWork 的详细分析，包括 DOM 节点创建
- [Diff 算法](/03-work-loop/04-reconcile-children) — Diff 算法（单节点/多节点）
- [Commit 阶段](/03-work-loop/05-commit-phase) — Commit 阶段的三步走
- [错误边界与恢复](/03-work-loop/06-error-handling) — 错误边界与恢复机制

## 参考资料

- [Inside Fiber (Max Koretskyi) - General algorithm](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — 工作循环详解
- [React 技术揭秘 - render 阶段 (卡颂)](https://react.iamkasong.com/render/flow.html) — Render 阶段中文分析
- [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture) — Fiber 工作原理设计文档
- [Build your own React (Rodrigo Pombo)](https://pomb.us/build-your-own-react/) — 从零实现工作循环
- [Understanding React's Fiber Architecture (Tejas Kumar)](https://gitnation.com/contents/understanding-reacts-fiber-architecture) — Fiber 架构演讲
