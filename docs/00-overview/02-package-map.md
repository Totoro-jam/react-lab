---
title: "React Monorepo 包结构与职责"
---


> 对应源码：`packages/` 目录

## 1. 全景视图

React 源码是一个 monorepo，所有包都在 `packages/` 下。你需要先搞清楚这些包的职责和依赖关系，才能在阅读源码时知道去哪个文件找什么。

```
packages/
- react/                     ← 你 import 的那个包（公共 API 层）
- react-reconciler/          ← 协调器（Fiber 架构核心）★★★
- scheduler/                 ← 调度器（时间切片 + 优先级队列）★★★
- react-dom/                 ← DOM 渲染器（客户端 + 服务端）
- react-dom-bindings/        ← DOM 事件绑定
- shared/                    ← 跨包共享的工具和类型
- react-server/              ← React Server Components 基础
- react-server-dom-webpack/  ← RSC + Webpack 打包器
- react-server-dom-parcel/   ← RSC + Parcel 打包器
- react-server-dom-turbopack/ ← RSC + Turbopack 打包器
- react-server-dom-esm/      ← RSC + ESM 打包器
- react-server-dom-fb/       ← RSC（Meta 内部版）
- react-server-dom-unbundled/ ← RSC 无打包器版
- react-flight-server-fb/    ← Flight 协议（Meta 内部）
- react-is/                  ← 类型判断工具（isElement, isFragment 等）
- react-debug-tools/         ← Hooks 检查工具（DevTools 用）
- react-devtools/            ← React DevTools
- react-devtools-shared/     ← DevTools 共享逻辑
- react-devtools-core/       ← DevTools 核心逻辑
- react-devtools-extensions/ ← DevTools 浏览器/Firefox 扩展
- react-devtools-shell/      ← DevTools 测试环境
- react-devtools-inline/     ← DevTools 内联版
- react-devtools-facade/     ← DevTools 门面
- react-devtools-fusebox/    ← DevTools Fuse 集成
- react-devtools-cdt-mcp/    ← DevTools Chrome DevTools MCP
（注：react-devtools-timeline 是独立发布包，不在主 monorepo 中。源码 ReactFiberLane.js 中有注释引用 `getLabelForLane(), used by react-devtools-timeline`。）
- react-test-renderer/       ← 测试用渲染器（React 19 中已废弃）
- react-noop-renderer/       ← 空操作渲染器（Reconciler 测试用）
- react-suspense-test-utils/ ← Suspense 测试工具
- internal-test-utils/       ← 内部测试工具
- jest-react/                ← Jest React 适配器
- dom-event-testing-library/ ← DOM 事件测试库
- react-cache/               ← 缓存原语
- react-client/              ← 客户端运行时
- react-markup/              ← HTML 标记处理
- react-art/                 ← SVG/Canvas 渲染器
- react-native-renderer/     ← React Native 渲染器
- react-refresh/             ← Fast Refresh 运行时
- eslint-plugin-react-hooks/ ← Hooks ESLint 规则
- use-subscription/          ← 订阅 Hook
- use-sync-external-store/   ← 外部状态同步 Hook
```

## 2. 三个核心包

你需要最先深入理解的是这三个包，它们构成了 React 运行时的核心：

### 2.1 `react` —— 公共 API 层

packages/react/src/

- ReactHooks.js          ← useState, useEffect 等 Hooks 的入口
- ReactBaseClasses.js    ← Component, PureComponent 类定义
- ReactContext.js        ← createContext 实现
- ReactChildren.js       ← React.Children 工具方法
- ReactLazy.js           ← React.lazy 实现
- ReactMemo.js           ← React.memo 实现
- ReactForwardRef.js     ← React.forwardRef 实现
- ReactCreateRef.js      ← createRef 实现
- ReactStartTransition.js ← startTransition 实现
- ReactCacheImpl.js      ← 缓存实现
- ReactSharedInternals*.js ← React 内部共享状态（不同环境不同实现）
- ReactClient.js         ← 客户端入口
- ReactServer.js         ← 服务端入口（有多个 fork）
- jsx/                   ← JSX 运行时（jsx, jsxs, jsxDev）
- ...

这个包很"薄"——它主要定义了公共 API 的签名，但真正的逻辑实现委托给了 reconciler。例如 `useState` 在 [`ReactHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactHooks.js) 中只是一个转发：

```javascript
// ReactHooks.js（简化）
export function useState<S>(initialState: (() => S) | S): [S, Dispatch<BasicStateAction<S>>] {
  const dispatcher = resolveDispatcher();
  return dispatcher.useState(initialState);
}
```

`resolveDispatcher()` 获取的 dispatcher 在不同阶段（mount / update）会被设置为不同的实现，这些实现存在于 `react-reconciler` 中。

### 2.2 `react-reconciler` —— 协调器（最重要）

这是 React 源码中最核心、最复杂的包。它实现了 Fiber 架构的所有核心逻辑。

```
packages/react-reconciler/src/
- ReactFiber.js               ← Fiber 节点创建（createFiber, createWorkInProgress）
- ReactFiberWorkLoop.js       ← 工作循环（workLoop, performUnitOfWork, scheduleUpdateOnFiber）★★★
- ReactFiberBeginWork.js      ← beginWork：向下遍历，处理组件 ★★★
- ReactFiberCompleteWork.js   ← completeWork：向上冒泡，创建 DOM ★★★
- ReactFiberCommitWork.js     ← Commit 阶段执行逻辑 ★★★
- ReactFiberCommitEffects.js  ← useEffect/useLayoutEffect 执行
- ReactFiberCommitHostEffects.js ← DOM 增删改
- ReactFiberReconciler.js     ← 更新入口：updateContainer, insertUpdate 等
- ReactFiberRoot.js           ← FiberRoot 创建
- ReactFiberRootScheduler.js  ← Root 级别的调度逻辑
- ReactFiberHooks.js          ← Hooks 全部实现 ★★★
- ReactFiberLane.js           ← Lane 优先级模型 ★★
- ReactFiberFlags.js          ← 副作用标记（Placement, Update, ChildDeletion 等）
- ReactWorkTags.js            ← WorkTag 类型定义 ★★
- ReactTypeOfMode.js          ← 模式标记（ConcurrentMode, StrictMode 等）
- ReactChildFiber.js          ← 子 Fiber 的 reconcile 逻辑
- ReactFiberClassComponent.js ← 类组件处理
- ReactFiberClassUpdateQueue.js ← 类组件状态更新队列
- ReactFiberConcurrentUpdates.js ← 并发更新队列
- ReactFiberSuspenseComponent.js ← Suspense 逻辑
- ReactFiberSuspenseContext.js ← Suspense 上下文
- ReactFiberThrow.js          ← 抛出错误/Suspense 的处理
- ReactFiberUnwindWork.js     ← 错误恢复时的回退逻辑
- ReactFiberNewContext.js     ← Context 的 push/pop
- ReactFiberHostContext.js    ← 宿主环境 Context
- ReactFiberTreeContext.js    ← 树形 Context（useId 等）
- ReactFiberTreeReflection.js ← 从 Fiber 反射组件信息
- ReactFiberDevToolsHook.js   ← DevTools 钩子
- ReactFiberHotReloading.js   ← Fast Refresh 支持
- ReactProfilerTimer.js  ← Profiler 计时
- ReactInternalTypes.js       ← Fiber, FiberRoot 类型定义 ★★
- ReactRootTags.js             ← RootTag（LegacyRoot=0, ConcurrentRoot=1）
- Scheduler.js                ← 对 scheduler 包的引用包装
- ReactCapturedValue.js       ← 错误捕获
- ReactFiberErrorLogger.js    ← 错误日志
- ReactFiberTransition.js     ← Transition 逻辑
- ReactFiberAsyncAction.js    ← 异步 Action
- ReactFiberThenable.js       ← Thenable 处理（use hook）
- ReactFiberActivityComponent.js ← Activity（原 Offscreen）
- ReactFiberViewTransitionComponent.js ← View Transition
- ReactFiberGestureScheduler.js ← 手势调度
- ...（更多）
```

### 2.3 `scheduler` —— 调度器

```
packages/scheduler/src/
- SchedulerMinHeap.js       ← 最小堆实现（push, pop, peek, siftUp, siftDown）
- SchedulerPriorities.js    ← 5 级优先级定义
- SchedulerFeatureFlags.js  ← 时间切片阈值（frameYieldMs=5）
- SchedulerProfiling.js     ← 性能分析支持
- forks/
```

调度器的核心是用 `MessageChannel`（或 `setImmediate`/`setTimeout` 兜底）实现宏任务调度，并通过 [`SchedulerMinHeap.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerMinHeap.js) 实现最小堆管理任务优先级。每次从堆顶取出到期时间最短的任务执行，执行过程中通过 `shouldYield()` 检查是否超过时间预算（`frameYieldMs = 5ms`）。核心逻辑在 [`Scheduler.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js) 中。

## 3. 渲染器层

### 3.1 `react-dom` + `react-dom-bindings`

```
packages/react-dom/src/
- client/                   ← createRoot, hydrateRoot 等
- server/                   ← renderToString, renderToPipeableStream 等
- shared/                   ← 共享逻辑
- events/                   ← 事件相关
- ReactDOMSharedInternals.js

packages/react-dom-bindings/src/
- client/                   ← 客户端事件绑定
- events/                   ← 事件系统核心
- server/                   ← 服务端绑定
- shared/                   ← 共享绑定
```

`react-dom` 负责 DOM 的创建、更新、删除；`react-dom-bindings` 负责事件监听器的注册和事件派发。

### 3.2 其他渲染器

```
- react-art/              ← SVG 渲染器
- react-native-renderer/  ← React Native 渲染器
- react-test-renderer/    ← 测试渲染器（React 19 中已废弃）
- react-noop-renderer/    ← 空操作渲染器（Reconciler 自测用）
```

所有渲染器都实现了 `react-reconciler` 需要的 **HostConfig** 接口，包括 `createInstance`、`appendInitialChild`、`commitUpdate` 等方法。这就是 React 能跨平台渲染的基础。关于包结构的详细分析可参考 [React 技术揭秘 - 源码的文件结构](https://react.iamkasong.com/preparation/file.html)。

## 4. 包依赖关系

包之间的依赖关系：

- **react** ← 你写的代码 import 的
  - ↓ 委托逻辑
  - **react-reconciler** ← 核心引擎（Fiber, WorkLoop, Hooks, Lane...）
    - ↓ 依赖调度
      - **scheduler**（时间切片 + 优先级）
    - ↓ 依赖宿主配置
      - **react-dom(-bindings)**（DOM HostConfig）
        - ↓ 各平台渲染器
          - react-art（SVG）
          - react-native（Native）
          - react-test-renderer（Test，React 19 中已废弃）

关键设计：`react-reconciler` 不直接依赖 `react-dom`，而是通过 **HostConfig 注入** 模式。reconciler 在构建时通过 `ReactFiberConfig.js` 引入宿主配置，不同渲染器提供不同的实现。

```
// packages/react-reconciler/src/ReactFiberConfig.js
// 这个文件在不同构建中会 fork 到不同实现：
// - react-dom 客户端：ReactFiberConfigDOM.js（react-dom-bindings/src/client/）
// - react-test-renderer：ReactFiberConfigTestHost.js（react-test-renderer/src/）
// - react-noop-renderer：ReactFiberConfigNoop.js（react-noop-renderer/src/）
// - react-art：ReactFiberConfigART.js（react-art/src/）
```

## 5. `shared` 包

跨包共享的工具、类型和常量：

```
packages/shared/
- ReactSymbols.js          ← $$typeof 等符号常量
- ReactTypes.js            ← ReactElement, ReactNode 等类型定义
- ReactFeatureFlags.js     ← 全局 Feature Flag 开关
- ReactSharedInternals.js  ← React 内部共享状态入口
- ReactVersion.js          ← 版本号
- objectIs.js              ← Object.is polyfill
- shallowEqual.js          ← 浅比较
- getComponentNameFromType.js ← 从类型获取组件名
- ExecutionEnvironment.js  ← 运行环境检测
- hasOwnProperty.js         ← Object.prototype.hasOwnProperty
- isArray.js                ← Array.isArray 包装
- checkStringCoercion.js   ← 字符串强制转换检查
- reportGlobalError.js     ← 全局错误上报
- ...
```

## 6. 按重要程度分级

### 第一梯队：必须深入阅读

| 包 | 核心文件 | 理解目标 |
| --- | --- | --- |
| `react-reconciler` | [`ReactFiberWorkLoop.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js) | 工作循环怎么跑的 |
| `react-reconciler` | [`ReactFiberBeginWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js) | 怎么处理每个组件 |
| `react-reconciler` | [`ReactFiberCompleteWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCompleteWork.js) | 怎么创建 DOM 节点 |
| `react-reconciler` | [`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) | Hooks 怎么工作的 |
| `react-reconciler` | [`ReactFiberLane.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js) | 优先级怎么管理 |
| `react-reconciler` | [`ReactFiberCommitWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitWork.js) | DOM 更新怎么提交 |
| `scheduler` | [`Scheduler.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js) | 时间切片怎么实现 |
| `scheduler` | [`SchedulerMinHeap.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerMinHeap.js) | 优先级队列怎么排序 |

### 第二梯队：需要理解大致逻辑

| 包 | 核心文件 | 理解目标 |
| --- | --- | --- |
| `react` | [`ReactHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactHooks.js) | API 是怎么转发的 |
| `react` | `ReactBaseClasses.js` | Component 类的定义 |
| `react-reconciler` | [`ReactFiber.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiber.js) | Fiber 节点怎么创建 |
| `react-reconciler` | [`ReactChildFiber.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactChildFiber.js) | Diff 算法怎么做 |
| `react-reconciler` | [`ReactFiberFlags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberFlags.js) | 副作用标记有哪些 |
| `react-reconciler` | [`ReactWorkTags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactWorkTags.js) | 组件类型有哪些 |
| `react-dom-bindings` | `events/` | 事件系统怎么注册 |

### 第三梯队：按需了解

| 包 | 理解目标 |
| --- | --- |
| `react-server-dom-*` | RSC 协议和打包方式 |
| `react-devtools-*` | DevTools 如何与 React 通信 |
| `react-test-renderer` | 测试渲染器如何 mock DOM（已废弃，推荐 @testing-library/react） |
| `eslint-plugin-react-hooks` | 为什么要"不要在条件中调用 Hooks" |

## 7. 实用技巧：在源码中导航

当你想知道某个功能"源码在哪里"时，可以从入口顺藤摸瓜：

useState 的实现链路示例：
react/src/ReactHooks.js
→ resolveDispatcher().useState()
→ dispatcher 从 ReactSharedInternals 获取
→ react-reconciler/src/ReactFiberHooks.js
→ HooksDispatcherOnMount（首次渲染）
→ HooksDispatcherOnUpdate（更新渲染）
→ mountState() / updateState()

setState 的触发链路示例：
react/src/ReactBaseClasses.js
→ this.setState()
→ Component.prototype.updater.enqueueSetState()
→ react-reconciler/src/ReactFiberClassUpdateQueue.js
→ enqueueUpdate()
→ react-reconciler/src/ReactFiberConcurrentUpdates.js
→ scheduleUpdateOnFiber()
→ react-reconciler/src/ReactFiberRootScheduler.js
→ ensureRootIsScheduled()
→ scheduler/src/Scheduler.js
→ scheduleCallback()

## 8. RootTag：两种根模式

源码中 `ReactRootTags.js` 定义了根的类型：

```javascript
// packages/react-reconciler/src/ReactRootTags.js
export type RootTag = 0 | 1;

export const LegacyRoot = 0;       // React 15 遗留模式（ReactDOM.render）
export const ConcurrentRoot = 1;   // 并发模式（ReactDOM.createRoot）
```

在 React 19+ 中，`LegacyRoot` 已被 `disableLegacyMode` feature flag 禁用，所有应用都使用 `ConcurrentRoot`。这意味着 `ReactDOM.render` 不再可用，必须用 `createRoot`。

## 下一步

- [核心理念心智模型](/00-overview/03-mental-model) — 建立 React 核心理念的心智模型
- [React 核心 API](/01-react-core/01-component-lifecycle) — 了解你每天使用的 API 背后的实现
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — 深入 Fiber 数据结构

## 参考资料

- [React 技术揭秘 - 源码的文件结构 (卡颂)](https://react.iamkasong.com/preparation/file.html) — 中文，包结构和文件职责一览
- [Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — Fiber Reconciliation 算法的逐函数源码分析
- [React 源码目录结构 (xypisces)](https://xypisces.github.io/guide/fiber.html) — 中文 Fiber 架构解析
