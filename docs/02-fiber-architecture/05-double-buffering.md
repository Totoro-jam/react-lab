---
title: "双缓冲机制：current 与 workInProgress"
---


> 对应源码：[packages/react-reconciler/src/ReactFiber.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiber.js)（`createWorkInProgress` 函数，约 323-360 行）

## 1. 如果渲染到一半被打断呢？

React 正在渲染一棵有 1000 个组件的树。它用 Fiber 的可中断机制处理，渲染到第 500 个时——用户的输入来了，React 必须暂停当前渲染，去处理更高优先级的用户输入。

问题来了：**如果 React 直接在当前显示的 Fiber 树上修改呢？**

```
渲染组件 #1 → DOM 改了  ← 用户看到了
渲染组件 #2 → DOM 改了  ← 用户看到了
渲染组件 #3 → DOM 还没改（被中断了！）
→ 用户看到的是一个"半更新"的不一致 UI
→ 如果恢复后需要丢弃这次更新？已经在 DOM 上改的怎么办？
```

这就是双缓冲要解决的问题。图形学里的双缓冲（[Double Buffering](https://en.wikipedia.org/wiki/Multiple_buffering)）是先在内存中画完整帧，再一次性替换到屏幕上——避免用户看到"画了一半"的画面。

React 的 Fiber 架构采用了完全相同的思想（参见 [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture)）：

```
没有双缓冲的问题：

  更新组件 A → DOM 改了   ← 用户看到了中间状态
  更新组件 B → DOM 改了   ← 用户看到了中间状态
  更新组件 C → DOM 改了   ← 最终状态

  问题：如果更新被中断（Fiber 允许中断），
        用户会看到"一半更新"的不一致 UI

有双缓冲的解决方案：

  在 workInProgress 树上计算所有更新（内存中，不碰 DOM）
  计算完毕后，一次性 commit 到 DOM
  用户只看到从旧状态 → 新状态的完整切换
  中断恢复也安全：正在计算的工作在内存中，不影响屏幕
```

## 2. alternate 字段：两棵树的纽带

每个 Fiber 节点的 `alternate` 字段指向另一棵树的对应节点（参见 [React 技术揭秘 - Fiber 架构的工作原理](https://react.iamkasong.com/fiber/default.html)）：

```
current 树                    workInProgress 树
Fiber A                      Fiber A'
alternate  → A'              alternate  → A
stateNode: DOM div           stateNode: DOM div （共享！）
memoizedState: old           memoizedState: new
lanes: NoLanes               lanes: NoLanes
flags: NoFlags               flags: Placement
Fiber B                      Fiber B'
alternate  → B'              alternate  → B
stateNode: DOM span          stateNode: DOM span （共享！）
flags: NoFlags               flags: NoFlags
memoizedProps: {count:0}     memoizedProps: {count:1}
注意：stateNode（真实 DOM）是共享的！
两棵树指向同一个 DOM 节点。
在 commit 阶段，React 才真正修改这个 DOM。
```

## 3. createWorkInProgress 的实现

> `alternate` 字段与双缓冲设计的详细分析——包括 `createWorkInProgress` 如何在复用和创建之间选择——参见 [Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/)。

```javascript
// packages/react-reconciler/src/ReactFiber.js:323-360

export function createWorkInProgress(current: Fiber, pendingProps: any): Fiber {
  let workInProgress = current.alternate;

  if (workInProgress === null) {
    // === 情况 1：首次创建（alternate 不存在） ===
    // 懒创建：只有需要更新时才创建 workInProgress
    workInProgress = createFiber(
      current.tag,      // 继承类型
      pendingProps,     // 新的 props
      current.key,      // 继承 key
      current.mode,     // 继承模式
    );
    workInProgress.elementType = current.elementType;
    workInProgress.type = current.type;
    // 共享 stateNode！不创建新的 DOM
    workInProgress.stateNode = current.stateNode;

    // 双向链接
    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    // === 情况 2：复用已有的 workInProgress ===
    workInProgress.pendingProps = pendingProps;
    workInProgress.type = current.type;
    // 重置副作用标记（上次 commit 的标记已过期）
    workInProgress.flags = NoFlags;
    workInProgress.subtreeFlags = NoFlags;
    workInProgress.deletions = null;
  }

  // 保留静态标记（StaticMask），重置其余 flags
  // 静态标记描述 Fiber 固有的副作用特性，跨渲染持续存在
  workInProgress.flags = current.flags & StaticMask;
  workInProgress.lanes = current.lanes;
  workInProgress.childLanes = current.childLanes;
  workInProgress.child = current.child;
  workInProgress.memoizedProps = current.memoizedProps;
  workInProgress.memoizedState = current.memoizedState;
  workInProgress.updateQueue = current.updateQueue;
  // ... 复制 dependencies 等

  return workInProgress;
}
```

两个关键设计：

### 3.1 懒创建

`alternate` 初始为 null，只有在第一次更新时才创建。这避免了首次渲染就为每个 Fiber 分配两个对象，节省内存。

```
首次渲染（mount）：
  createFiber() → Fiber(alternate=null)

第一次更新：
  createWorkInProgress(current)
    → current.alternate === null
    → 创建新 Fiber，设置 alternate
    → 此后 current.alternate 一直存在

后续更新：
  createWorkInProgress(current)
    → current.alternate !== null
    → 复用已有对象，重置 flags
    → 零分配！
```

### 3.2 stateNode 共享

两棵 Fiber 树的 `stateNode` 指向**同一个 DOM 节点**。React 不会在 workInProgress 树上创建新的 DOM——它只是在 workInProgress 上计算"需要做什么"，然后在 commit 阶段对共享的 DOM 执行操作。

## 4. 完整的生命周期

双缓冲在一次完整的渲染周期中经历以下阶段：

```
阶段 0: createFiberRoot（初始化）
  → 创建 FiberRoot + HostRoot Fiber
  → root.current = uninitializedFiber（bare current，alternate=null）
  → 此时只有一棵树，没有 workInProgress

阶段 1: prepareFreshStack（每次渲染准备）
  → createWorkInProgress(root.current, null)
  → 如果 current.alternate === null（首次）：
    → 创建新 Fiber，双向链接 alternate
    → 共享 stateNode（DOM）
  → 如果 current.alternate !== null（后续）：
    → 复用已有 alternate 对象
    → 重置 flags = NoFlags，复制 current 的 state
    → 零内存分配！

阶段 2: Render（workLoop）
  → performUnitOfWork 处理 workInProgress 树
  → beginWork 创建/更新子 Fiber
  → completeWork 创建 DOM + 冒泡 flags
  → 可中断：shouldYield() 让出主线程
  → 中断后 workInProgress 指针保留，下次从这里继续

阶段 3: Commit（同步，不可中断）
  → beforeMutation → mutation → 切换指针 → layout
  → root.current = finishedWork（mutation 之后、layout 之前）

阶段 4: 下次更新
  → 回到阶段 1：createWorkInProgress(root.current, null)
  → 此时 root.current 是上次切换的树
  → 它的 alternate 是上上次的那棵树（自动复用）
  → 循环往复
```

关键：每次更新时 `createWorkInProgress` 会在两棵树之间交替复用。第一次需要创建，之后都是复用——这就是"双缓冲"的名字由来。

## 5. current 指针切换

在 Commit 阶段，current 指针的切换发生在 **mutation 和 layout 之间**（不是最后一步）：

```
Commit 前:
  root.current → current 树（旧的、屏幕上显示的）
  workInProgress 树（新的、内存中构建好的）

mutation 阶段后、layout 阶段前:
  root.current = finishedWork;  // ← 此处切换！
  // finishedWork 就是构建好的 workInProgress 树的根

Commit 后:
  root.current → workInProgress 树（现在它是"当前"树了）
  旧的 current 树变成 alternate（等待下次更新复用）

代码（简化）:
  // ReactFiberWorkLoop.js 中 commitRootImpl
  // mutation 阶段执行 DOM 变更
  // → root.current = finishedWork  ← 切换！
  // layout 阶段执行 componentDidMount / useLayoutEffect
```

这个切换时机确保：

- mutation 阶段时 current 仍指向旧树，`componentWillUnmount` 可访问旧 DOM
- layout 阶段时 current 已指向新树，`componentDidMount` 可访问新 DOM

## 6. bailout 优化：跳过不需要更新的子树

双缓冲的一个重要优化是 **bailout**：如果 workInProgress 和 current 的 props 没有变化（`memoizedProps === pendingProps`），React 可以跳过这个子树的处理。

```
beginWork 中:
  const current = workInProgress.alternate;

  if (current !== null) {
    const oldProps = current.memoizedProps;
    const newProps = workInProgress.pendingProps;

    if (
      oldProps !== newProps ||           // props 变了 → 需要处理
      hasLegacyContextChanged()           // legacy context 变了
    ) {
      didReceiveUpdate = true;             // 标记有更新
    } else {
      // props 和 context 都没变 → 检查是否有调度更新
      const hasScheduledUpdateOrContext =
        checkScheduledUpdateOrContext(current, renderLanes);

      if (
        !hasScheduledUpdateOrContext &&          // 没有调度更新
        (workInProgress.flags & DidCapture) === NoFlags  // 没有错误捕获
      ) {
        // bailout：跳过子树！
        // 调用 attemptEarlyBailoutIfNoScheduledUpdate
        //   → bailoutOnAlreadyFinishedWork
        //     → cloneChildFibers(current, workInProgress)
        return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
      }
    }
  }
```

```
bailout 的效果：

  你有一个大组件树：
  <App>
    <Header />     ← props 没变
    <Sidebar />    ← props 没变
    <Main>         ← state 变了
      <List />
    </Main>
    <Footer />     ← props 没变
  </App>

  只有 <Main> 的 state 变了：
  → App 的 beginWork 检测到子树有更新 → 继续
  → Header 的 beginWork：props 没变 → bailout（跳过！）
  → Sidebar 的 beginWork：props 没变 → bailout（跳过！）
  → Main 的 beginWork：有更新 → 正常处理
  → Footer 的 beginWork：props 没变 → bailout（跳过！）

  大量减少了不必要的工作！
```

## 7. 双缓冲与并发安全

> 并发渲染中断/恢复机制和 `startTransition` 的官方介绍参见 [React v18.0 Blog](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html)。

双缓冲是并发渲染安全的基础：

```
没有双缓冲的并发渲染（假想）：
  直接在 current 树上修改
  → 中断后 current 树处于不一致状态
  → 继续处理时可能基于错误的数据
  → 用户可能看到中间状态

有双缓冲的并发渲染（实际）：
  在 workInProgress 树上修改
  → 中断后 current 树不受影响（屏幕显示不变）
  → 恢复时从 workInProgress 继续
  → 即使丢弃 workInProgress，也只是浪费计算，不会影响用户

这就是为什么 React 可以安全地：
  1. 中断渲染
  2. 恢复渲染
  3. 丢弃渲染
  4. 重新开始渲染
```

## 下一步

现在你已经理解了 Fiber 的核心数据结构，可以继续学习工作循环：

- [工作循环全景](/03-work-loop/01-work-loop-overview) — beginWork → completeWork 的完整流程
- [Diff 算法](/03-work-loop/04-reconcile-children) — Diff 算法如何比较新旧子节点
- [Hooks 的 Mount 与 Update 机制](/04-hooks-internals/01-hooks-mount-update) — Hooks 如何挂载在 Fiber 的 memoizedState 上

## 参考资料

- [Inside Fiber (Max Koretskyi) - Current and work in progress trees](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — 双缓冲详解
- [React Fiber Architecture (Andrew Clark) - alternate](https://github.com/acdlite/react-fiber-architecture) — alternate 字段的设计说明
- [React 技术揭秘 - Fiber 架构的工作原理 (卡颂)](https://react.iamkasong.com/fiber/default.html) — 双缓冲中文分析
- [React v18.0 Blog - Concurrent React](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html) — 并发渲染原理
