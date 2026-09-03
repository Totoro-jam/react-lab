---
title: "七个设计决策：React 为什么这样设计"
---


> 对应源码：[`ReactFiber.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiber.js), [`ReactFiberLane.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js), [`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js), [`ReactFiberThrow.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js)

## 1. 为什么 Fiber：JavaScript 调用栈不可控

### 问题

React 15 的 Stack Reconciler 用 JS 引擎的调用栈递归遍历组件树。递归开始后**不可暂停**——必须跑完整个栈才能返回。

```
用户在大型表单中输入文字
  → setState → reRender → 递归遍历整个组件树
  → 主线程被占用 200ms
  → 用户输入延迟 200ms → 卡顿

为什么不能直接暂停调用栈？
  JS 调用栈由引擎控制，你无法在 mid-execution 暂停
  递归的每一层栈帧只存在于 CPU 寄存器中
  暂停 = 丢失所有栈帧信息 = 无法恢复
```

### 决策

Andrew Clark 在 [React Fiber Architecture](https://github.com/acdlite/react-fiber-architecture) 设计文档中写道：

> "Fiber is a reimplementation of the stack, specialized for React components. You can think of a single fiber as a virtual stack frame."

React 不用 JS 引擎的调用栈，而是**在内存中用链表模拟一个调用栈**。每个 Fiber 节点就是一个"虚拟栈帧"，包含 state、props、return 指针（等价于"返回地址"）。因为虚拟栈帧在内存中，你可以随时暂停、恢复、甚至丢弃。

### 源码中的体现

```javascript
// packages/react-reconciler/src/ReactFiber.js:134-207
function FiberNode(tag, pendingProps, key, mode) {
  this.tag = tag;             // 类似于"函数类型"
  this.return = null;         // 等价于"返回地址"——处理完后回到哪
  this.child = null;           // 等价于"下一个要执行的函数"
  this.sibling = null;         // 等价于"下一个并列函数"
  this.memoizedState = null;  // 等价于"本地变量"
  this.memoizedProps = null;  // 等价于"函数参数"
  this.flags = NoFlags;        // 等价于"执行记录"
  this.alternate = null;       // 双缓冲——两个栈帧版本
}
```

工作循环就是一个 while 循环，每次处理一个 Fiber（虚拟栈帧）：

```javascript
// ReactFiberWorkLoop.js:3073
function workLoopConcurrentByScheduler() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```

`shouldYield()` 检查时间片是否用完。用完了就退出循环——虚拟栈帧全部留在内存中，下次恢复时从 `workInProgress` 继续。

## 2. 为什么 Lane：expirationTime 无法区分同级别更新

### 问题

React 16 早期使用 `expirationTime`（一个时间戳）表示优先级。越早过期越紧急。

```
场景：用户打字 → startTransition 触发两个搜索更新

更新 A: setSearchQuery("a")  → expirationTime = 5000  (5 秒后过期)
更新 B: setSearchQuery("ab") → expirationTime = 5000  (相同！)

问题：两个过渡更新有完全相同的 expirationTime
  → React 无法区分"ab 应该覆盖 a"
  → 如果两个都处理了，用户会看到 "a" 搜索结果闪烁，再看到 "ab"
```

[What are Lanes in React source code? (JSer.dev)](https://jser.dev/react/2022/03/26/lanes-in-react/) 详细分析了这个问题：expirationTime 是标量，**只能比大小，不能表达"同优先级的两个独立更新"**。

### 决策

React 团队的解决方案：**用 31 位二进制表示优先级，一个位代表一条"车道"（Lane）**。同优先级的多个更新可以占用不同的 Lane，位运算让组合和检查都变成 O(1)。

```
14 个 TransitionLane（bit 8-21）：
  第一次搜索 "a"  → TransitionLane1  (bit 8)
  第二次搜索 "ab" → TransitionLane2  (bit 9)
  
它们在不同的车道上！
  → 处理 Lane2（"ab"搜索）→ 丢弃 Lane1（"a"搜索）
  → 不需要处理两个，也不需要担心覆盖
```

### 源码中的体现

```javascript
// packages/react-reconciler/src/ReactFiberLane.js:41-111
export const TotalLanes = 31;

export const SyncHydrationLane: Lane =     0b0000000000000000000000000000001; // bit 0
export const SyncLane: Lane =              0b0000000000000000000000000000010; // bit 1
// ...
const TransitionLanes: Lanes =           0b0000000001111111111111100000000;    // bit 8-21 (14 条)
const TransitionLane1: Lane =            0b0000000000000000000000100000000;    // bit 8
const TransitionLane2: Lane =            0b0000000000000000000001000000000;    // bit 9
// ...

// 位运算：O(1) 找最高优先级
const highest = lanes & -lanes;  // 保留最低位的 1 = 最高优先级
```

## 3. 为什么 Hooks：wrapper hell 和生命周期混乱

### 问题

React 16.8 之前，复用有状态逻辑有三种主要方式，每种都有严重缺陷：

```
1. Mixins（React 0.x 时代，已废弃）
  → 隐式依赖、命名冲突、无法参数化
  
2. Higher-Order Components（HOCs）
  → <withTheme(withRouter(withUser(MyComponent)))>
  → "Wrapper Hell"：嵌套地狱
  → 难以调试（组件树多了一层，DevTools 看不到真实结构）
  → ref 转发问题、static 方法丢失
  
3. Render Props
  <DataProvider render={data => <Component data={data} />} />
  → 解决了组合问题，但回调地狱
  → JSX 嵌套深度爆炸
  → 每次 render 创建新函数 → 可能触发不必要的重渲染
```

还有一个更深层的问题：类组件的**生命周期方法强制你把相关逻辑拆散**。订阅逻辑分散在 `componentDidMount`、`componentDidUpdate`、`componentWillUnmount` 中，而你只想做一件事："订阅数据源，并在卸载时清理"。

[Dan Abramov 在 "Making Sense of React Hooks"](https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889) 中解释了 Hooks 的动机：不是让函数组件"也有 class 的能力"，而是**从根本上去除 class 组件中的模式问题**。

### 决策

Hooks 的设计原则（来自 [Hooks RFC](https://github.com/reactjs/rfcs/pull/68) 和 Dan Abramov 的 [Why Do React Hooks Rely on Call Order?](https://overreacted.io/why-do-react-hooks-rely-on-call-order/)）：

1. **不引入嵌套**：不需要 HOCs 或 render props 的额外组件层
2. **自定义 Hook 完全透明**：`useXxx()` 调用链和内置 Hook 一样
3. **按调用顺序匹配**：而不是按名字或标识符

第 3 点是最关键的设计决策——为什么 Hooks 要求"不能在条件中调用"？因为 React **靠调用顺序匹配 hook 和 state**。每次 render，React 遍历 hooks 链表，按调用顺序取出对应的 hook 节点。

### 源码中的体现

```javascript
// packages/react-reconciler/src/ReactFiberHooks.js
// fiber.memoizedState 是 hooks 链表的头指针

function mountWorkInProgressHook(): Hook {
  const hook = {
    memoizedState: null,
    baseState: null,
    queue: null,
    next: null,   // ← 链表的 next 指针
  };
  if (workInProgressHook === null) {
    currentlyRenderingFiber.memoizedState = workInProgressHook = hook;
  } else {
    workInProgressHook = workInProgressHook.next = hook;  // 按顺序追加
  }
  return workInProgressHook;
}

function updateWorkInProgressHook(): Hook {
  // mount 时在链表末尾追加 hook
  // update 时按顺序从 current fiber 的 hooks 链表中克隆
  let nextCurrentHook;
  if (currentHook === null) {
    nextCurrentHook = currentlyRenderingFiber.alternate.memoizedState;
  } else {
    nextCurrentHook = currentHook.next;  // ← 按顺序取下一个
  }
  // ... clone ...
}
```

如果你在条件里调用了 `useEffect`，顺序就错了——React 会把你第二次 render 的第二个 hook 对应到 current fiber 的第一个 hook，返回错误的状态。

## 4. 为什么 Server Components：客户端的代价

### 问题

React 在传统 SSR 中的问题：**组件代码必须发给客户端**。即使页面上大部分内容是静态的，React 也要把整个组件树（包括 markdown 渲染器、日期格式化库等）的 JS 发给客户端，然后客户端重新执行一遍。

[RFC 0188](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md) 列出了三个核心痛点：

1. **Zero-Bundle-Size Components**：`marked` + `sanitize-html` ≈ 240KB JS，但这些代码在客户端运行后产出的 HTML 可能只有几百字节
2. **No Client-Server Waterfalls**：`useEffect` fetch → 子组件再 `useEffect` fetch → 串行请求
3. **Avoiding the Abstraction Tax**：多层 HOC 包装最终产出的 DOM 很简单，但每一层的 JS 代码都要下载

```
传统 React（客户端渲染）：
  下载 marked.js (36KB) → 下载 sanitize-html.js (206KB) → 执行 → 得到 HTML
  
Server Components：
  服务端运行 marked + sanitize-html → 得到 HTML → 发送 HTML（几百字节）
  → 客户端零 JS 代码
```

### 决策

React 引入 **Server Components**——一种只在服务端运行的组件。它们的代码不发给客户端。

[Dan Abramov 在 "The Two Reacts"](https://overreacted.io/the-two-reacts/) 中解释了设计哲学：

- `UI = f(state)` — 客户端 React，组件跑在用户设备上（即时交互）
- `UI = f(data)` — 服务端 React，组件跑在服务器上（数据就近）
- `UI = f(data, state)` — 两种 React 可以混合

### 源码中的体现

```javascript
// packages/react-server/src/ReactFlightServer.js:1792
// Server Components 的渲染入口 — 直接在服务端执行组件函数

function renderFunctionComponent(request, task, key, Component, props, validated) {
  // Component 就是你的组件函数（如 async function Note() { ... }）
  const result = Component(props);   // 直接调用，不经过 reconciler
  // ...序列化为 Flight 格式...
}
// 注意：validated 是 DEV-only 参数
```

注意：Server Components **不经过 Fiber Reconciler**——它们在服务端直接执行，然后把结果（React Element 树）序列化为 Flight 格式发给客户端。客户端收到后再通过 Reconciler 渲染。[^1]

[^1]: 准确地说，Server Components 的 **序列化结果**经过 Reconciler——客户端收到 Flight 格式数据后用 Reconciler 重建 Fiber 树。但 Server Components 的 **执行**不经过 Reconciler。

## 5. 为什么 React Compiler：手写 useMemo 的负担

### 问题

React 开发者长期面对一个"诅咒"——为了防止不必要的 re-render，大量使用 `useMemo`、`useCallback` 和 `React.memo`：

```jsx
// 每个 props 都要 useMemo 防止引用变化
const handleClick = useCallback(() => { ... }, [dep1, dep2]);
const processedData = useMemo(() => expensiveCalc(data), [data]);
const Component = memo(({ prop }) => { ... });
```

[Dan Abramov 在 "Before You memo()"](https://overreacted.io/before-you-memo/) 中指出：虽然有"移动 state 下移"和"children 提升"两种不需要 memo 的优化方式，但它们只适用于部分场景。最终大多数开发者还是要手写大量 `useMemo`。

问题在于：

1. **认知负担**：开发者要人工判断哪些值需要 memo、依赖列表该写什么
2. **容易出错**：忘记 memo 导致重渲染；依赖列表写错导致 stale closure
3. **代码膨胀**：一个简单的组件可能有 10+ 个 useMemo/useCallback

### 决策

React Compiler 1.0（2025 年 10 月稳定）的设计目标：**自动插入 memoization 逻辑，开发者不再需要手写 useMemo/useCallback**。

Compiler 是一个 Babel 插件，在编译时分析你的组件代码，自动判断哪些值"在渲染间可能变化"（reactive）和哪些"不变"（non-reactive），然后插入相应的缓存逻辑。

```javascript
// 源码中 React Compiler 的定位（packages/compiler/）
// README: "React Compiler is a compiler that optimizes React
// applications, ensuring that only the minimal parts of components
// and hooks will re-render when state changes."
```

### 编译产物对比

```javascript
// 你写的：
function ProductList({ query }) {
  const filtered = products.filter(p => p.name.includes(query));
  const handleClick = () => console.log(query);
  return <div onClick={handleClick}>{filtered.map(...)}</div>;
}

// Compiler 产出（简化）：
function ProductList({ query }) {
  const $ = _c(4);  // 4 个缓存槽
  const filtered = /* computed with deps check */;
  const handleClick = /* computed with deps check */;
  // 只有 query 变了才重新计算 filtered 和 handleClick
  // 如果 query 没变，直接用缓存值 → 跳过子树
  return <div onClick={handleClick}>{filtered.map(...)}</div>;
}
```

两种缓存模式：

- **Sentinel 模式**（non-reactive 值）：只创建一次，永远命中缓存
- **依赖比较模式**（reactive 值）：依赖变才重算，否则命中缓存

详见 **10-react-compiler/** 的完整分析。

## 6. 为什么 Suspense：throw 一个 Promise

### 问题

React 16.6 之前，处理异步加载有两种方式：

```
1. 条件渲染 + 加载状态
  if (loading) return <Spinner />;
  return <Data data={data} />;
  → 问题：加载逻辑和渲染逻辑耦合在一起
  → 问题：嵌套异步时 loading 状态爆炸（父+子分别 loading）

2. 命令式 fetch + useEffect
  useEffect(() => {
    fetchData().then(setData);
  }, []);
  → 问题：不能在 render 阶段等待数据
  → 问题：串行请求瀑布
```

React 需要一种机制：**让组件能"暂停"渲染，等待数据，然后恢复**——而不需要手动管理 loading 状态。

### 决策

React 的解决方案是 **Suspense**——一种基于"throw Promise"的暂停机制。

核心思路来自 Sebastian Markbåge：如果组件在 render 过程中需要等待异步数据，它不返回 JSX，而是**throw 一个 Promise**。React 捕获这个 Promise，暂停渲染，在最近的 Suspense 边界显示 fallback。Promise resolve 后，React 恢复渲染。

```javascript
// 理想模型（概念性）：
function Note({ id }) {
  const note = resource.read(id);  // 如果数据没就绪，throw promise
  return <div>{note.title}</div>;
}

// 如果 resource.read() throw 了 promise：
// React 找到最近的 <Suspense> 边界 → 显示 fallback
// Promise resolve → React 重新调用 Note() → 这次 read() 不 throw → 渲染成功
```

### 源码中的体现

```javascript
// packages/react-reconciler/src/ReactFiberThrow.js:364-410
function throwException(
  root, returnFiber, sourceFiber, value, rootRenderLanes
): boolean {
  sourceFiber.flags |= Incomplete;  // 标记未完成

  if (value !== null && typeof value === 'object') {
    if (typeof value.then === 'function') {
      // 这是一个 Promise → 检测到 Suspense！
      const wakeable = value;
      
      // 找到最近的 Suspense 边界
      const suspenseBoundary = getSuspenseHandler();
      if (suspenseBoundary !== null) {
        switch (suspenseBoundary.tag) {
          case SuspenseComponent:
          case ActivityComponent:
          case SuspenseListComponent:
            // 标记此边界为"已挂起"
            // → 后续 commit 时显示 fallback
            break;
        }
      }
      // 注册 wakeable.then() → promise resolve 后恢复
    }
  }
  // ...错误处理分支...
}
```

这就是 Suspense 的本质：**throw 一个 Promise → React 在 `throwException` 中识别它 → 找到 Suspense 边界 → 暂停 → 等 Promise resolve → 恢复**。

Suspense 的精妙之处在于它不改变 React 的渲染模型——它复用了已有的 fiber 中断机制（`Incomplete` flag + `unwindWork`）。Suspend 和 Error 使用同一条恢复路径，只是 throw 的值不同。

## 7. 为什么 Error Boundaries：try/catch 不能处理 render 错误

### 问题

JavaScript 的 `try/catch` 不能用于 React 渲染过程：

```javascript
// 这不行：
function App() {
  try {
    return <BrokenComponent />;
  } catch (error) {
    return <ErrorFallback error={error} />;
  }
}
```

为什么不？因为 React 的渲染是**异步分片**的。`<BrokenComponent />` 只是一个对象——它不会立即执行。React 会在后续的 `beginWork` 调用中执行它，那时候早已退出了 `try/catch` 的作用域。即使不是并发模式，React 的 `render()` 返回的是一个 Element 对象，不是执行结果——真正的渲染在 `performUnitOfWork` 中发生。

### 决策

React 16 引入 **Error Boundaries**——一种特殊类型的类组件，通过 `componentDidCatch` 和 `getDerivedStateFromError` 生命周期捕获渲染过程中的错误。

```javascript
class ErrorBoundary extends React.Component {
  state = { hasError: false };
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  
  componentDidCatch(error, info) {
    logError(error, info.componentStack);
  }
  
  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong.</h1>;
    }
    return this.props.children;
  }
}
```

为什么只有类组件可以是 Error Boundaries？因为：

1. Error Boundaries 需要 state（`hasError`）来切换渲染 fallback UI
2. 在 16.0 时函数组件没有 state（Hooks 在 16.8 才引入）
3. Error Recovery 需要在 `unwindWork` 阶段执行，这要求组件实例存在

### 源码中的体现

```javascript
// packages/react-reconciler/src/ReactFiberThrow.js
function throwException(...) {
  sourceFiber.flags |= Incomplete;  // 标记未完成

  if (value !== null && typeof value === 'object') {
    if (typeof value.then === 'function') {
      // → Suspense 路径（上面已分析）
    }
  }

  // 如果不是 Promise → 走 Error 路径
  // 向上找最近的 Error Boundary（class component with componentDidCatch）
  // 找到后：
  //   1. 标记 ShouldCapture → boundary 知道要捕获
  //   2. 创建 ErrorUpdate → 存储错误信息
  //   3. 入队 → 下次 render boundary 时渲染 fallback
  // 如果没找到 Error Boundary → 抛给 root → 卸载整棵树
}
```

错误和 Suspense 共享同一条恢复通道：

- Error：throw 一个 Error → 找 Error Boundary → 渲染 fallback
- Suspense：throw 一个 Promise → 找 Suspense Boundary → 渲染 fallback

两者都在 `throwException` 中处理，在 `unwindWork` 中恢复。

## 总结

| 决策 | 问题 | 解决方案 | 源码入口 |
| ------ | ------ | --------- | --------- |
| Fiber | JS 调用栈不可暂停 | 用链表模拟调用栈 | `ReactFiber.js` |
| Lane | expirationTime 无法区分同优先级 | 31 位二进制位表示 Lane | `ReactFiberLane.js` |
| Hooks | wrapper hell + 生命周期混乱 | 链表 + 调用顺序匹配 | `ReactFiberHooks.js` |
| Server Components | 组件代码必须发给客户端 | 服务端运行 → 只发 UI 结果 | `ReactFlightServer.js` |
| React Compiler | 手写 useMemo/useCallback 负担 | 编译时自动 memoization | `compiler/packages/` |
| Suspense | 异步加载需要手动管理 loading | throw Promise → 暂停渲染 | `ReactFiberThrow.js` |
| Error Boundaries | try/catch 不可用于 render | class lifecycle + unwind | `ReactFiberThrow.js` |

七个决策有一个共同主题：**React 不断在创造更好的抽象，让开发者专注写"UI 应该长什么样"，而不是手动管理底层机制**。

## 下一步

- [React 架构演进](/00-overview/01-architecture-evolution) — 这些决策在架构演进中的落地时间线
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — Fiber 架构的完整源码解析
- [工作循环全景](/03-work-loop/01-work-loop-overview) — 工作循环如何实现中断和恢复
- [Hooks 的 Mount 与 Update 机制](/04-hooks-internals/01-hooks-mount-update) — Hooks 链表的完整实现

## 参考资料

- [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture) — ★ Fiber 的原始设计文档
- [What are Lanes in React source code? (JSer.dev)](https://jser.dev/react/2022/03/26/lanes-in-react/) — ★ Lane 模型的逐函数源码分析
- [Making Sense of React Hooks (Dan Abramov)](https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889) — ★ Hooks 的设计动机
- [Why Do React Hooks Rely on Call Order? (Dan Abramov)](https://overreacted.io/why-do-react-hooks-rely-on-call-order/) — ★ Hooks 顺序依赖的设计原因
- [How Are Function Components Different from Classes? (Dan Abramov)](https://overreacted.io/how-are-function-components-different-from-classes/) — 函数 vs 类的设计权衡
- [React Hooks RFC #68 (GitHub)](https://github.com/reactjs/rfcs/pull/68) — Hooks 的原始 RFC
- [React Server Components RFC 0188 (GitHub)](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md) — ★ RSC 的完整 RFC，含 Zero-Bundle-Size / Code Splitting / Waterfall 问题分析
- [The Two Reacts (Dan Abramov)](https://overreacted.io/the-two-reacts/) — ★ UI = f(data, state) 双 React 模型
- [Before You memo() (Dan Abramov)](https://overreacted.io/before-you-memo/) — ★ 手动 memo 的问题，为 Compiler 埋伏笔
- [JSX Over The Wire (Dan Abramov)](https://overreacted.io/jsx-over-the-wire/) — RSC 序列化格式设计理念
- [Progressive JSON (Dan Abramov)](https://overreacted.io/progressive-json/) — 流式 JSON 设计哲学
- [How Imports Work in RSC (Dan Abramov)](https://overreacted.io/how-imports-work-in-rsc/) — RSC 模块加载机制
- [What Does "use client" Do? (Dan Abramov)](https://overreacted.io/what-does-use-client-do/) — 指令边界设计
- [Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — 最详细的 Fiber 源码分析
- [A deep dive into React Fiber (LogRocket)](https://blog.logrocket.com/deep-dive-react-fiber/) — Fiber 深入分析
- [React v16.0 Blog (官方)](https://legacy.reactjs.org/blog/2017/09/26/react-v16.0.html) — Fiber + Error Boundaries + Portals 公告
- [React v16.8: The One With Hooks (官方)](https://legacy.reactjs.org/blog/2019/02/06/react-v16.8.0.html) — Hooks 正式发布
- [React v18.0 Blog (官方)](https://react.dev/blog/2022/03/29/react-v18) — 并发渲染 + Suspense for Data
- [React 16.x Roadmap (Dan Abramov)](https://legacy.reactjs.org/blog/2018/11/27/react-16-roadmap.html) — Suspense/Hooks/Concurrent 的发布路线图
- [React 19 Blog (官方)](https://react.dev/blog/2024/12/05/react-19) — Server Components + Actions + Compiler
- [React Compiler README (GitHub)](https://github.com/facebook/react/tree/eafeac097b/compiler/packages/babel-plugin-react-compiler) — Compiler 定位
- [Meta's React Compiler 1.0 (InfoQ)](https://www.infoq.com/news/2025/12/react-compiler-meta/) — Compiler 1.0 发布报告
- [React Compiler Deep Dive (yceffort)](https://yceffort.kr/en/2026/02/react-compiler-deep-dive) — 9 步管线逐行拆解
- [React Compiler Deep Dive (Sathya, YouTube)](https://www.youtube.com/watch?v=O8Pv6Z1JgTM) — 核心团队的深度讲解
- [React Labs: View Transitions (官方博客)](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) — Activity 和 View Transitions 实验
- [React Suspense for data fetching (Aman Explains)](https://amanexplains.com/react-suspense-for-data-fetching/) — Suspense 数据加载详解
- [React Error Boundaries (官方文档)](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary) — Error Boundaries 文档
- [React 技术揭秘 (卡颂)](https://react.iamkasong.com/) — 中文源码分析
- [React Design Principles (官方)](https://legacy.reactjs.org/docs/design-principles.html) — 调度、稳定性等设计原则
- [React as a UI Runtime (Dan Abramov)](https://overreacted.io/react-as-a-ui-runtime/) — 从 runtime 角度理解 React
- [How Does React Tell a Class from a Function? (Dan Abramov)](https://overreacted.io/how-does-react-tell-a-class-from-a-function/) — 类函数区分机制
