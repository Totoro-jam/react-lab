---
title: "术语表"
---


React 源码和分析中常用术语的解释。阅读过程中如果遇到不熟悉的概念，可以回到这里查看。每个术语在仓库中有对应的深入讲解文档。

| 术语 | 英文 | 含义 | 对应文档 |
| ------ | ------ | ------ | --------- |
| Fiber | Fiber | React 的最小工作单元，JS 对象，记录组件状态和工作进度 | [01-fiber-node-structure](../02-fiber-architecture/01-fiber-node-structure) |
| Reconciler | Reconciler | 协调器，负责对比新旧树找差异，React 内部核心 | [ReactFiber.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiber.js) |
| Renderer | Renderer | 渲染器，将差异应用到目标平台（DOM/Native/SSR） | [08-renderer/01-dom-renderer](../08-renderer/01-dom-renderer) |
| Scheduler | Scheduler | 调度器，决定任务何时执行、按什么优先级 | [05-scheduler](../05-scheduler/01-scheduler-design) |
| Work Loop | Work Loop | 工作循环，while 遍历 Fiber 树的 performUnitOfWork | [03-work-loop/01-work-loop-overview](../03-work-loop/01-work-loop-overview) |
| beginWork | beginWork | "递"阶段，向下处理 Fiber，调用组件函数/render | [ReactFiberBeginWork.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js) |
| completeWork | completeWork | "归"阶段，向上冒泡，创建 DOM、收集 flags | [ReactFiberCompleteWork.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCompleteWork.js) |
| Commit | Commit | 提交阶段，同步执行 DOM 操作和生命周期（不可中断） | [03-work-loop/05-commit-phase](../03-work-loop/05-commit-phase) |
| Lane | Lane | 优先级模型，31 位二进制表示，支持组合和分离 | [ReactFiberLane.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js) |
| Lanes | Lanes | 多个 Lane 的组合（位掩码） | 同上 |
| WorkTag | WorkTag | Fiber 类型标记（0=函数组件, 5=DOM元素, 等） | [ReactWorkTags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactWorkTags.js) |
| Flags | Flags | 副作用标记（Placement/Update/ChildDeletion 等） | [ReactFiberFlags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberFlags.js) |
| subtreeFlags | subtreeFlags | 子树的 flags 合集（冒泡收集） | 同上 |
| bailout | bailout | 跳过不需要更新的子树（props 没变时的优化） | [03-work-loop/02-begin-work](../03-work-loop/02-begin-work) |
| alternate | alternate | 双缓冲指针，current ↔ workInProgress 互指 | [02-fiber-architecture/05-double-buffering](../02-fiber-architecture/05-double-buffering) |
| current | current | 当前显示在屏幕上的 Fiber 树 | 同上 |
| workInProgress | workInProgress | 正在内存中计算的 Fiber 树 | 同上 |
| stateNode | stateNode | Fiber 对应的真实 DOM/组件实例 | [01-fiber-node-structure](../02-fiber-architecture/01-fiber-node-structure) |
| memoizedState | memoizedState | 类组件存 state，函数组件存 hooks 链表头 | [04-hooks-internals/01-hooks-mount-update](../04-hooks-internals/01-hooks-mount-update) |
| memoizedProps | memoizedProps | 上次渲染使用的 props | [01-fiber-node-structure](../02-fiber-architecture/01-fiber-node-structure) |
| pendingProps | pendingProps | 本次渲染待处理的 props | 同上 |
| updateQueue | updateQueue | 更新队列（不同 Fiber 类型存不同内容） | 同上 |
| Hook | Hook | hooks 链表上的一个节点（useState/useEffect 等） | [ReactFiberHooks.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) |
| Dispatcher | Dispatcher | Hooks 分发器，mount 和 update 时不同 | [ReactHooks.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactHooks.js) |
| Effect | Effect | useEffect/useLayoutEffect 的内部表示 | [04-hooks-internals/03-effect-hooks](../04-hooks-internals/03-effect-hooks) |
| Eager State | Eager State | setState 时的优化：预计算新状态避免不必要的渲染 | [04-hooks-internals/02-state-hooks](../04-hooks-internals/02-state-hooks) |
| HostConfig | HostConfig | 宿主配置，Reconciler 与平台交互的接口 | [08-renderer/03-custom-renderer](../08-renderer/03-custom-renderer) |
| HostRoot | HostRoot | Fiber 树根节点（tag=3） | [ReactRootTags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactRootTags.js) |
| HostComponent | HostComponent | 原生 DOM 元素（tag=5） | [ReactWorkTags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactWorkTags.js) |
| HostText | HostText | 文本节点（tag=6） | 同上 |
| Hydration | Hydration | 将 SSR HTML 与客户端 React 状态连接 | [The Perils of Hydration](https://www.joshwcomeau.com/react/the-perils-of-rehydration/) |
| Suspense | Suspense | 组件挂起时显示 fallback（throw Promise 机制） | [06-concurrent-features/02-suspense](../06-concurrent-features/02-suspense) |
| Transition | Transition | 过渡更新，低优先级可中断 | [06-concurrent-features/03-transitions](../06-concurrent-features/03-transitions) |
| Concurrent | Concurrent | 并发渲染，可中断可恢复 | [06-concurrent-features/01-concurrent-rendering](../06-concurrent-features/01-concurrent-rendering) |
| RSC | RSC | React Server Components，服务端组件 | [09-react-server/01-rsc-architecture](../09-react-server/01-rsc-architecture) |
| Flight | Flight | RSC 的序列化协议 | [09-react-server/02-flight-protocol](../09-react-server/02-flight-protocol) |
| Fizz | Fizz | React 的 SSR 渲染器代号 | [08-renderer/02-ssr-fizz](../08-renderer/02-ssr-fizz) |
| MessageChannel | MessageChannel | Scheduler 使用的时间切片机制 | [Scheduler.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js) |
| shouldYield | shouldYield | 检查时间片是否用完的函数 | [05-scheduler/03-time-slicing](../05-scheduler/03-time-slicing) |
| propagateContextChange | propagateContextChange | Provider value 变化时通知子树消费者 | [01-react-core/03-context](../01-react-core/03-context) |
| unwind | unwind | 错误恢复时回退到边界的操作 | [03-work-loop/06-error-handling](../03-work-loop/06-error-handling) |
| mount | mount | 首次渲染 | [04-hooks-internals/01-hooks-mount-update](../04-hooks-internals/01-hooks-mount-update) |
| update | update | 后续更新渲染 | 同上 |
| ChildDeletion | ChildDeletion (flag) | 删除子节点标记（旧名 Deletion，已改名） | [ReactFiberFlags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberFlags.js) |
| Placement | Placement (flag) | 插入节点标记 | 同上 |
| Passive | Passive (flag) | useEffect 相关标记 | [04-hooks-internals/03-effect-hooks](../04-hooks-internals/03-effect-hooks) |
| RootTag | RootTag | 根类型（LegacyRoot=0, ConcurrentRoot=1） | [ReactRootTags.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactRootTags.js) |
| TypeOfMode | TypeOfMode | 模式位标记（ConcurrentMode, StrictMode 等） | [ReactTypeOfMode.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactTypeOfMode.js) |

## 下一步

- [源码文件索引](/reference/source-map) — 按知识点映射到源码文件
- [社区资料索引](/reference/resources) — 调研依赖的完整资料
- [源码阅读方法论](/reference/reading-guide) — 如何有效阅读源码
