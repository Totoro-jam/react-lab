---
title: "为什么 expirationTime 不够用了"
---


> 对应源码：`packages/react-reconciler/src/ReactFiberLane.js`

## 一个让 React 团队头疼的问题

React 16 想实现"高优先级更新打断低优先级渲染"。听起来简单——给每个更新分配一个优先级，高优先级先跑就行了。

他们用了一个直觉方案：**expirationTime（过期时间）**。每个更新有一个时间戳，越早过期的越紧急。

```
更新 A: expirationTime = 5000  （5 秒后过期）
更新 B: expirationTime = 2000  （2 秒后过期）

B 更紧急 → 先处理 B
```

这在一开始工作得很好。但后来他们碰到了一个问题。

## 问题出在哪

想象这个场景：用户在一个搜索框里打字，同时用 `startTransition` 标记了搜索结果的更新为低优先级。

```
T=0:  用户输入 "a" → setInputValue("a") [紧急，expirationTime=1000]
T=0:  startTransition → setSearchQuery("a") [过渡，expirationTime=5000]

T=2:  过渡渲染正在进行中...
T=3:  用户输入 "ab" → setInputValue("ab") [紧急]
T=3:  startTransition → setSearchQuery("ab") [过渡]
```

第二次输入产生了两个新更新。现在我们有两批更新：

```
紧急： "a" 的 setInputValue   → expirationTime=1000
        "ab" 的 setInputValue  → expirationTime=1000
过渡： "a" 的 setSearchQuery  → expirationTime=5000
        "ab" 的 setSearchQuery → expirationTime=5000
```

问题来了：两个过渡更新的 `expirationTime` 相同。React 怎么知道"ab"的过渡更新应该覆盖"a"的？如果它把两个都处理了，用户会先看到 "a" 的搜索结果闪烁，再看到 "ab" 的。

在 expirationTime 模型下，**相同优先级的更新无法区分彼此**。它们只是同一个数字。

## 如果每个优先级有多个"槽位"呢？

React 团队的解决方案：用二进制位代替时间戳。

一个 32 位整数有 31 个可用位。每个位代表一个独立的优先级"车道"（Lane）：

```
expirationTime 模型           Lane 模型
─────────────────────         ─────────────────────────────
一个数字: 5000                 31 位二进制: 0b0000...0100000
只能比大小                     可以按位运算
A > B?                        A | B      → 组合
只能串行                       A & B      → 检查包含
                              A & ~B     → 移除
                              lanes & -lanes → 取最低位（最高优先级）
```

关键差异：**位运算让多个同级别优先级可以并存**。

## 31 条车道

```javascript
// packages/react-reconciler/src/ReactFiberLane.js:41-111

export const TotalLanes = 31;

// 从低位到高位，优先级从高到低
export const SyncHydrationLane: Lane =     0b0000000000000000000000000000001; // bit 0
export const SyncLane: Lane =              0b0000000000000000000000000000010; // bit 1
export const InputContinuousLane: Lane =   0b0000000000000000000000000001000; // bit 3
export const DefaultLane: Lane =           0b0000000000000000000000000100000; // bit 5
// ... 14 个 TransitionLane (bit 8-21) ← 关键！
// ... 4 个 RetryLane (bit 22-25)
export const IdleLane: Lane =              0b0010000000000000000000000000000; // bit 28
export const OffscreenLane: Lane =         0b0100000000000000000000000000000; // bit 29
export const DeferredLane: Lane =          0b1000000000000000000000000000000; // bit 30
```

为什么有 **14 个 TransitionLane**？回到上面的问题：

```
第一次搜索 "a"  → TransitionLane1  (bit 8)
第二次搜索 "ab" → TransitionLane2  (bit 9)

它们在不同的车道上！
React 可以：
  - 处理 Lane2（最新的"ab"搜索）
  - 丢弃 Lane1（过时的"a"搜索）

不需要处理两个，也不需要担心覆盖。
```

这就是 Lane 模型相比 expirationTime 的核心优势：**多个同级别更新可以并存于不同车道，互不干扰。**

## 位运算的魔法

Lane 用位运算实现高效操作：

```javascript
// 合并两个更新的优先级
const combinedLanes = SyncLane | DefaultLane;
// = 0b0000000000000000000000000100010

// 检查是否包含某优先级
const hasSync = (combinedLanes & SyncLane) !== NoLanes;
// = true

// 获取最高优先级（最低位的 1）
const highest = lanes & -lanes;
// 原理：-lanes 是补码 = ~lanes + 1
// lanes & -lanes 恰好保留最低位的 1
```

`lanes & -lanes` 这个技巧值得停下来想。假设 `lanes = 0b0110`：

```
lanes      = 0b0110  (bit 1 和 bit 2)
~lanes     = 0b1001  (取反)
~lanes + 1 = 0b1010  (补码 = -lanes)
lanes & -lanes = 0b0010  (最低位的 1 = 最高优先级)
```

一行代码，O(1) 时间，找到最高优先级。没有循环，没有比较。

## 三套优先级的桥梁

React 内部其实有三套优先级系统，Lane 是其中之一：

Lane (Reconciler)        Event Priority          Scheduler Priority
SyncLane           →     DiscreteEventPriority → UserBlockingPriority (2)
(click, keydown)          （但 SyncLane 走微任务，不经 Scheduler）
InputContinuousLane →     ContinuousEventPriority → UserBlockingPriority (2)
(mousemove, drag)
DefaultLane        →     DefaultEventPriority  → NormalPriority (3)
(网络回调)
TransitionLanes    →     DefaultEventPriority  → NormalPriority (3)
(startTransition)         （落入 default 分支）
IdleLane           →     IdleEventPriority     → IdlePriority (5)
(后台预渲染)

注意：`ImmediatePriority (1)` 实际上不再使用——源码注释说"now that we use microtasks for sync work we no longer use that"。SyncLane 的工作通过微任务处理，不经过 Scheduler。

映射发生在 `ensureRootIsScheduled` 中：

```javascript
// ReactFiberRootScheduler.js（简化）
const newCallbackPriority = getHighestPriorityLane(nextLanes);

if (newCallbackPriority === SyncLane) {
  // 同步：不走 Scheduler，通过微任务调度
} else {
  // 并发：映射到 Scheduler 优先级
  switch (lanesToEventPriority(nextLanes)) {
    case DiscreteEventPriority:   // SyncLane
    case ContinuousEventPriority: // InputContinuousLane
      schedulerPriorityLevel = UserBlockingPriority; break;
    case DefaultEventPriority:    // DefaultLane + TransitionLanes
      schedulerPriorityLevel = NormalPriority; break;
    case IdleEventPriority:       // IdleLane
      schedulerPriorityLevel = IdlePriority; break;
    default:
      schedulerPriorityLevel = NormalPriority; break;
  }
  scheduleCallback(schedulerPriorityLevel, performConcurrentWorkOnRoot);
}
```

## 优先级打断的完整画面

有了 Lane，之前场景的完整流程变得清晰：

```
T=0:  setInputValue("a") → SyncLane (bit 1)
      setSearchQuery("a") via startTransition → TransitionLane1 (bit 8)
      
      pendingLanes = SyncLane | TransitionLane1

      → Scheduler 先处理 SyncLane（输入框立即更新）
      → 然后开始处理 TransitionLane1（"a" 搜索结果）

T=3:  setInputValue("ab") → SyncLane (bit 1)
      setSearchQuery("ab") via startTransition → TransitionLane2 (bit 9)
      
      → SyncLane 到达 → 中断 TransitionLane1 的渲染
      → 丢弃 workInProgress 树（TransitionLane1 的中间结果）
      → 同步渲染 SyncLane（"ab" 输入框立即更新）
      → 然后处理 TransitionLane2（"ab" 搜索结果）

      TransitionLane1？被丢弃了。用户只看到最终的 "ab" 结果。
      没有闪烁，没有中间状态。
```

## Fiber 上的 Lane 字段

每个 Fiber 有两个 Lane 相关字段：

```javascript
lanes: NoLanes,       // 本节点的待处理优先级
childLanes: NoLanes,  // 子树的待处理优先级合集
```

`childLanes` 是冒泡的——子树的 lanes 向上累加。遍历时如果 `fiber.childLanes === NoLanes`，跳过整个子树。

FiberRoot 上还有更丰富的状态：

```javascript
pendingLanes: Lanes,       // 所有待处理的 Lane
suspendedLanes: Lanes,     // 被 Suspense 挂起的
pingedLanes: Lanes,        // 数据就绪可以重试的
expiredLanes: Lanes,       // 超时了必须同步执行的
```

如果一个低优先级任务等太久没被执行（被高优先级一直抢断），它会**过期**——变成同步，必须立即执行。这防止了低优先级任务被饿死。

## 回头看

expirationTime 是一个标量。它能比较大小，但不能表达"同一级别的两个更新是独立的"。Lane 用 31 个二进制位，给每个级别的更新分配独立的车道。位运算让组合、检查、分离都变成 O(1) 操作。

14 个 TransitionLane 看起来"太多了"。但每一个都解决了一个真实问题：多个并发过渡更新需要互不干扰。

这不是过度设计——这是对 expirationTime 不足的精确修复。

## 下一步

- [双缓冲机制](/02-fiber-architecture/05-double-buffering) — 中断时如何安全地丢弃 workInProgress 树
- [优先级体系](/05-scheduler/04-priority-levels) — Scheduler 的 5 级优先级如何与 Lane 映射
- [过渡更新 Transitions](/06-concurrent-features/03-transitions) — Transition 如何利用 Lane 实现可中断更新

## 参考资料

- [What are Lanes in React source code? (JSer.dev)](https://jser.dev/react/2022/03/26/lanes-in-react/) — 最详细的 Lane 模型分析，用具体代码示例解释了位运算和三套优先级映射。
- [Before You memo() (Dan Abramov)](https://overreacted.io/before-you-memo/) — Dan Abramov 渐进式叙事风格示例，展示了如何用"先给出直觉方案，再揭示问题"的结构讲解技术概念。
- [React 源码 ReactFiberLane.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js) — 官方源码，注释中有设计决策说明。
- [React 技术揭秘 - 深入理解优先级 (卡颂)](https://react.iamkasong.com/update/priority.html) — 中文优先级系统分析。
