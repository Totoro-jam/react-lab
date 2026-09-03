---
title: "React DevTools 桥梁"
---


> 对应源码：[`packages/react-reconciler/src/ReactFiberDevToolsHook.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberDevToolsHook.js), [`packages/react-devtools-shared/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-devtools-shared), [`packages/react-debug-tools/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-debug-tools)

## 你看到的不是 Fiber——你看到的是 DevTools 的"翻译"

打开浏览器 DevTools 的 Components 面板，你看到一棵组件树。你以为你在直接看 React 内部的 Fiber 树？

不是。你在看的是 **DevTools 前端**的 UI，它通过一个 **bridge** 与 React 内部通信。你在 UI 上看到的每个组件名、每个 prop 值、每个 state 快照，都是 React 内部通过 bridge 发送过来的"翻译"。

```
React 内部（你的页面）                      DevTools 前端（浏览器面板）
────────────────────────                  ────────────────────────────
Fiber 树                                  Components 面板
ReactFiberDevToolsHook                    Store
         │                                        ▲
         └──── Bridge（通过 message 通信）──────────┘
              mount fiber → 发送 "mount" 事件
              update fiber → 发送 "update" 事件
              unmount fiber → 发送 "unmount" 事件
```

## 桥梁如何连接：installHook

当 DevTools 浏览器扩展检测到页面有 React 时，它注入一段脚本——`installHook`——这段脚本在全局对象上注册一个 Hook 入口：

```javascript
// react-devtools-shared/src/hook.js（简化）

function installHook(target) {
  const hook = {
    // 注册的渲染器（每个 React 实例注册一个）
    renderers: new Map(),

    // 监听 bridge 消息
    listeners: {},

    // Reconciler 调用的方法
    inject(renderer) {
      // 被 ReactFiberDevToolsHook.js 调用
      // 将渲染器信息注册到 DevTools
      const id = Math.random().toString(32).slice(2);
      this.renderers.set(id, renderer);
      return id;
    },

    onCommitRoot(root, priority) {
      // 每次 commit 后被调用
      // 通知 DevTools 更新组件树
      this.emit('commitRoot', { root, priority });
    },

    onCommitMount(fiber) {
      // 新组件挂载
      this.emit('commitMount', getFiberData(fiber));
    },

    onCommitUpdate(fiber) {
      // 组件更新
      this.emit('commitUpdate', getFiberData(fiber));
    },

    // ... 更多事件
  };

  target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
}
```

React 内部的 `ReactFiberDevToolsHook.js` 在检测到全局 Hook 存在时，会调用 `hook.inject(renderer)` 注册自己。

## ReactFiberDevToolsHook：Reconciler 侧的通信点

```javascript
// packages/react-reconciler/src/ReactFiberDevToolsHook.js（简化）

const {isDevToolsPresent} = getDevToolsHooks();

function getDevToolsHooks() {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook !== undefined) {
    isDevToolsPresent = true;
    // 注册 Reconciler 到 DevTools
    const id = hook.inject({
      bundleType: 1,          // 0=production, 1=development
      version: '19.2.0',     // React 版本
      rendererPackageName: 'react-dom',
      // ...
    });
    return {isDevToolsPresent: true};
  }
  return {isDevToolsPresent: false};
}
```

当 `isDevToolsPresent` 为 true 时，Reconciler 在关键的渲染节点上调用 DevTools Hook 方法：

```javascript
// Commit 阶段后调用
if (isDevToolsPresent) {
  hook.onCommitRoot(root, priority);
  // → DevTools 收到通知 → 更新组件树视图
}

// 新 Fiber 挂载时调用
if (isDevToolsPresent) {
  hook.onCommitMount(fiber);
  // → DevTools 收到通知 → 添加新节点到树
}
```

## DevTools 如何读取 Fiber 数据

当你点击一个组件，DevTools 需要读取它的 props、state、hooks。这时它调用：

```javascript
// react-devtools-shared/src/renderer.js（简化）

function inspectElement(fiberID) {
  const fiber = getFiberByID(fiberID);

  return {
    id: fiberID,
    // 从 Fiber 读取 props
    props: fiber.memoizedProps,
    // 从 Fiber 读取 state
    state: fiber.memoizedState,
    // 从 Fiber 读取 hooks 链表（如果是函数组件）
    hooks: extractHooks(fiber),
    // 组件名、类型等
    name: getComponentName(fiber),
    type: fiber.type,
    // ...
  };
}
```

DevTools **直接读取 Fiber 的字段**——`memoizedProps`、`memoizedState`、`type` 等。它不需要复制数据——Fiber 就是数据源。

### Hooks 检查：react-debug-tools

[react-debug-tools](https://github.com/facebook/react/tree/eafeac097b/packages/react-debug-tools) 包提供了工具来"检查"函数组件的 hooks 链表，而不需要实际渲染：

```javascript
// react-debug-tools/src/ReactDebugHooks.js（简化）

function inspectHooks(renderFunction, props) {
  // 用一个特殊的 dispatcher 执行组件函数
  // 这个 dispatcher 不执行真正的 hook 逻辑
  // 而是记录每个 hook 的当前值

  const hooks = [];
  for (let hook = fiber.memoizedState; hook !== null; hook = hook.next) {
    hooks.push({
      id: hookIndex++,
      name: getHookName(hook),
      value: hook.memoizedState,
      // ...
    });
  }
  return hooks;
}
```

这就是你在 DevTools 中看到 `useState` → `useState` → `useEffect` 列表的方式——DevTools 遍历 Fiber 的 `memoizedState` 链表，读取每个 hook 的 `memoizedState`。

## Profiler：记录每次 commit

DevTools 的 Profiler 面板追踪每次 commit 的时间和组件：

```javascript
// 每次 commit 时：
hook.onCommitRoot(root, priority);

// DevTools 收到后：
function onCommitRoot(root, priority) {
  const commitTime = now();

  // 遍历所有 fiber，记录哪些fiber 变了
  for (const fiber of changedFibers) {
    recordCommit({
      fiberID: getFiberID(fiber),
      commitTime,
      // 从 ReactProfilerTimer.js 读取渲染时间
      duration: fiber.actualDuration,
      // ...
    });
  }
}
```

`ReactProfilerTimer.js` 在 `beginWork` 开始时计时，`completeWork` 结束时停止，记录每个 Fiber 的渲染时间。这些时间只在 `ProfileMode` 下计算。

## React 19.2 的新 DevTools 功能

> [React DevTools 7.0 CHANGELOG](https://github.com/facebook/react/blob/eafeac097b/packages/react-devtools/CHANGELOG.md)记录了完整更新。

```
DevTools 7.0（2025-10）新功能：
  • "Suspended by" 面板：显示组件被什么挂起（use()、lazy、Suspensey 资源）
  • Code Editor 侧边栏：在 Chrome Sources 面板中集成
  • Thenable 检查：一等支持检查 use() 的 Promise
  • Error 对象检查：可以检查 props 中的 Error 的 cause/name/message/stack
  • React Element 检查：可以检查 React.lazy 和 Element 对象
  • Owner Stacks：显示"rendered by"的完整调用链
  • Performance Tracks：Chrome DevTools Performance 面板中的 React 专用轨道

DevTools 6.0（2024-09）新功能：
  • Server Components 在组件树中的显示和过滤
  • 函数点击跳转到定义
  • React Compiler 徽章
  • 环境名过滤
```

## Performance Tracks（React 19.2）

[React 19.2 Blog](https://react.dev/blog/2025/10/01/react-19-2) 和 [React Performance Tracks 官方文档](https://react.dev/reference/dev-tools/react-performance-tracks) 详细介绍了这一特性。Performance Tracks 是 React 19.2 最重要的 DevTools 新功能——在 Chrome DevTools Performance 面板中添加 React 专用的时间线轨道。

### 三种 Track

```
┌─ Chrome DevTools Performance Panel ──────────────────────┐
│                                                           │
│  Scheduler ⚛                                               │
│  ├─ Blocking    ← 同步更新（用户交互触发的优先级最高任务）  │
│  ├─ Transition  ← 非阻塞后台任务（startTransition 触发）   │
│  ├─ Suspense    ← Suspense 相关工作（显示/切换 fallback）  │
│  └─ Idle        ← 最低优先级空闲任务                       │
│                                                           │
│  Components ⚛                                              │
│  ├─ Mount       ← 组件首次渲染的火焰图                    │
│  ├─ Update      ← 组件更新的火焰图                        │
│  ├─ Unmount     ← 组件卸载                                │
│  └─ Effects     ← useEffect/useLayoutEffect 执行         │
│                                                           │
│  Server ⚛（仅开发模式）                                   │
│  ├─ Server Requests  ← RSC 中的 Promise（fetch、fs 等）   │
│  └─ Server Components ← Server Component 渲染时间火焰图   │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Scheduler Track 详解

Scheduler Track 分 4 个子轨道，每个对应一种优先级：

| 子轨道 | 对应 Lane | 触发场景 |
| -------- | --------- | --------- |
| Blocking | SyncLane / SyncHydrationLane | 同步更新——用户输入、同步渲染 |
| Transition | TransitionLanes | `startTransition` 中的后台更新 |
| Suspense | HydrationLanes / 重试 | Suspense fallback 揭示、水合 |
| Idle | IdleLane | 后台预渲染、低优先级任务 |

每个渲染分为多个阶段：

- **Update** — 是什么触发了新渲染（如点击事件、setState）
- **Render** — React 调用组件函数渲染子树（可看到 Components Track 上的火焰图）
- **Commit** — DOM 变更 + layout effects（useLayoutEffect）
- **Remaining Effects** — passive effects（useEffect），通常在 paint 之后

### 使用方式

```
1. 使用 development build 或 profiling build
   （production build 默认禁用 Performance Tracks）
   
2. 打开 Chrome DevTools → Performance tab
3. 点击 Record
4. 与应用交互
5. 停止 Record
6. 在时间线上可以看到 Scheduler / Components / Server 三种 Track
```

性能 profiling 需要特别构建：

- `react-dom/profiling` 替代 `react-dom/client`
- profiling build 中 Scheduler Track 默认可用
- Components Track 仅显示 `<Profiler>` 包裹的组件（除非有 DevTools 扩展）
- Server Track 仅在开发模式可用

### 级联更新检测

级联更新（cascading updates）是性能回归的原因——如果在 render 过程中触发了新的 update，React 可能丢弃已完成工作并重新渲染。

Performance Tracks 在开发者模式下会标出级联更新——点击"Cascading update"条目可以看到是哪个组件触发的更新，及触发方法的堆栈。

## Owner Stacks（React 19.1）

[React 19.1](https://react.dev/reference/react/captureOwnerStack) 引入了 `captureOwnerStack` API——开发模式下返回"是谁渲染了当前组件"的堆栈。

### Owner Stack vs Component Stack

```
组件树：
  <App>
    <Navigation>
    <Component>
      <fieldset>
        <SubComponent />    ← 这里抛出错误
      </fieldset>
      <legend>...</legend>
    </Component>
  </App>

Component Stack（组件堆栈，传统方式）：
  at SubComponent
  at fieldset
  at Component
  at main
  at React.Suspense
  at App
  → 包含所有父组件，包括 DOM 元素

Owner Stack（所有者堆栈，React 19.1 新增）：
  at Component
  → 只有"直接创建了 <SubComponent/> 的组件"
  → App 只是传递 children（没有创建 <SubComponent/>）
  → fieldset 是 DOM 元素（不是 Owner）
  → legend 是兄弟节点（不在链路上）
  → SubComponent 在调用堆栈中（不需要重复）
```

Owner Stack 更精简——它只显示**谁通过 JSX 创建了出错的节点**，而不是整棵树路径。

### 使用场景

```javascript
// 1. 错误边界中增强错误信息
createRoot(container, {
  onUncaughtError: (error, errorInfo) => {
    console.log('Component Stack:', errorInfo.componentStack);
    const ownerStack = captureOwnerStack();
    console.log('Owner Stack:', ownerStack);
    // 两者都发给错误监控服务
    sendToSentry({ error, componentStack: errorInfo.componentStack, ownerStack });
  },
}).render(<App />);

// 2. console.error 拦截器
const originalConsoleError = console.error;
console.error = function(...args) {
  originalConsoleError.apply(console, args);
  const ownerStack = captureOwnerStack();
  if (ownerStack) {
    showErrorOverlay({ consoleMessage: args[0], ownerStack });
  }
};

// 3. 普通组件中调试
function MyComponent() {
  if (process.env.NODE_ENV !== 'production') {
    const stack = React.captureOwnerStack();
    console.log('I was rendered by:', stack);
  }
  return <div>Hello</div>;
}
```

### 可用场景

Owner Stack 在以下场景中可用：

- 组件 render（包括函数组件体）
- Effects（`useEffect`、`useLayoutEffect`、`useInsertionEffect`）
- React 事件处理器（如 `<button onClick={...}>`）
- React 错误处理器（`onCaughtError`、`onRecoverableError`、`onUncaughtError`）

Owner Stack 在以下场景中不可用（返回 `null`）：

- `setTimeout` / `setInterval` 回调
- `fetch().then()` 之后的回调
- 原生 DOM 事件处理器（非 React 事件）

### 生产环境限制

`captureOwnerStack` 只在开发构建中导出。使用 namespace import 做条件访问：

```javascript
import * as React from 'react';

if (process.env.NODE_ENV !== 'production') {
  const stack = React.captureOwnerStack();  // 开发模式有效
}
// 生产模式中 React.captureOwnerStack === undefined
```

## DevTools 不影响生产

所有 DevTools 集成代码都在 `__DEV__` 或 `isDevToolsPresent` 检查下：

```javascript
if (__DEV__) {
  if (isDevToolsPresent) {
    hook.onCommitRoot(root, priority);
  }
}
```

在 production build 中，这些代码被 dead code elimination 移除——React 生产版本中没有任何 DevTools 相关的开销。

## 下一步

- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — Fiber 的 `_debugOwner` 和 `_debugStack` 字段（DevTools 用）
- [Commit 阶段](/03-work-loop/05-commit-phase) — Commit 阶段中 DevTools Hook 的调用点
- [术语表](/reference/glossary) — DevTools 相关术语

## 参考资料

- [React Developer Tools (官方文档)](https://react.dev/learn/react-developer-tools) — 安装和使用指南
- [React DevTools CHANGELOG (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-devtools/CHANGELOG.md) — ★ v5-v7 完整更新历史
- [React 源码 ReactFiberDevToolsHook.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberDevToolsHook.js) — Reconciler 侧 DevTools Hook
- [React 源码 react-debug-tools (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-debug-tools) — Hooks 检查工具
- [React 源码 react-devtools-shared (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-devtools-shared) — DevTools 共享逻辑
- [React 源码 ReactProfilerTimer.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactProfilerTimer.js) — Profiler 计时实现
- [React 源码 ReactFiberHotReloading.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHotReloading.js) — Hot Reloading 支持
- [React 19.2 博文 (官方)](https://react.dev/blog/2025/10/01/react-19-2) — Performance Tracks 与 DevTools 集成
- [What's New in React 19.2 (certificates.dev)](https://certificates.dev/blog/whats-new-in-react-192) — 19.2 功能概览含 DevTools
- [React Developer Tools Extensions (Chrome/Firefox)](https://react.dev/learn/react-developer-tools) — 浏览器扩展安装
- [fiber-debugger fixture (GitHub)](https://github.com/facebook/react/tree/eafeac097b/fixtures/fiber-debugger) — 官方 Fiber 调试工具
