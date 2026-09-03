---
title: "Commit 阶段"
---


> 对应源码：[`packages/react-reconciler/src/ReactFiberCommitWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitWork.js), [`ReactFiberCommitEffects.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitEffects.js), [`ReactFiberCommitHostEffects.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitHostEffects.js)

## 1. Commit 阶段的定位

Commit 阶段是 Render 阶段之后的同步执行阶段。**它不可中断**——一旦开始，必须在一次调用中完成所有 DOM 操作。[Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) 将这个过程称为"list of effects"的遍历与执行。

```
Render 阶段 → 产出带 flags 的 workInProgress Fiber 树
                    │
                    ▼
Commit 阶段 → 遍历 Fiber 树，根据 flags 执行真实操作
              → 切换 current 指针
```

## 2. 三个子阶段

根据 [`commitRootImpl`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js) 源码，passive effects 的**调度**发生在三个子阶段**之前**，current 指针的切换在 mutation 和 layout **之间**：

```
┌─ commitRoot ──────────────────────────────────────────────────┐
│                                                               │
│  Step 0: 调度 passive effects（三阶段之前）                     │
│    检查 subtreeFlags & PassiveMask                            │
│    → scheduleCallback(flushPassiveEffects)                    │
│    → 只是排入异步队列，不在此执行                               │
│                                                               │
│  ┌─ 1. beforeMutation ─────────────────────────────────────┐  │
│  │  DOM 变更前执行                                          │  │
│  │  ├─ getSnapshotBeforeUpdate（类组件）                    │  │
│  │  └─ 处理 ClassSnapshot、FormReset 等                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                    │
│                          ▼                                    │
│  ┌─ 2. mutation ───────────────────────────────────────────┐  │
│  │  DOM 变更                                                │  │
│  │  ├─ Placement：创建并插入 DOM 节点                        │  │
│  │  ├─ ChildDeletion：删除 DOM 节点                         │  │
│  │  ├─ Update：更新 DOM 属性                                 │  │
│  │  ├─ Ref：detach ref（清除旧 ref）                         │  │
│  │  ├─ Hydrating：水合对比                                   │  │
│  │  └─ ViewTransition：视图过渡                             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                    │
│  切换 root.current = finishedWork  ← mutation 之后、layout 之前│
│                          │                                    │
│                          ▼                                    │
│  ┌─ 3. layout ─────────────────────────────────────────────┐  │
│  │  DOM 变更后执行（同步，阻塞 paint）                       │  │
│  │  ├─ componentDidMount / componentDidUpdate               │  │
│  │  ├─ useLayoutEffect 回调执行                             │  │
│  │  └─ Ref：attach ref（挂载新 ref）                        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                          │                                    │
│                          ▼                                    │
│  ┌─ 4. passive（异步，paint 之后执行）─────────────────────┐  │
│  │  flushPassiveEffects() 由 Step 0 调度的回调触发           │  │
│  │  ├─ 先执行上次的清理函数（cleanup，从上到下）             │  │
│  │  └─ 再执行本次的回调（create，从下到上）                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

关键时序：

- `useLayoutEffect` 在 Step 3 **同步执行**（阻塞浏览器 paint）
- `useEffect` 在 Step 4 **异步执行**（paint 之后）
- `useLayoutEffect` 总是先于 `useEffect`
- current 指针在 mutation 和 layout 之间切换，不是在 layout 内部

## 3. 遍历方式：深度优先 + subtreeFlags 优化

Commit 阶段不是遍历整棵树，而是只遍历**有副作用的子树**：

```javascript
// ReactFiberCommitWork.js（简化）
// [源码位置](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitWork.js)
function commitMutationEffects(root, finishedWork, committedLanes) {
  commitMutationEffectsOnFiber(finishedWork, root, committedLanes);
}

function commitMutationEffectsOnFiber(finishedWork, root) {
  const flags = finishedWork.flags;
  const subtreeFlags = finishedWork.subtreeFlags;

  // 先递归处理子树（如果有副作用标记）
  if (subtreeFlags !== NoFlags) {
    let child = finishedWork.child;
    while (child !== null) {
      commitMutationEffectsOnFiber(child, root);
      child = child.sibling;
    }
  }

  // 再处理自身
  if ((flags & Placement) !== NoFlags) {
    commitPlacement(finishedWork);
    finishedWork.flags &= ~Placement; // 清除标记
  }

  if ((flags & ChildDeletion) !== NoFlags) {
    const deletions = finishedWork.deletions;
    if (deletions !== null) {
      for (const childToDelete of deletions) {
        commitDeletionEffects(root, finishedWork, childToDelete);
      }
    }
    finishedWork.flags &= ~ChildDeletion;
  }

  if ((flags & Update) !== NoFlags) {
    commitUpdate(finishedWork);
    finishedWork.flags &= ~Update;
  }
}
```

优化：如果 `subtreeFlags === NoFlags`，直接跳过子树遍历。

## 4. Mutation 阶段的 DOM 操作

### 4.1 commitPlacement（插入）

```javascript
function commitPlacement(finishedWork) {
  // 找到父 DOM 节点
  const parentFiber = getHostParentFiber(finishedWork);
  const parent = parentFiber.stateNode; // 真实 DOM

  // 找到插入位置（前一个兄弟节点的 DOM）
  const before = getHostSibling(finishedWork);

  // 插入 DOM
  if (before === null) {
    insertOrAppendPlacementNode(finishedWork, parent);
  } else {
    insertBefore(parent, finishedWork.stateNode, before);
  }
}
```

`insertOrAppendPlacementNode` 最终调用 `parent.appendChild(child)` 或 `parent.insertBefore(child, before)`。

### 4.2 commitDeletionEffects（删除）

删除比插入复杂——需要递归删除整棵子树，并且要处理：

- 每个子组件的 `componentWillUnmount`
- 每个 `useEffect` 的 cleanup
- 每个 `useLayoutEffect` 的 cleanup
- detach ref
- 卸载 Context 依赖

```javascript
function commitDeletionEffects(root, returnFiber, deletedFiber) {
  // 递归遍历要删除的子树
  // 在每个节点上执行清理逻辑（在 commitDeletionEffectsOnFiber 中）
  // 清除 Fiber 的连接
  // ...
}
```

### 4.3 commitUpdate（更新属性）

```javascript
// ReactFiberCommitWork.js（简化）
// 从 finishedWork.memoizedProps（新）和 current.memoizedProps（旧）获取 props
const newProps = finishedWork.memoizedProps;
const oldProps = current.memoizedProps;

// 传入 HostConfig 的 commitUpdate
commitUpdate(
  finishedWork.stateNode,  // 真实 DOM
  finishedWork.type,        // 元素类型（'div', 'span'...）
  oldProps,                 // 旧属性
  newProps,                 // 新属性
);

// commitUpdate 内部调用 updateProperties(domElement, type, oldProps, newProps)
// updateProperties 在此处 diff 新旧 props 并应用到 DOM
// 注意：props diff 发生在 commit 阶段，不是在 completeWork 阶段
```

## 5. Layout 阶段：生命周期和 useLayoutEffect

```javascript
// ReactFiberCommitEffects.js（简化）
// [源码位置](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitEffects.js)
  commitLayoutEffectOnFiber(finishedWork);
}

function commitLayoutEffectOnFiber(finishedWork) {
  switch (finishedWork.tag) {
    case ClassComponent: {
      const instance = finishedWork.stateNode;
      if (finishedWork.flags & Update) {
        if (current === null) {
          // mount → componentDidMount
          instance.componentDidMount();
        } else {
          // update → componentDidUpdate
          instance.componentDidUpdate(
            prevProps, prevState, snapshot
          );
        }
      }
      break;
    }

    case FunctionComponent: {
      // 执行 useLayoutEffect（使用 Update flag，不是 Passive）
      if (finishedWork.flags & Update) {
        commitHookLayoutEffects(finishedWork, HookLayout | HookHasEffect);
      }
      break;
    }
  }
}
```

`commitHookLayoutEffects` 遍历 Fiber 的 hooks 链表，执行 `useLayoutEffect` 的回调和清理函数。

## 6. Passive 阶段：useEffect 的异步执行

useEffect 与 useLayoutEffect 的区别在于**执行时机**。Dan Abramov 在 [useEffect vs useLayoutEffect](https://gist.github.com/gaearon/1d19088790e70acfd1fff9c28c6e8c4c) 中用具体示例解释了为什么这个区别很重要。[React 技术揭秘 - commit 阶段](https://react.iamkasong.com/commit/phase.html) 也对这个区别做了源码级讲解。

```
useLayoutEffect:
  在 Commit 的 layout 阶段同步执行
  → DOM 已变更，但浏览器尚未绘制
  → 可以读取布局信息（如 getBoundingClientRect）
  → 会阻塞浏览器绘制

useEffect:
  在 Commit 完成后，通过 Scheduler 异步调度
  → 浏览器已经绘制完毕
  → 不会阻塞绘制
  → 适合大多数副作用（订阅、日志等）
```

```javascript
// 调度 passive effects
function commitRoot(root) {
  // ... 同步阶段（beforeMutation → mutation → layout）

  if (root.current.flags & Passive) {
    // 有 useEffect 需要执行
    scheduleCallback(NormalPriority, () => {
      flushPassiveEffects();
    });
  }
}

function flushPassiveEffects() {
  // 1. 先执行所有 cleanup（上次的清理函数）
  //    遍历所有有 Passive flag 的 Fiber
  //    对每个 hook 执行 destroy()
  commitPassiveUnmountEffects();

  // 2. 再执行所有 effect 回调
  //    遍历同样的 Fiber
  //    对每个 hook 执行 create()
  commitPassiveMountEffects();
}
```

## 7. current 指针切换

current 指针在 mutation 阶段结束后、layout 阶段开始前切换（不是在 layout 内部）：

```javascript
// ReactFiberWorkLoop.js commitRootImpl（简化）
commitMutationEffects(root, finishedWork, lanes);  // mutation 完成
root.current = finishedWork;                        // ← 此处切换
commitLayoutEffects(finishedWork, root, lanes);    // layout 开始
```

```
切换前:
  root.current → old current tree（屏幕上的旧状态）
  workInProgress tree（内存中的新状态，已 commit 到 DOM）

切换后:
  root.current → workInProgress tree（现在它是"当前"了）
  old current → 成为其 alternate（等待下次更新复用）

注意：两棵树共享同一组 DOM（stateNode）
      DOM 已经在 mutation 阶段被更新了
      切换指针只是更新 React 的"哪个树是当前显示的"记录
```

## 8. 为什么 Commit 不可中断

```
如果 Commit 被中断会发生什么？

  mutation 阶段开始了：
    div 被插入了 DOM ← 用户看到了
    span 正在更新属性... ← 中断！

  问题 1：用户看到了部分更新的 UI（不一致）
  问题 2：componentDidUpdate 可能只执行了一半
  问题 3：useLayoutEffect 只执行了一部分
  问题 4：ref 可能处于半更新状态

  → 这些都不是可以安全中断的操作

这就是为什么：
  - Render 阶段（内存计算）可以安全中断
  - Commit 阶段（DOM 操作 + 生命周期）必须同步完成
```

## 下一步

- [错误边界与恢复](/03-work-loop/06-error-handling) — 如果 Commit 或 Render 出错怎么办
- [useEffect / useLayoutEffect](/04-hooks-internals/03-effect-hooks) — useEffect/useLayoutEffect 的详细机制
- [合成事件系统](/07-event-system/01-synthetic-events) — 事件处理如何映射到 Commit 阶段

## 参考资料

- [Inside Fiber (Max Koretskyi) - Commit phase](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — Commit 三阶段逐函数分析
- [React 技术揭秘 - commit 阶段 (卡颂)](https://react.iamkasong.com/commit/phase.html) — 中文 Commit 阶段分析
- [React 源码 ReactFiberCommitWork.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitWork.js) — Commit 阶段执行逻辑
- [useEffect vs useLayoutEffect (Dan Abramov)](https://gist.github.com/gaearon/1d19088790e70acfd1fff9c28c6e8c4c) — effect 执行时机详解
