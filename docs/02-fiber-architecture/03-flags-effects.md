---
title: "副作用标记系统：Flags"
---


> 对应源码：[packages/react-reconciler/src/ReactFiberFlags.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberFlags.js)

## 1. 什么是副作用（Effect）

在 React 的语境中，"副作用"指的是**渲染计算本身之外需要执行的操作**。比如：

- 将新的 DOM 节点插入页面（Placement）
- 更新 DOM 节点的属性（Update）
- 删除 DOM 节点（ChildDeletion）
- 执行 `useEffect` 回调（Passive）
- 执行 `useLayoutEffect` 回调（Update/Layout）
- 更新 `ref`（Ref）
- 调用 `getSnapshotBeforeUpdate`（Snapshot）
- 重置表单（FormReset = Snapshot ← 同一位！）

Reconciler 在 Render 阶段计算 Fiber 树时，会把需要执行的操作以二进制位标记在 Fiber 的 `flags` 字段上。Commit 阶段再根据这些标记执行实际操作。`useEffect` 与 `useLayoutEffect` 在 Commit 中的执行时机不同，详见 [Dan Abramov: useEffect vs useLayoutEffect](https://gist.github.com/gaearon/1d19088790e70acfd1fff9c28c6e8c4c)。

## 2. 为什么要用位标记

> 旧版 effectList 链表机制的详细分析参见 [Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/)。

```
旧方案（React 16）：effectTag + effectList 链表
  构建 firstEffect → nextEffect → lastEffect 单向链表
  优点：Commit 只需遍历链表
  缺点：构建链表有额外开销，且全树都要参与链表构建

新方案（React 17+）：flags + subtreeFlags 位标记
  用位运算标记副作用，用 subtreeFlags 冒泡标记子树
  优点：无需构建链表，Commit 时按需遍历子树
  缺点：需要遍历更多节点（但 subtreeFlags 可以跳过无副作用子树）
```

## 3. 完整的 Flags 定义

```javascript
// packages/react-reconciler/src/ReactFiberFlags.js

// 不可更改的值（DevTools 依赖）
export const NoFlags =                /*   */ 0b0000000000000000000000000000000;
export const PerformedWork =          /*   */ 0b0000000000000000000000000000001;
export const Placement =              /*   */ 0b0000000000000000000000000000010;
export const DidCapture =             /*   */ 0b0000000000000000000000010000000;
export const Hydrating =              /*   */ 0b0000000000000000001000000000000;

// 可更改的值
export const Update =                 /*   */ 0b0000000000000000000000000000100;
export const Cloned =                 /*   */ 0b0000000000000000000000000001000;
export const ChildDeletion =          /*   */ 0b0000000000000000000000000010000;
export const ContentReset =           /*   */ 0b0000000000000000000000000100000;
export const Callback =               /*   */ 0b0000000000000000000000001000000;

export const ForceClientRender =      /*   */ 0b0000000000000000000000100000000;
export const Ref =                    /*   */ 0b0000000000000000000001000000000;
export const Snapshot =               /*   */ 0b0000000000000000000010000000000;
export const Passive =                /*   */ 0b0000000000000000000100000000000;

export const Visibility =             /*   */ 0b0000000000000000010000000000000;
export const StoreConsistency =       /*   */ 0b0000000000000000100000000000000;

// 位复用别名（不同 Fiber 类型互斥，可以安全复用同一位）
export const Hydrate = Callback;              // Hydrate 和 Callback 共用 bit 6
export const FormReset = Snapshot;            // FormReset 和 Snapshot 共用 bit 10 ← 关键！
export const DidDefer = ContentReset;          // DidDefer 和 ContentReset 共用 bit 5
export const ShouldSuspendCommit = Visibility;
export const ScheduleRetry = StoreConsistency;
export const AffectedParentLayout = ContentReset;

// 静态标记（跨渲染持续，描述"这个 Fiber 总是有某种副作用"）
export const Forked =                 /*   */ 0b0000000000100000000000000000000;
export const SnapshotStatic =         /*   */ 0b0000000001000000000000000000000;
export const LayoutStatic =           /*   */ 0b0000000010000000000000000000000;
export const RefStatic = LayoutStatic;         // Ref 和 Layout 共用静态位
export const PassiveStatic =          /*   */ 0b0000000100000000000000000000000;
export const MaySuspendCommit =       /*   */ 0b0000001000000000000000000000000;
export const ViewTransitionStatic =   /*   */ 0b0000010000000000000000000000000;
export const PortalStatic =           /*   */ 0b0000100000000000000000000000000;

// 内部状态标记（不是真正的副作用）
export const Incomplete =             /*   */ 0b0000000000000001000000000000000;
export const ShouldCapture =          /*   */ 0b0000000000000010000000000000000;
export const ForceUpdateForLegacySuspense = /* */ 0b0000000000000100000000000000000;

// 各阶段掩码（Commit 按掩码过滤需要处理的 Fiber）
// BeforeMutationMask = Snapshot（默认 build）
// MutationMask = Placement | Update | ChildDeletion | ContentReset | Ref | Hydrating | Visibility | FormReset
// LayoutMask = Update | Callback | Ref | Visibility
// PassiveMask = Passive | Visibility | ChildDeletion
```

## 4. Flags 分类

```
┌─────────────────────────────────────────────────────────────┐
│                    Flags 分类                                │
├──────────────────┬──────────────────────────────────────────┤
│                  │                                          │
│  DOM 操作         │  Placement（插入）                        │
│  (Mutation)      │  Update（更新属性/内容）                   │
│                  │  ChildDeletion（删除子节点）               │
│                  │  ContentReset（内容重置）                  │
│                  │                                          │
├──────────────────┼──────────────────────────────────────────┤
│                  │                                          │
│  生命周期/Hooks    │  Passive（useEffect）                     │
│  (Lifecycle)     │  Update（useLayoutEffect /            │
│                  │         componentDidUpdate）              │
│                  │  Callback（setState 回调）                 │
│                  │  Snapshot（getSnapshotBeforeUpdate）       │
│                  │                                          │
├──────────────────┼──────────────────────────────────────────┤
│                  │                                          │
│  Ref             │  Ref（需要 attach/detach ref）             │
│                  │                                          │
├──────────────────┼──────────────────────────────────────────┤
│                  │                                          │
│  错误恢复         │  Incomplete（渲染不完整，需要恢复）         │
│  (Error)         │  ShouldCapture（错误边界应该捕获）         │
│                  │  DidCapture（已捕获错误）                  │
│                  │  ForceClientRender（强制客户端渲染）       │
│                  │                                          │
├──────────────────┼──────────────────────────────────────────┤
│                  │                                          │
│  Hydration       │  Hydrating（正在水合）                     │
│                  │  Hydrate = Callback（位复用别名）            │
│                  │                                          │
├──────────────────┼──────────────────────────────────────────┤
│                  │                                          │
│  可见性           │  Visibility（可见性变化，Offscreen 用）    │
│                  │                                          │
├──────────────────┼──────────────────────────────────────────┤
│                  │                                          │
│  静态标记         │  PassiveStatic（总有 useEffect）           │
│  (Static)        │  LayoutStatic（总有 useLayoutEffect）     │
│                  │  SnapshotStatic（总有 Snapshot）           │
│                  │  这些跨渲染持续，用于优化 commit 遍历       │
│                  │                                          │
└──────────────────┴──────────────────────────────────────────┘
```

## 5. flags 和 subtreeFlags 的冒泡机制

```
beginWork（向下）: 处理每个 Fiber，标记自己的 flags
          │
          ▼
completeWork（向上）: 收集子树的 flags，冒泡到父节点的 subtreeFlags

例如：
         ┌─ div ───────────────────────────────────┐
         │  flags: NoFlags                          │
         │  subtreeFlags: Placement | Passive       │
         └──┬───────────────┬───────────────────────┘
            │ child         │ sibling
            ▼               ▼
     ┌─ button ──┐    ┌─ span ──────────┐
     │ flags:     │    │ flags: Placement│  ← 新插入的节点
     │  Passive   │    │ subtreeFlags:   │
     │  (有       │    │  NoFlags        │
     │  useEffect)│    └─────────────────┘
     └───────────┘

冒泡规则：
  parent.subtreeFlags |= child.flags | child.subtreeFlags

这样 Commit 阶段遍历到 div 时，
看到 subtreeFlags 有 Placement，就知道子树有插入操作，
但不需要遍历到 button（因为 button 不涉及 Placement）。
```

位运算的好处是高效且可组合：

```javascript
// 检查是否包含某标记
if ((fiber.flags & Placement) !== NoFlags) {
  // 需要插入 DOM
}

// 检查子树是否包含某标记
if ((fiber.subtreeFlags & Passive) !== NoFlags) {
  // 子树中有 useEffect 需要执行
}

// 组合多个标记
fiber.flags |= Placement;
fiber.flags |= Update;
// 等价于 fiber.flags = Placement | Update;
```

## 6. Commit 阶段如何使用 Flags

> 参见 [React 技术揭秘 - commit 阶段](https://react.iamkasong.com/commit/phase.html) — Commit 三阶段详细分析。

Commit 阶段分三步，每步处理不同的 Flags（实际逻辑在 [`ReactFiberCommitWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitWork.js) 中）。根据 [`commitRootImpl`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js) 源码，passive effects 的**调度**发生在三个子阶段**之前**，而 useEffect 的**执行**则在所有 commit 工作完成后异步发生：

```
┌─ Commit 阶段 ─────────────────────────────────────────────────┐
│                                                               │
│  Step 0: 调度 passive effects（三阶段之前）                     │
│  ─────────────────────────────────────                        │
│  检查 subtreeFlags & PassiveMask                              │
│    → scheduleCallback(flushPassiveEffects)                    │
│    → useEffect 回调不会在此执行，只是排入异步队列                 │
│    → 将在浏览器 paint 之后异步执行                               │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Step 1: beforeMutation（DOM 变更前）                          │
│  ─────────────────────────────────────                        │
│  BeforeMutationMask = Snapshot（默认 build）                   │
│  检查 flags: Snapshot                                         │
│    → ClassComponent: 调用 getSnapshotBeforeUpdate()           │
│    → HostRoot: clearContainer()（清空容器）                    │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Step 2: mutation（DOM 变更）                                  │
│  ────────────────────────────                                 │
│  MutationMask = Placement | Update | ChildDeletion |          │
│    ContentReset | Ref | Hydrating | Visibility | FormReset     │
│  检查 flags: Placement                                        │
│    → 创建 DOM 节点并插入                                        │
│  检查 flags: ChildDeletion                                     │
│    → 删除子节点                                                 │
│  检查 flags: Update                                           │
│    → 更新 DOM 属性                                             │
│  检查 flags: ContentReset                                     │
│    → 重置文本内容                                              │
│  检查 flags: Ref                                              │
│    → detach ref（卸载旧 ref）                                  │
│  检查 flags: Hydrating                                        │
│    → 对比水合属性                                              │
│  检查 flags: FormReset (= Snapshot)                            │
│    → 标记 needsFormReset，mutation 后重置表单                   │
│                                                               │
│  切换 current 指针：root.current = finishedWork                │
│  ← 此处切换！mutation 之后、layout 之前                         │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Step 3: layout（DOM 变更后，同步执行）                         │
│  ──────────────────────────────                               │
│  LayoutMask = Update | Callback | Ref | Visibility             │
│  检查 flags: Update                                           │
│    → 调用 componentDidUpdate() / componentDidMount()           │
│    → 执行 useLayoutEffect 回调（同步，阻塞 paint）              │
│  检查 flags: Callback                                         │
│    → 执行 setState 的回调函数                                  │
│  检查 flags: Ref                                              │
│    → attach ref（挂载新 ref）                                  │
│  检查 flags: Visibility                                       │
│    → 处理可见性变化                                             │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  Step 4: passive effects（异步，paint 之后）                    │
│  ──────────────────────────────                               │
│  flushPassiveEffects() 由 Step 0 中调度的回调触发               │
│    PassiveMask = Passive | Visibility | ChildDeletion           │
│    → 执行 useEffect 的 cleanup（从上到下）                      │
│    → 执行 useEffect 的 create（从下到上）                       │
│    → 此时浏览器已经 paint，用户看到了新 UI                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

关键时序要点：

```
useLayoutEffect 在 Step 3 同步执行（阻塞 paint）
useEffect 在 Step 4 异步执行（paint 之后）
→ useLayoutEffect 总是先于 useEffect 执行

current 指针在 Step 2 和 Step 3 之间切换
→ mutation 阶段时 current 仍指向旧树（componentWillUnmount 可访问旧 DOM）
→ layout 阶段时 current 指向新树（componentDidMount 可访问新 DOM）
```

## 7. Static Flags 的优化

静态标记是 React 17+ 的重要优化。它表示"这个 Fiber 总是有某种副作用，即使本次渲染没有变化"。

```
场景：一个组件有 useEffect，但本次渲染的 deps 没变，effect 不会触发。
没有 Static Flags 的情况：
  每次 unmount 时都要遍历子树检查是否有 Passive effect 需要清理

有 Static Flags 的情况：
  组件首次渲染时设置 PassiveStatic
  unmount 时只要检查 PassiveStatic 标记就知道有没有 effect 需要清理
  不需要遍历整个子树！
```

```javascript
// Static Flags 在首次渲染时设置：
fiber.flags |= PassiveStatic;  // 这个 Fiber 总有 useEffect

// 之后即使 deps 没变、effect 不触发，
// unmount 时也能快速知道需要清理：
if ((fiber.flags & PassiveStatic) !== NoFlags) {
  // 快速路径：需要清理 passive effects
} else {
  // 快速路径：跳过，不需要清理
}
```

## 8. 位复用：同一个 bit 不同含义

32 位整数很快会不够用。React 通过**位复用**（bit reuse）来扩展可用"槽位"——不同 Fiber 类型不会同时出现同一种 flag，所以可以安全共用同一个 bit：

```
bit 6 (Callback):  类组件 setState 回调 (Callback)
                   水合操作 (Hydrate = Callback)
                   两种用途互斥：类组件不会有 Hydrate 标记

bit 10 (Snapshot): class 组件 getSnapshotBeforeUpdate (Snapshot)
                   表单重置 (FormReset = Snapshot)
                   两种用途互斥：HostComponent 表单不会有 getSnapshotBeforeUpdate
                   ← 这就是为什么 Snapshot 同时出现在 BeforeMutationMask
                     和 MutationMask 中（分别作为 Snapshot 和 FormReset）

bit 5 (ContentReset): 文本内容重置 (ContentReset)
                      延迟提交标记 (DidDefer = ContentReset)
```

源码注释解释了原因："It's OK to reuse these bits because these flags are mutually exclusive for different fiber types."

## 9. 错误恢复相关的标记

错误边界（Error Boundary）的恢复过程涉及多个 flag：

```
正常渲染
    │
    ▼
组件抛出错误
    │
    ▼
React 标记 ShouldCapture
    │
    ▼
unwindWork 回退到错误边界
    │
    ▼
错误边界清除 ShouldCapture，设置 DidCapture
    │
    ▼
错误边界渲染 fallback UI
    │
    ▼
正常完成

flag 流转：
  ShouldCapture →（标记到出错组件和它的祖先链）
  DidCapture   →（标记到捕获错误的错误边界组件）
  ForceClientRender →（SSR 水合失败，强制客户端渲染）
  Incomplete   →（渲染未完成，需要 unwind）
```

## 下一步

- [Lane 优先级模型](/02-fiber-architecture/04-lanes-priorities) — Lane 优先级模型（另一个二进制系统）
- [双缓冲机制](/02-fiber-architecture/05-double-buffering) — 双缓冲机制
- [Commit 阶段](/03-work-loop/05-commit-phase) — Commit 阶段中如何根据 Flags 执行 DOM 操作

## 参考资料

- [Inside Fiber (Max Koretskyi) - Side-effects and effect list](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — 副作用系统详解
- [React 源码 ReactFiberFlags.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberFlags.js) — 官方源码
- [React 技术揭秘 - commit 阶段 (卡颂)](https://react.iamkasong.com/commit/phase.html) — Commit 三阶段分析
