---
title: "React 架构演进：从 Stack Reconciler 到 Fiber"
---


> 对应源码：[`packages/react-reconciler/src/ReactFiberWorkLoop.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js)

## 1. 一切从一个问题开始

你在组件里调用了 `setState`，然后 UI 更新了。这个过程中 React 内部发生了什么？Dan Abramov 在 [How Does setState Know What to Do?](https://overreacted.io/how-does-setstate-know-what-to-do/) 中从一个类似的问题出发，深入到了 React 的依赖注入机制。

在回答这个问题之前，我们需要先理解 React 架构的演进历史。因为今天的 React 内部架构，正是为了解决昨天的问题而诞生的。

## 2. 浏览器渲染机制：理解 16.6ms

浏览器的主线程同时负责 JavaScript 执行和 UI 渲染。它们是互斥的——一个在跑，另一个就得等。

浏览器一帧（约 16.6ms @ 60fps）的各个阶段：

| JS 执行 | 样式计算 | 布局 | 绘制 | 合成 | 空闲 |
|---------|---------|------|------|------|------|

> ← 如果 JS 执行时间过长，后面的全部被挤压 →

如果 JavaScript 执行占据了整个帧甚至跨帧，用户就会看到：

- 动画丢帧（卡顿）
- 交互无响应（输入延迟）
- 页面"冻结"

## 3. Stack Reconciler（React 15 及之前）

### 3.1 工作方式

React 15 的 Reconciler 采用递归方式遍历组件树，过程不可中断：

1. `setState()` 触发
2. → **Component** → 递归遍历子组件
3. ↓ → **Child A** → 递归遍历子组件
4. ↓ → **Child B** → 递归遍历子组件
5. ↓ ... 一直递归到叶子节点 ...
6. ↓ 整棵树处理完毕 → 一次性提交 DOM 更新

- **特点**：同步、递归、不可中断
- **问题**：组件树太深 → 主线程被长时间阻塞 → 丢帧

### 3.2 核心问题

Stack Reconciler 使用的是 JavaScript 引擎自身的函数调用栈。当你递归遍历一棵深度为 N 的组件树时，调用栈深度就是 N。这个过程无法暂停——一旦开始，就要执行到栈空为止。

JavaScript 调用栈（Stack Reconciler）从栈底到栈顶（越压越深，无法中途退出）：

- `renderRoot()` ← 栈底
  - `reconcileChildren()`
    - `renderComponentA()`
      - `reconcileChildren()`
        - `renderComponentB()`
          - ... ← 栈越压越深，无法中途退出

问题：

1. 无法中断 —— 递归一旦开始就停不下来
2. 无法恢复 —— 即使强行中断，也无法从断点继续
3. 无优先级 —— 所有更新一视同仁，先到先做

这意味着：如果用户在一个大型表单中输入文字，触发的状态更新如果导致整棵树重新渲染，主线程就会被阻塞，用户的输入会感到明显延迟。

## 4. Fiber 架构的设计动机

React 团队需要解决三个核心问题。Andrew Clark（Fiber 的作者）在 [React Fiber Architecture](https://github.com/acdlite/react-fiber-architecture) 设计文档中详细阐述了这些动机：

Fiber 的目标：

1. **可中断**：工作中途可以暂停，让出主线程
2. **可恢复**：暂停后能从断点继续，不丢失中间结果
3. **可优先**：不同类型的更新有不同的优先级

### 4.1 核心思路：用自己的"栈"代替 JS 调用栈

JS 调用栈的问题是它由引擎控制，你无法暂停和恢复。Fiber 的核心思路是：**用链表结构在内存中模拟一个调用栈**，这样你就可以随时暂停、恢复、甚至丢弃。

| JS 调用栈（不可控） | Fiber 链表（可控） |
| --- | --- |
| frame C | Fiber C |
| frame B | ↑ return → Fiber B |
| frame A | ↑ return → Fiber A |
| 引擎控制，你无法暂停 | 你控制，想停就停 |
| | 想恢复就恢复 |
| | 链表结构在内存中，你可以遍历、暂停、恢复 |

### 4.2 链表代替树

Fiber 节点之间不再用递归树连接，而是用三个指针形成链表：

- **Parent**
  - ↓ child
    - **Child1** → sibling → **Child2** → sibling → **Child3**
      - (Child1/2/3 的 return 都指向 Parent)

三个指针的职责：

- `child` : 指向第一个子节点
- `sibling` : 指向下一个兄弟节点
- `return` : 指向父节点（处理完本节点后"返回"到哪里）

这种结构使得遍历可以从任意节点暂停，再从该节点恢复。

## 5. 新架构三层模型

Fiber 架构将 React 内部分为三层，各司其职：

**React 应用**

- 用户代码：useState, useEffect, JSX, Component...

**Scheduler（调度器）**

- 职责：决定什么时候开始工作，按什么优先级
- 实现：时间切片 + 最小堆优先级队列
- 源码：[packages/scheduler/src/](https://github.com/facebook/react/tree/eafeac097b/packages/scheduler/src)
- 关键概念：
  - `frameYieldMs = 5`（每 5ms 检查是否需要让出主线程）
  - 5 级优先级：Immediate > UserBlocking > Normal > Low > Idle
  - 最小堆按 `sortIndex`（到期时间）排序

↓ 分配时间片，传入任务

**Reconciler（协调器）**

- 职责：遍历 Fiber 树，找出变化，标记副作用
- 实现：Fiber 链表 + 工作循环（Work Loop）
- 源码：[packages/react-reconciler/src/](https://github.com/facebook/react/tree/eafeac097b/packages/react-reconciler/src)
- 关键概念：
  - `workLoopConcurrentByScheduler`：while + shouldYield() 检查
  - beginWork（向下）→ completeWork（向上）
  - 双缓冲：current ↔ workInProgress
  - Lane 模型：31 位二进制表示优先级

↓ 产出带副作用的 Fiber 树

**Renderer（渲染器）**

- 职责：将 Reconciler 产出的变化应用到目标平台
- 实现：各平台独立的 HostConfig
  - ReactDOM: [packages/react-dom/](https://github.com/facebook/react/tree/eafeac097b/packages/react-dom) + [react-dom-bindings/](https://github.com/facebook/react/tree/eafeac097b/packages/react-dom-bindings)
  - React Native: [packages/react-native-renderer/](https://github.com/facebook/react/tree/eafeac097b/packages/react-native-renderer)
  - SSR (Fizz): [packages/react-server-dom-webpack/](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-webpack) 等
  - Test: [packages/react-test-renderer/](https://github.com/facebook/react/tree/eafeac097b/packages/react-test-renderer)（React 19 中已废弃，推荐使用 @testing-library/react）

### 5.1 三层之间的工作流

1. 用户交互（如 click）
2. → 事件处理 → 触发 setState
3. → 标记更新（分配 Lane）→ 通知 Scheduler

**Scheduler**：

- 按优先级排序任务，分配时间片
- 时间到了 → 调用 Reconciler 的工作函数

**Reconciler（Render 阶段，可中断）**：

- `while (workInProgress !== null && !shouldYield)`
  - `performUnitOfWork(workInProgress)`
  - `performUnitOfWork`:
    1. `beginWork` → 创建/更新子 Fiber
    2. `completeWork` → 创建 DOM 节点，收集副作用
- 时间片用完？→ `shouldYield() = true` → 暂停
- 浏览器空闲？→ 恢复，从 workInProgress 继续

**Renderer（Commit 阶段，不可中断）**：

- 遍历带副作用的 Fiber，执行真实 DOM 操作
- 分三步：
  1. before mutation → `getSnapshotBeforeUpdate`
  2. mutation → DOM 增删改
  3. layout → `componentDidMount` 等

这里有一个关键设计决策：**Reconciler 阶段在内存中工作，不碰真实 DOM，所以可以安全中断。Commit 阶段操作真实 DOM，不可中断，必须一次性完成。**

## 6. 源码验证：工作循环

让我们看看源码中的实际实现：

```javascript
// packages/react-reconciler/src/ReactFiberWorkLoop.js:2772
// 源码：https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js

// 同步工作循环 —— 不可中断
function workLoopSync() {
  // Perform work without checking if we need to yield between fiber.
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

// packages/react-reconciler/src/ReactFiberWorkLoop.js:3056
// 并发工作循环 —— 可中断
function workLoopConcurrent(nonIdle: boolean) {
  // We yield every other "frame" when rendering Transition or Retries.
  // For Idle work we yield every 5ms to keep animations going smooth.
  if (workInProgress !== null) {
    const yieldAfter = now() + (nonIdle ? 25 : 5);
    // ...
  }
}

// packages/react-reconciler/src/ReactFiberWorkLoop.js:3073
// 通过 Scheduler 驱动的并发工作循环
function workLoopConcurrentByScheduler() {
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```

注意三种工作循环的区别：

- `workLoopSync`：纯 while 循环，没有 `shouldYield()` 检查
- `workLoopConcurrent`：内部管理时间，Transition 更新每 25ms yield，Idle 更新每 5ms yield
- `workLoopConcurrentByScheduler`：由 Scheduler 的 `shouldYield()` 决定何时暂停

而 `performUnitOfWork` 就是处理一个 Fiber 节点的"单元工作"：

```javascript
// packages/react-reconciler/src/ReactFiberWorkLoop.js:3081
function performUnitOfWork(unitOfWork: Fiber): void {
  // current 是 unitOfWork 的 alternate（上一轮的 Fiber）
  const current = unitOfWork.alternate;
  // ... beginWork 处理当前节点，返回子节点
  // ... completeWork 处理完成后的逻辑
  // workInProgress 被更新为下一个要处理的节点
}
```

## 7. Lane 模型：优先级的二进制表示

React 16 早期使用 `expirationTime`（一个时间戳）表示优先级。React 18+ 改为 **Lane 模型**——用 31 位二进制数表示不同的优先级，支持更灵活的优先级组合和批量处理。关于 Lane 模型如何从 `expirationTime` 演进为位运算系统，[What are Lanes in React source code? (JSer.dev)](https://jser.dev/react/2022/03/26/lanes-in-react/) 做了逐函数的源码分析。

```javascript
// packages/react-reconciler/src/ReactFiberLane.js:41-111
// 源码：https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js

export const TotalLanes = 31;

// 从高到低的优先级（位 0 = 最高优先级）
export const SyncHydrationLane: Lane =           0b0000000000000000000000000000001;
export const SyncLane: Lane =                    0b0000000000000000000000000000010;
export const InputContinuousHydrationLane: Lane =0b0000000000000000000000000000100;
export const InputContinuousLane: Lane =         0b0000000000000000000000000001000;
export const DefaultHydrationLane: Lane =        0b0000000000000000000000000010000;
export const DefaultLane: Lane =                 0b0000000000000000000000000100000;
// ... TransitionLanes (14 个过渡优先级，bit 8-21)
// ... RetryLanes (4 个重试优先级，bit 22-25)
// ... IdleLane, OffscreenLane, DeferredLane
// 注意：bit 6 是 GestureLane，bit 7 是 TransitionHydrationLane

// 优先级从高到低：
// SyncHydration > Sync > InputContinuous > Default > Gesture > TransitionHydration > Transition(×14) > Retry(×4) > Idle > Offscreen > Deferred
```

用二进制位运算的好处是：可以用按位或 `|` 组合多个优先级，用按位与 `&` 检查是否包含某优先级，用 `getHighestPriorityLane()` 快速找到最高优先级。

## 8. Scheduler 的五个优先级

Scheduler（[`packages/scheduler/src/SchedulerPriorities.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerPriorities.js)）定义了 5 级优先级，与 Lane 模型是不同的系统，但存在映射关系：

```javascript
export const NoPriority = 0;         // 无优先级
export const ImmediatePriority = 1;  // 已弃用（React 通过微任务处理同步工作，不再使用此优先级）
export const UserBlockingPriority = 2; // 用户交互阻塞（如点击、输入）
export const NormalPriority = 3;     // 普通优先级（如网络请求后的数据更新）
export const LowPriority = 4;        // 低优先级（如分析数据上报）
export const IdlePriority = 5;       // 空闲时执行（如隐藏内容的预渲染）
```

Scheduler 内部使用 **最小堆**（[`SchedulerMinHeap.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerMinHeap.js)）来管理任务队列，按 `sortIndex`（即 `expirationTime`）排序，到期时间最短的任务在堆顶，最先被执行。

时间切片的阈值定义在 [`SchedulerFeatureFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerFeatureFlags.js)：

```javascript
export const frameYieldMs = 5; // 主线程被阻塞超过 5ms 后让出
```

## 9. 架构演进总结

| React 15 (Stack Reconciler) | | React 16+ (Fiber Reconciler) |
| --- | --- | --- |
| 递归遍历，不可中断 | → | 链表遍历，可中断可恢复 |
| 无优先级调度 | → | Lane 模型 + Scheduler 调度 |
| Reconciler 与 Renderer 交替执行（边算边改 DOM） | → | Reconciler 与 Renderer 分离（先算后改，先内存后 DOM） |
| **问题**： | | **解决**： |
| 大组件树阻塞主线程 | | 时间切片让出主线程 |
| 无法插入高优先级任务 | | 优先级可打断低优先级 |
| 用户交互卡顿 | | 并发渲染提升体验 |

## 10. 对生命周期的影响

架构变化直接影响了对生命周期的设计：

| React 15 生命周期 | | React 16+ 生命周期 |
| --- | --- | --- |
| `componentWillMount` | | (废弃) `UNSAFE_componentWillMount` |
| `componentWillReceiveProps` | | (废弃) `UNSAFE_componentWillReceiveProps` |
| `componentWillUpdate` | | (废弃) `UNSAFE_componentWillUpdate` |
| `render` | | `render`（Render 阶段，可中断） |
| *Diff 阶段* | | `getDerivedStateFromProps` |
| | | `shouldComponentUpdate` |
| `componentDidUpdate` | | *Commit 阶段（不可中断）* |
| `componentWillUnmount` | | `getSnapshotBeforeUpdate` |
| | | `componentDidMount` |
| | | `componentDidUpdate` |
| | | `componentWillUnmount` |

- 旧生命周期在 Diff 阶段执行，可能被多次调用（有副作用风险）
- 现在明确区分：Render 阶段（可中断/重复）vs Commit 阶段（安全）

## 11. React Foundation：治理独立化

React 从 2013 年开源到 2025 年，治理结构经历了一次根本性转变——从一个公司内部项目变为由独立基金会管理的开源基础设施。

### 11.1 时间线

| 日期 | 事件 |
|------|------|
| 2025-10-07 | 在 React Conf 上宣布 [创建 React Foundation 的意向](https://react.dev/blog/2025/10/07/introducing-the-react-foundation)，由 Meta 贡献项目至 Linux Foundation |
| 2026-02-24 | [React Foundation 正式成立](https://react.dev/blog/2026/02/24/the-react-foundation)，React、React Native、JSX 所有权从 Meta 转移至 Foundation |

### 11.2 治理结构

React Foundation 采用**业务治理与技术治理分离**的双轨制：

**业务治理（Foundation Board）**——管理学院资金与运营：

- 执行董事：**Seth Webster**（原 Meta React 团队负责人）
- 八个铂金创始成员各派代表组成董事会
- 职责：维护基础设施（GitHub、CI、商标）、组织 React Conf、资助生态项目

**技术治理（独立于 Foundation 董事会）**：

- 技术方向由实际贡献和维护者决定，独立于基金会董事会
- 已成立**临时领导小组（Provisional Leadership Council）**制定技术治理结构
- 原则：任何单一公司都不应在技术决策中占主导地位

### 11.3 铂金创始成员

2025 年 10 月公布时七家，2026 年 2 月正式成立时增至八家：

| 成员 | 代表 | 生态贡献 |
| ------ | ------ | ---------- |
| **Meta** | Eli White | React 创建者，承诺 5 年 $3M+ 资金与专职工程团队 |
| **Vercel** | Tom Occhino (CPO) | Next.js 生态，React Conf 联合组织 |
| **Microsoft** | Ruhiyyih Mahalati (VP Azure) | Azure Portal 等 React 大规模应用 |
| **Amazon** | Tapas Roy (VP Devices) | Fire TV 等 React Native 设备 |
| **Callstack** | Mike Grabowski (CTO) | React Native 生态核心贡献 |
| **Expo** | Charlie Cheever (Co-founder) | React Native 工具链 |
| **Software Mansion** | Krzysztof Magiera | React Native 核心库维护 |
| **Huawei** | Gong Ti (OpenHarmony) | 2026 年 2 月新增，OpenHarmony 跨平台 |

### 11.4 Foundation 的使命与倡议

根据 [react.foundation](https://react.foundation/about)：

- **独立管护**：作为中立的项目托管方
- **生态投资**：资助维护者、教育者、组织者
- **全球参与**：让更多社区参与技术方向

三项旗舰倡议：

1. **RIS Scoring**（React Impact Signals）：基于性能、教育、生态健康指标对齐投资
2. **Community of Interested Stakeholders (CoIS)**：维护者、企业、教育者的结构化论坛
3. **Global Meetups & Stewardship**：区域聚会与下一代维护者培养

Foundation 跟踪 **63 个生态仓库**（React 基础设施、库、框架、测试工具、UI 系统、样式方案），使贡献识别和资助方式可审计。

### 11.5 Meta 的五年承诺

Meta 承诺与 React Foundation 五年合作，包括超过 $3M 资金和专职工程团队支持。Meta 仍将 React 作为 Web 和跨平台 UI 的首选工具。[Meta 工程博客](https://engineering.fb.com/2025/10/07/open-source/introducing-the-react-foundation-the-new-home-for-react-react-native/) 称此为"确保 React 平稳过渡到独立治理，同时维持社区期望的稳定性和创新力"。

### 11.6 当前版本

截至 2026 年 8 月，当前最新稳定版本为 React 19.2.7（发布于 2026 年 6 月），开发中的版本为 19.3.0（源码 `ReactVersions.js` 中已可见）。React 19.2 引入了 `<Activity>` 组件（原 Offscreen 稳定化）、`useEffectEvent`、Partial Pre-rendering、Performance Tracks 等核心新特性，详见 [React 19.2 官方博客](https://react.dev/blog/2025/10/01/react-19-2)。

## 12. 下一步学习

现在你对 React 的架构演进有了宏观理解。接下来建议：

- [React 设计哲学](/00-overview/04-design-philosophy) — 十三条设计原则和起源故事
- [版本演进历史](/00-overview/05-version-history) — 从 2013 到 2026 的完整版本演进时间线
- [关键设计决策](/00-overview/06-design-decisions) — 七个关键设计决策的"为什么"
- [Monorepo 包结构](/00-overview/02-package-map) — 了解各个包的具体职责和源码结构
- [核心理念心智模型](/00-overview/03-mental-model) — 建立 React 的核心理念心智模型
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — 深入 Fiber 节点的数据结构

## 参考资料

- [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture) — Fiber 架构的官方设计文档
- [Inside Fiber: in-depth overview of the new reconciliation algorithm (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — 最详细的 Fiber 源码分析之一
- [React 技术揭秘 (卡颂)](https://react.iamkasong.com/) — 中文 React 源码分析教程
- [React Design Principles (React 官方)](https://legacy.reactjs.org/docs/design-principles.html) — 设计原则中的调度部分
- [React v18.0 Blog](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html) — 并发特性介绍
- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — Activity、useEffectEvent、Partial Pre-rendering
- [Introducing the React Foundation (官方)](https://react.dev/blog/2025/10/07/introducing-the-react-foundation) — Foundation 宣告
- [The React Foundation 正式成立 (官方)](https://react.dev/blog/2026/02/24/the-react-foundation) — 2026 年正式成立
- [Linux Foundation 新闻稿](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-react-foundation) — 铂金成员、Seth Webster 执行董事
- [Meta 工程博客](https://engineering.fb.com/2025/10/07/open-source/introducing-the-react-foundation-the-new-home-for-react-react-native/) — Meta 五年 $3M+ 承诺
- [React Foundation 官网](https://react.foundation/about) — 治理、RIS Scoring、CoIS 倡议
- [React 19: What's New for Developers (Scrimba 2026)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — 2026 年视角的完整状态表
- [React Versions (官方)](https://react.dev/versions) — 全部版本归档
