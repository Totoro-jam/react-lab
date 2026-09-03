---
title: "为什么 React 要重新发明调用栈"
---


> 对应源码：`packages/react-reconciler/src/ReactInternalTypes.js:89-210`, `packages/react-reconciler/src/ReactFiber.js:134-207`

## 从一个卡顿的页面说起

你有没有遇到过这样的情况：在一个大型 React 应用里点击按钮，页面"冻住"了零点几秒——动画停了，输入框不响应，整个页面像死了一样。

2017 年之前的 React，这个问题几乎无解。

原因很简单：**React 15 的渲染过程一口气跑完，中间不会停**。

```
用户点击 → setState → React 递归遍历组件树 → 跑完 → 更新 DOM
                         这段时间主线程被完全占用
                         用户输入排队，动画帧丢掉
```

JavaScript 的函数调用栈不支持暂停。你调用了一个递归函数，它就会一层层压栈，直到栈空为止。你无法在中间说"等一下，让浏览器先处理用户输入"。

React 团队做了一个激进的决定：**不用 JavaScript 的调用栈，自己造一个**。

他们叫它 Fiber。

## 如果能暂停，然后呢？

先别管怎么实现。假设我们真的能在渲染过程中暂停——那我们需要记录什么？

```
暂停时需要记住：
  1. 刚才处理到哪个组件了？（下次从这里继续）
  2. 这个组件的状态是什么？（不能丢）
  3. 它的子组件处理完了吗？（要知道进度）
  4. 处理完这个组件后回到哪里？（"返回地址"）
```

你会发现，这和一个**栈帧**需要记录的信息几乎一样。函数调用栈的每个栈帧记录：返回地址、局部变量、参数。我们需要的"暂停点"也记录类似的东西。

Fiber 就是**手写的、存在内存里的、可以随时暂停和恢复的虚拟栈帧**。

源码注释说得很直接：

```javascript
// packages/react-reconciler/src/ReactInternalTypes.js:87-88
// A Fiber is work on a Component that needs to be done or was done.
// There can be more than one per component.
```

"每个组件可以有多个 Fiber"——这不是笔误。一个组件在更新时同时存在两个 Fiber：一个代表屏幕上的当前状态（current），一个代表正在计算的新状态（workInProgress）。这就是"双缓冲"。

## 造一个栈：从零开始

### Step 1：最基本的——记录"这是谁"

我们需要一个对象来表示一个组件的工作单元。最起码，它得知道自己是哪种组件：

```javascript
const fiber = {
  tag: 5,           // 这是什么类型？5 = HostComponent（DOM 元素）
  key: null,        // 列表中的唯一标识
  elementType: 'div',
  type: 'div',      // 函数组件→函数本身，DOM→字符串标签名
  stateNode: null,  // 指向真实 DOM 节点或组件实例
};
```

`tag` 是一个数字，告诉 React "该怎么处理这个节点"。函数组件是 0，类组件是 1，DOM 元素是 5。完整列表有 31 种，但日常开发你只会碰到五六种。

`stateNode` 是 Fiber 和真实世界的桥梁：DOM 元素的 `stateNode` 是 `HTMLDivElement`，类组件的是 `new Component()` 实例，函数组件的是 `null`（没有实例）。

### Step 2：连接成树——但不用递归

现在我们有一堆 Fiber 对象了。怎么把它们组织成树？

传统树的实现用 `parent` 和 `children` 数组。但 React 选了一种更聪明的结构——**链表**：

```javascript
const fiber = {
  // ...上面的字段
  return: null,   // 父节点（叫 return 不叫 parent，因为概念上等于"返回地址"）
  child: null,    // 第一个子节点
  sibling: null,  // 下一个兄弟节点
  index: 0,       // 在兄弟中的位置（Diff 用）
};
```

```
DOM 树：
  div
  / \
 h1   p
 |
 span

Fiber 链表（child / sibling / return 指针）：

  div ─child─▶ h1
              │return
  ◀─return───┘
  │
  sibling
  ▼
  p ─child─▶ span
  │return     │return
  └───────────┘
  h1.return = div, p.return = div, span.return = p
```

为什么用链表而不是树？

因为**链表只需要 while 循环就能遍历，不需要递归**。而递归意味着使用 JavaScript 的调用栈——那恰恰是我们想要避免的东西。

```javascript
// 以下是对遍历逻辑的概念模型简化。
// 实际源码中，"向下"和"向右/向上"分别由 performUnitOfWork 和
// completeUnitOfWork 两个函数处理（见下文源码）。

let fiber = rootFiber;
while (fiber !== null) {
  doSomething(fiber);
  if (fiber.child !== null) {
    fiber = fiber.child;        // 有子节点 → 向下
  } else if (fiber.sibling !== null) {
    fiber = fiber.sibling;      // 有兄弟 → 向右
  } else {
    fiber = fiber.return;       // 都没有 → 向上
    while (fiber !== null && fiber.sibling === null) {
      fiber = fiber.return;     // 继续向上找兄弟
    }
    if (fiber !== null) {
      fiber = fiber.sibling;
    }
  }
}
```

实际的 React 源码将这个遍历逻辑拆成了两步——`performUnitOfWork` 负责"向下"（调用 `beginWork`，返回子节点），`completeUnitOfWork` 负责"向右和向上"（调用 `completeWork`，然后检查 sibling / return）：

```javascript
// ReactFiberWorkLoop.js:3081-3123（简化）
function performUnitOfWork(unitOfWork) {
  const current = unitOfWork.alternate;
  let next = beginWork(current, unitOfWork, entangledRenderLanes);

  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    // beginWork 返回 null → 没有子节点 → 进入 complete 阶段
    completeUnitOfWork(unitOfWork);
  } else {
    // 有子节点 → 下一轮处理子节点
    workInProgress = next;
  }
}

// ReactFiberWorkLoop.js:3368-3431（简化）
function completeUnitOfWork(unitOfWork) {
  let completedWork = unitOfWork;
  do {
    completeWork(completedWork.alternate, completedWork, entangledRenderLanes);
    // ↑ completeWork 处理当前节点，可能 spawn 新的子节点

    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      workInProgress = siblingFiber;  // 有兄弟 → 下一轮处理兄弟
      return;
    }
    completedWork = completedWork.return;  // 无兄弟 → 向上
    workInProgress = completedWork;
  } while (completedWork !== null);
  // completedWork === null → 到达 root，整棵树处理完毕
}
```

看看 `workLoopConcurrentByScheduler` 的源码——它就是一个 while 循环，每次处理一个 Fiber，然后检查 `shouldYield()`：

```javascript
// ReactFiberWorkLoop.js:3073-3079
function workLoopConcurrentByScheduler() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```

`shouldYield()` 检查时间片是否用完。如果用完了？退出循环。下次恢复时从 `workInProgress` 指向的 Fiber 继续。**没有递归，没有调用栈，随时可以暂停。**

### Step 3：记住状态——props 和 state

组件有 props 和 state。Fiber 需要记住"上次的"和"这次的"：

```javascript
const fiber = {
  // ...上面的字段
  pendingProps: { count: 1 },  // 本次渲染的新 props
  memoizedProps: { count: 0 }, // 上次渲染的旧 props
  updateQueue: null,           // 更新队列
  memoizedState: null,         // 上次渲染的 state
  dependencies: null,          // Context 依赖
};
```

为什么需要"新的"和"旧的"两份？因为 React 需要比较它们来判断是否可以跳过（bailout）。如果 `pendingProps === memoizedProps`（引用相同），且没有 state 更新——整个子树都不用处理。

这里有一个关键的巧思：函数组件没有 `this.state`，那它的状态存在哪？

**就存在 `memoizedState` 上**。但不是存一个值——而是存一个 **hooks 链表**的头节点：

```
fiber.memoizedState → hook1(useState) → hook2(useEffect) → hook3(useMemo) → null
```

你每次调用 `useState`、`useEffect`，React 就是在遍历这个链表，取出对应的节点。"Rules of Hooks"说不能在条件里调用 Hooks？不是因为什么 React 限制——只是因为条件调用会让链表错位。**一切都只是数据结构。**

### Step 4：标记副作用——渲染后要做什么

渲染计算本身不应该碰 DOM。那"需要插入 DOM""需要更新属性""需要删除节点"这些操作怎么记录？

用位标记：

```javascript
const fiber = {
  // ...上面的字段
  flags: NoFlags,        // 本节点的副作用（Placement/Update/ChildDeletion...）
  subtreeFlags: NoFlags, // 子树的副作用合集
  deletions: null,       // 需要删除的子节点
};
```

`flags` 是一个二进制位掩码。`Placement`（插入）是 `0b010`，`Update`（更新）是 `0b100`，`ChildDeletion`（删除子节点）是 `0b10000`。用位运算可以组合和检查：`(flags & Placement) !== 0` 就是"需要插入"。

`subtreeFlags` 是冒泡收集的——子树的 flags 向上累加。这样 Commit 阶段遍历时，如果 `subtreeFlags === NoFlags`，可以直接跳过整个子树。

### Step 5：优先级——有些更新比其他的更紧急

不是所有更新都一样紧急。用户输入要立刻响应，数据分析可以等等。React 用 **Lane 模型**——31 位二进制数表示优先级：

```javascript
const fiber = {
  // ...上面的字段
  lanes: NoLanes,       // 本节点的待处理优先级
  childLanes: NoLanes,  // 子树的待处理优先级
};
```

`SyncHydrationLane`（bit 0）是最高优先级——SSR 水合用。`SyncLane`（bit 1）是常规更新的最高优先级——用户点击触发的事件用这个。`TransitionLane`（bit 8-21）是低优先级——`startTransition` 里的更新用这些。`IdleLane`（bit 28）是后台预渲染等低优先级——但还不是最低：`OffscreenLane`（bit 29）和 `DeferredLane`（bit 30）更低。

有了优先级，React 就可以做到：**高优先级更新打断低优先级渲染**。用户输入时不等搜索结果渲染完，直接中断，先处理输入。等用户输入处理完了，再继续搜索结果的渲染。

### Step 6：双缓冲——安全地中断

如果我们正在计算一棵 Fiber 树（workInProgress），突然被高优先级打断了——我们直接丢弃它就行吗？

可以。因为我们**从不直接修改屏幕上的 Fiber 树**（current）。所有计算都在 workInProgress 上进行。丢弃 workInProgress 不影响 current，不影响 DOM，用户看不到任何中间状态。

```javascript
const fiber = {
  // ...上面的字段
  alternate: null,  // 指向另一棵树的对应 Fiber
};
```

`alternate` 是双缓冲的纽带：`current.alternate = workInProgress`，`workInProgress.alternate = current`。

```javascript
// ReactFiber.js:323-407
export function createWorkInProgress(current: Fiber, pendingProps: any): Fiber {
  let workInProgress = current.alternate;
  if (workInProgress === null) {
    // 首次：懒创建（不更新就不创建，省内存）
    workInProgress = createFiber(current.tag, pendingProps, current.key, current.mode);
    workInProgress.elementType = current.elementType;
    workInProgress.type = current.type;
    workInProgress.stateNode = current.stateNode; // 共享 DOM！不创建新 DOM
    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    // 已有：复用，先重置 flags
    workInProgress.pendingProps = pendingProps;
    workInProgress.type = current.type;    // Blocks 数据存在 type 上，需同步
    workInProgress.flags = NoFlags;          // 先清零
    workInProgress.subtreeFlags = NoFlags;
    workInProgress.deletions = null;
  }
  // 保留静态标记（跨渲染持续），重置其余 flags
  workInProgress.flags = current.flags & StaticMask;
  workInProgress.lanes = current.lanes;
  workInProgress.childLanes = current.childLanes;
  workInProgress.child = current.child;
  workInProgress.memoizedProps = current.memoizedProps;
  workInProgress.memoizedState = current.memoizedState;
  workInProgress.updateQueue = current.updateQueue;
  return workInProgress;
}
```

注意一个重要细节：`stateNode` 是**共享的**。两棵 Fiber 树指向同一个 DOM 节点。React 不会在 workInProgress 上创建新 DOM——它只在 workInProgress 上计算"需要做什么"，然后在 Commit 阶段对共享 DOM 执行操作。

另一个细节：`flags = current.flags & StaticMask` 保留了静态标记。静态标记（如 `PassiveStatic`、`LayoutStatic`）描述 Fiber **固有**的副作用特性，不是某次渲染特有的，所以需要跨渲染保留。

## 回头看：每个字段都有存在的理由

现在再看完整的 FiberNode 构造函数，是不是每个字段都不再是"随便加的"了？

```javascript
// packages/react-reconciler/src/ReactFiber.js:134-207

function FiberNode(tag, pendingProps, key, mode) {
  // === "这是谁" ===
  this.tag = tag;                    // → Step 1: 组件类型
  this.key = key;                    // → Diff 算法用
  this.elementType = null;
  this.type = null;
  this.stateNode = null;             // → Step 1: 真实 DOM/实例

  // === "在树中什么位置" ===
  this.return = null;                // → Step 2: 链表——父节点/"返回地址"
  this.child = null;                 // → Step 2: 链表——第一个子节点
  this.sibling = null;               // → Step 2: 链表——下一个兄弟
  this.index = 0;                    // → Diff 算法用

  this.ref = null;
  this.refCleanup = null;

  // === "数据是什么" ===
  this.pendingProps = pendingProps;  // → Step 3: 新 props
  this.memoizedProps = null;         // → Step 3: 旧 props
  this.updateQueue = null;           // → Step 3: 更新队列
  this.memoizedState = null;         // → Step 3: state / hooks 链表
  this.dependencies = null;          // → Step 3: Context 依赖

  this.mode = mode;                  // 并发模式/严格模式标记

  // === "渲染后要做什么" ===
  this.flags = NoFlags;              // → Step 4: 副作用标记
  this.subtreeFlags = NoFlags;       // → Step 4: 子树副作用合集
  this.deletions = null;             // → Step 4: 待删除子节点

  // === "有多紧急" ===
  this.lanes = NoLanes;              // → Step 5: 优先级
  this.childLanes = NoLanes;         // → Step 5: 子树优先级

  // === "安全中断" ===
  this.alternate = null;             // → Step 6: 双缓冲指针
}
```

每个字段解决一个具体问题。没有冗余，没有"以后可能用到"的占位符。

## 一个完整的 Fiber 节点示例

```jsx
function App() {
  const [count, setCount] = useState(0);
  return <div className="app"><span>{count}</span></div>;
}
```

首次渲染后，`<span>` 的 Fiber：

```javascript
{
  tag: 5,                              // HostComponent——DOM 元素
  key: null,
  elementType: 'span',
  type: 'span',
  stateNode: <HTMLSpanElement>,         // 真实 DOM

  return: <AppFiber>,                   // 父节点
  child: <TextFiber "0">,               // 子文本节点
  sibling: null,
  index: 0,

  pendingProps: { children: 0 },
  memoizedProps: { children: 0 },
  updateQueue: null,
  memoizedState: null,                  // DOM 元素没有 state

  mode: 1,                              // ConcurrentMode
  flags: 0b010,                         // Placement（首次插入）
  subtreeFlags: NoFlags,
  deletions: null,

  lanes: NoLanes,
  childLanes: NoLanes,

  alternate: null,                      // 首次渲染没有 alternate
}
```

下次更新 `count` 时，React 会：

1. 从 `App` 的 `alternate` 创建 workInProgress（或复用已有的）
2. 重新执行 `App()` 函数 → hooks 链表返回新的 `count`
3. `reconcileChildren` 对比新旧 children → 给 `<span>` 标记 `Update`
4. Commit 阶段：`span.textContent = newCount`
5. 切换 current 指针

整个过程：workInProgress 在内存中计算，不碰 DOM，可以随时暂停。确认完成后一次性提交到 DOM。

## 下一步

- [WorkTag 类型体系](/02-fiber-architecture/02-work-tags) — 31 种 Fiber 都是什么
- [副作用标记 Flags](/02-fiber-architecture/03-flags-effects) — 副作用标记系统的完整分析
- [Lane 优先级模型](/02-fiber-architecture/04-lanes-priorities) — Lane 模型——为什么 expirationTime 不够用了
- [双缓冲机制](/02-fiber-architecture/05-double-buffering) — 双缓冲机制的完整流程

## 参考资料

- [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture) — Fiber 结构的原始设计文档。Andrew Clark 是 Fiber 的作者，这篇文章是他写的设计笔记。
- [Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — 逐字段解析 Fiber 结构。如果你只读一篇 Fiber 分析文章，读这篇。
- [React 技术揭秘 - Fiber 架构的心智模型 (卡颂)](https://react.iamkasong.com/fiber/mental-model.html) — 中文 React 源码分析的最佳教程。
- [The Two Reacts (Dan Abramov)](https://overreacted.io/the-two-reacts/) — Dan Abramov 的叙事风格示例，展示了如何用"先论证 A，再论证 B，最后揭示 C"的结构讲解技术概念。
- [How Does setState Know What to Do? (Dan Abramov)](https://overreacted.io/how-does-setstate-know-what-to-do/) — 从一个简单问题深入到底层的叙事示例。
