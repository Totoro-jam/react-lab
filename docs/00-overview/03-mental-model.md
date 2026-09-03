---
title: "React 核心理念心智模型"
---


> 对应源码：`packages/shared/ReactTypes.js`, `packages/react/src/`

## 1. React 的第一性原理

> 参见 [React Basic Theoretical Concepts](https://github.com/reactjs/react-basic) — React 官方对核心理论概念的阐述。

React 的全部设计可以浓缩为一个公式：

```
UI = f(state)

  UI    : 用户看到的界面
  f     : 你的组件函数（纯函数）
  state : 应用状态（props + 内部状态）
```

这个公式意味着：

- **给定相同的 state，UI 总是相同的**（可预测性）
- **state 变了，UI 就变了**（响应式）
- **你只需要管 state，f（组件）是纯函数，React 负责算出 UI 并更新**（声明式）

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   状态 (state/props)                                         │
│        │                                                    │
│        ▼                                                    │
│   ┌─────────┐                                               │
│   │  组件 f  │  ← 纯函数：输入相同 → 输出相同                 │
│   └────┬────┘                                               │
│        │                                                    │
│        ▼                                                    │
│   React Element 树（描述 UI 应该长什么样）                    │
│        │                                                    │
│        ▼                                                    │
│   ┌─────────────────┐                                       │
│   │ React Reconciler │  ← 比较新旧 Element 树，算出差异       │
│   └────┬────────────┘                                       │
│        │                                                    │
│        ▼                                                    │
│   副作用列表（Placement / Update / ChildDeletion）                │
│        │                                                    │
│        ▼                                                    │
│   ┌─────────┐                                               │
│   │ Renderer │  ← 把差异应用到真实环境（DOM / Native / SSR）  │
│   └─────────┘                                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 2. 五个核心理念

### 2.1 声明式 > 命令式

```javascript
// 命令式（jQuery 时代）：
$('#counter').text(count + 1);  // 告诉浏览器"怎么做"

// 声明式（React）：
function Counter({ count }) {
  return <span>{count}</span>;  // 告诉 React"是什么"
}
// React 负责算出怎么从旧的 DOM 过渡到新的 DOM
```

你只需要描述"UI 在某个状态下应该是什么样"，React 负责把真实的 DOM 从旧状态过渡到新状态。这让你不用关心 DOM 操作的细节，只关心数据和 UI 的映射关系。

### 2.2 组件 = 函数

> 参见 [Making Sense of React Hooks (Dan Abramov)](https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889) — 组件作为函数的设计动机。

```
传统理解：组件 = 模板 + 逻辑 + 样式（分子）
React 理解：组件 = 纯函数（输入 props/state，输出 UI 描述）

function Greeting({ name }) {
  return <h1>Hello, {name}</h1>;
}

// 输入相同 → 输出相同
Greeting({ name: "Alice" }) → <h1>Hello, Alice</h1>
Greeting({ name: "Alice" }) → <h1>Hello, Alice</h1>  // 永远一样
```

函数组合替代继承：

```
┌─────────────┐
│  <App>       │  ← 顶层组件
│  ┌─────────┐│
│  │<Layout> ││  ← 布局组件
│  │┌───────┐││
│  ││<Nav>  │││  ← 导航组件
│  │└───────┘││
│  │┌───────┐││
│  ││<Main> │││  ← 内容组件
│  ││┌─────┐│││
│  │││<List>│││  ← 列表组件
│  ││└─────┘│││
│  │└───────┘││
│  └─────────┘│
└─────────────┘

不是通过继承实现组合，
而是通过函数调用（组件嵌套）实现。
```

### 2.3 拉取（Pull）而非 推送（Push）

```
推送模型（Push）：                    拉取模型（Pull）：
                                      React 采用此模型
 数据变了 ──推送──→ 重新计算           ┌─────────────┐
                                      │  数据变了    │
 "数据到就立刻算"                      └──────┬──────┘
 不考虑优先级                                 │
 可能因高频数据变更导致性能问题        React: "我来看需不需要算"
                                      ┌──────┴──────┐
                                      │ 我现在有空   │ ← 检查优先级和时间
                                      │ 先算高优先级的│ ← 可延迟低优先级的
                                      │ 合并多个更新  │ ← 批量处理
                                      └─────────────┘
```

Dan Abramov 在 [React 设计原则](https://legacy.reactjs.org/docs/design-principles.html) 中解释了为什么选择 Pull 模型：

> React 不是一个通用的数据处理库，它是一个构建用户界面的库。它在应用中处于独特的位置，知道哪些计算现在是重要的，哪些不是。如果某些内容在屏幕外，我们可以延迟相关逻辑。如果数据到达速度超过了帧率，我们可以合并和批量更新。我们可以优先处理用户交互引起的更新，而不是不太重要的后台工作。

### 2.4 一致性原则

```
错误（中间状态可见）：              正确（React 的做法）：

  更新组件 A → DOM 变了              更新组件 A → 内存中计算
  更新组件 B → DOM 变了              更新组件 B → 内存中计算
  更新组件 C → DOM 变了              更新组件 C → 内存中计算
                                         │
  用户看到了中间状态！                     ▼
  （A 变了但 B 还没跟上）            一次性提交所有 DOM 变更
                                    用户看到的是完整的新状态
```

这就是为什么 React 分为 **Render 阶段**（内存中计算，可中断）和 **Commit 阶段**（同步操作 DOM，不可中断）。双缓冲（current / workInProgress）机制正是为此设计——workInProgress 树在内存中构建完整后，才一次性替换 current 树。

### 2.5 单向数据流

```
┌──────────────────────┐
│     Parent State      │
│  (source of truth)    │
└──────────┬───────────┘
           │ props（向下流动）
           ▼
    ┌────────────┐
    │   Child A   │
    └─────┬──────┘
          │ props
          ▼
    ┌────────────┐
    │  GrandChild │
    └────────────┘

  数据只能从父到子向下流动（通过 props）
  子组件不能直接修改父组件的状态
  子组件通过回调（callback）通知父组件（Event Up）
```

这与"双向绑定"（如 Vue 的 v-model、Angular 的 ngModel）形成对比。单向数据流让数据变化的来源可追踪，调试更容易。

## 3. React Element vs Fiber vs DOM

很多概念容易混淆（参见 [React Components, Elements, and Instances](https://legacy.reactjs.org/blog/2015/12/18/react-components-elements-and-instances.html)）。这三个是不同层次的东西：

```
你写的 JSX                              React 内部                    浏览器
───────────────                         ─────────────                ────────

<div className="box">                   Fiber 节点                   <div class="box">
  <span>Hello</span>                                                      <span>Hello</span>
</div>                                  ┌──────────┐                 </div>

经过 Babel 编译：                       │  div      │
                                       │  tag=5    │                  DOM 树
React.createElement('div',             │  ↓child   │
  { className: 'box' },                └────┬─────┘
  React.createElement('span',               │
    null, 'Hello')                     ┌────┴─────┐
)                                      │  span    │
                                       │  tag=5    │
React Element 对象：                   └────┬─────┘
{                                           │
  type: 'div',                         ┌────┴─────┐
  key: null,                           │  Hello    │
  props: {                             │  tag=6    │  ← HostText
    className: 'box',                  │  memoized │
    children: {                          │  State:"Hello"│
      type: 'span',                    └──────────┘
      ...
    }
  }
}

不可变，每次 render 新建               可变，持久的                由 React 创建/更新

描述"想要什么"                         记录"正在做什么"            用户最终看到的
```

| 特性 | React Element | Fiber | DOM Node |
| ------ | -------------- | ------- | ---------- |
| 创建时机 | 每次 render | 首次渲染创建，后续复用 | 首次渲染创建 |
| 可变性 | 不可变 | 可变（持续推进） | 可变 |
| 生命周期 | 临时（用完即弃） | 持久（贯穿多次渲染） | 持久 |
| 作用 | 描述 UI 应该是什么 | 记录工作进度和状态 | 真实的 UI 渲染 |
| 对应关系 | 1:1 对应 JSX 中的标签 | 1:1 对应 Element | 1:1 对应 Fiber（Host 类型） |

## 4. React 的"两层抽象"

> 相关阅读：[The Two Reacts (Dan Abramov)](https://overreacted.io/the-two-reacts/) — 为什么 React 有两个层次。

```
┌──────────────────────────────────────────────────┐
│  第一层抽象：React Element                        │
│                                                  │
│  JSX → React.createElement → React Element 对象  │
│                                                  │
│  这一层是"渲染目标无关"的：                       │
│  不管渲染到 DOM、Native 还是 SSR，Element 都一样  │
│                                                  │
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────┐
│  第二层抽象：Fiber                                │
│                                                  │
│  Element → createFiber → Fiber 节点              │
│                                                  │
│  这一层也是"渲染目标无关"的：                     │
│  Fiber 的结构统一，但通过 HostConfig 适配不同平台 │
│                                                  │
│  Fiber 上的 `stateNode` 字段指向具体的宿主实例：  │
│  - DOM 环境 → 真实的 HTMLElement                  │
│  - Native 环境 → 原生 View                       │
│  - SSR 环境 → null（服务端没有真实 DOM）          │
│                                                  │
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────┐
│  具体平台渲染                                     │
│                                                  │
│  DOM:    createElement, appendChild, removeChild │
│  Native:createView, addChildView, removeChildView│
│  SSR:    拼接 HTML 字符串                         │
│                                                  │
└──────────────────────────────────────────────────┘
```

## 5. 更新的生命周期模型

在 Fiber 架构下，"一次更新"的完整流程：

```
用户操作（click, input...）
    │
    ▼
事件处理器
    │
    ▼
setState / dispatch
    │
    ▼
创建 Update 对象，分配 Lane
    │
    ├─ packages/react-reconciler/src/ReactFiberConcurrentUpdates.js
    │
    ▼
scheduleUpdateOnFiber(root, fiber, lane)
    │
    ├─ packages/react-reconciler/src/ReactFiberWorkLoop.js
    │
    ▼
ensureRootIsScheduled(root)
    │
    ├─ packages/react-reconciler/src/ReactFiberRootScheduler.js
    │    判断是否需要新的调度（可能批量合并）
    │
    ├───→ scheduleCallback(priority, performConcurrentWorkOnRoot)
    │    │
    │    └─ packages/scheduler/src/forks/Scheduler.js
    │       放入最小堆，等待执行
    │
    ▼ （Scheduler 时间片到了）
performConcurrentWorkOnRoot(root)
    │
    ▼
renderRootConcurrent(root, lanes)
    │
    ├─ packages/react-reconciler/src/ReactFiberWorkLoop.js
    │
    ▼
workLoopConcurrent / workLoopConcurrentByScheduler
    │
    │  while (workInProgress !== null && !shouldYield()) {
    │    performUnitOfWork(workInProgress);
    │  }
    │
    ├───→ performUnitOfWork(fiber)
    │         │
    │         ├─ beginWork(fiber)
    │         │    ├─ ReactFiberBeginWork.js
    │         │    └─ 根据 tag 调用对应的 update 函数
    │         │       ├─ updateFunctionComponent → 调用你的函数组件
    │         │       ├─ updateClassComponent → 调用 render()
    │         │       ├─ updateHostComponent → 处理 DOM 元素
    │         │       └─ reconcileChildren → Diff 算法
    │         │
    │         └─ completeUnitOfWork(fiber)
    │              ├─ ReactFiberCompleteWork.js
    │              ├─ 创建 DOM 节点（首渲染）
    │              ├─ 收集副作用到 subtreeFlags
    │              └─ 返回 sibling 或 return
    │
    ▼ （所有 fiber 处理完毕）
commitRoot(root)
    │
    ├─ packages/react-reconciler/src/ReactFiberWorkLoop.js
    │
    ▼
调度 passive effects（如果 subtreeFlags 有 Passive）
    │
    └─ scheduleCallback(flushPassiveEffects) — 异步，paint 之后执行
    │
    ▼
commitBeforeMutationEffects
    │
    └─ getSnapshotBeforeUpdate
    │
    ▼
commitMutationEffects
    │
    └─ 执行 DOM 增删改 + ref detach
    │
    ▼
切换 current 指针：root.current = finishedWork
    │  ← mutation 之后、layout 之前
    │
    ▼
commitLayoutEffects
    │
    ├─ componentDidMount / componentDidUpdate
    ├─ useLayoutEffect 回调（同步执行）
    └─ ref attach
    │
    ▼
（异步）flushPassiveEffects — useEffect 回调执行
    │
    └─ 浏览器 paint 之后
```

## 6. 心智模型总结

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  React 的心智模型可以归纳为四句话：                               │
│                                                                 │
│  1. UI 是状态的函数映射        →  v = f(d)                       │
│  2. 状态变化驱动 UI 更新       →  你改 state，React 改 UI        │
│  3. React 拉取式调度           →  React 决定何时算，而非数据推送  │
│  4. 先算后提交，保证一致性     →  内存算完 → 一次性改 DOM         │
│                                                                 │
│  你需要记住的核心数据结构：                                      │
│                                                                 │
│  React Element  ←  不可变的 UI 描述（每次 render 新建）          │
│  Fiber          ←  可变的工作单元（持久存在，记录状态和进度）     │
│  Lane           ←  31 位二进制优先级（决定更新的紧迫程度）       │
│  Hook           ←  单链表节点（挂在 Fiber 的 memoizedState 上）  │
│                                                                 │
│  你需要记住的核心流程：                                          │
│                                                                 │
│  setState → 分配 Lane → Scheduler 入队 → 时间片到 → WorkLoop    │
│  → beginWork（向下）→ completeWork（向上）→ commit（三种操作）   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 下一步

现在你已经建立了 React 的整体心智模型，可以开始深入各个主题：

- [React 核心 API](/01-react-core/01-component-lifecycle) — 从你熟悉的 API 切入，看它们背后的源码实现
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — 直接深入 Fiber 数据结构
- [工作循环全景](/03-work-loop/01-work-loop-overview) — 理解工作循环的完整流程
- [Scheduler 设计哲学](/05-scheduler/01-scheduler-design) — 了解时间切片和优先级调度

## 参考资料

- [React Basic Theoretical Concepts (React 官方)](https://github.com/reactjs/react-basic) — React 理论概念
- [React Design Principles (React 官方)](https://legacy.reactjs.org/docs/design-principles.html) — 设计原则
- [Making Sense of React Hooks (Dan Abramov)](https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889) — Hooks 设计动机
- [React Components, Elements, and Instances (Dan Abramov)](https://legacy.reactjs.org/blog/2015/12/18/react-components-elements-and-instances.html) — 区分三个核心概念
- [A deep dive into React Fiber (Reddit 讨论)](https://www.reddit.com/r/reactjs/comments/14pj7ej/a_deep_dive_into_react_fiber_and_source_code/) — 社区深入讨论
