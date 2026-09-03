---
title: "DevTools Components 面板"
---


> 对应源码：[`packages/react-devtools-shared/src/frontend/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-devtools-shared/src/frontend), [`packages/react-debug-tools/src/ReactDebugHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-debug-tools/src/ReactDebugHooks.js)

## 你看到的组件树是怎么来的

DevTools Components 面板显示的组件树不是直接读取 Fiber 树——它经过了一个完整的"采集 → 序列化 → 传输 → 渲染"管线。

```
React 内部（页面）                    DevTools 前端（面板）
─────────────                      ──────────────
Fiber 树                            Components 树 UI
  │                                   │
  ▼                                   ▼
ReactFiberDevToolsHook              Store（前端状态）
  │  │                              │  │
  │  ├─ mount → onCommitRoot        │  ├─ 接收 "mount" 事件
  │  ├─ update → onCommitRoot       │  ├─ 接收 "update" 事件
  │  └─ unmount → onCommitRoot      │  └─ 接收 "unmount" 事件
  │                                   │
  └── Bridge ──序列化消息──→ ────→ ───┘
```

## installHook：DevTools 的入口

DevTools 浏览器扩展检测到页面有 React 时，注入 `installHook` 脚本。它 Hooks 到 React 的全局对象上：

```javascript
// react-devtools-shared/src/hook.js（简化）
function installHook(target) {
  const hook = {
    renderers: new Map(),    // 注册的渲染器
    listeners: {},           // 事件监听
    emit(type, payload) {
      Object.values(this.listeners[type] || {}).forEach(fn => fn(payload));
    },
    // DevTools 调用此方法注册渲染器
    inject(renderer) {
      const id = ++uidCounter;  // 递增 ID（非随机）
      this.renderers.set(id, renderer);
      this.emit('renderer', { id, renderer });
      return id;
    },
    // React Reconciler 调用此方法通知 DevTools
    onCommitRoot(root, priority) {
      this.emit('commit', { root, priority });
    },
  };
  target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
}
```

## Components 树的构建

每次 React commit 后，DevTools 后端遍历 Fiber 树，为每个 Fiber 节点创建一个轻量的"元素描述"对象：

```javascript
// 简化自 react-devtools-shared/src/backend/fiber/renderer.js
// 实际遍历使用 mountFiberRecursively / updateFiberRecursively

function inspectFiber(fiber) {
  return {
    id: getFiberIDForInspection(fiber),   // 基于 fiber 的唯一 ID
    parentID: getFiberIDForInspection(fiber.return),
    name: getDisplayNameForFiber(fiber),  // 实际函数名
    type: fiber.tag,                       // WorkTag
    key: fiber.key,
    hasOwners: true,
    canEditHooks: true,
    canEditProps: true,
  };
}
```

### 按需获取 props/state/hooks

DevTools 不在每次 commit 时传输所有 props/state——太重了。只传输当前**被选中检查**的组件的详细数据：

```
用户在 Components 面板点击一个组件
  → 前端发送 "inspectElement" 消息到后端
  → 后端调用 inspectElement(fiberID)
  → 获取完整的 props, state, hooks 数据
  → 返回给前端渲染
```

### Hooks 检查：react-debug-tools

DevTools 如何读取函数组件的 Hooks 状态？它使用 `react-debug-tools` 包，临时替换 Hooks dispatcher 来"重放"组件的 Hook 调用：

```javascript
// react-debug-tools/src/ReactDebugHooks.js（简化）

function inspectHooksImpl(renderFunction, props, currentDispatcher) {
  const previousDispatcher = currentDispatcher.H;
  // 设置特殊的 debug dispatcher（DispatcherProxy）
  currentDispatcher.H = DispatcherProxy;

  // 临时渲染组件——不改 DOM，只收集 Hooks 信息
  try {
    renderFunction(props);
  } finally {
    currentDispatcher.H = previousDispatcher;  // 恢复原始 dispatcher
  }

  return buildTree(rootStack, readHookLog);  // 构建 Hooks 树
}
```

这就是为什么在 DevTools 中能看到每个 Hook 的当前值和名称。

## DevTools v7.0 新功能

> 根据 [DevTools CHANGELOG](https://github.com/facebook/react/blob/eafeac097b/packages/react-devtools/CHANGELOG.md)，v7.0 于 2025 年 10 月发布。

### Server Components 支持

- Server Components 在树中用特殊标记区分
- 可以过滤只显示 Server Components
- 显示 `await` 在 Server Components 中的挂起状态

### "Suspended by" 面板

v7.0 新增区域显示组件被挂起的所有原因：`await` in Server Components、`React.lazy`、`use()`、suspensey resources。

### 函数跳转到定义

v6.0+ 支持点击组件中的函数直接跳转到源码——利用 Source Map 和 Chrome DevTools Protocol。

## DevTools 版本演进

```
v4.x (2022)    Hooks 支持、Owners 树、Suspense toggle
v5.0 (2023-11) Compiler badge、React 19 Hook 支持
v5.2 (2024-05) Profiler 中显示 Compiler badge
v6.0 (2024-09) Server Components 支持、函数跳转定义
v6.1 (2025-01) 静态 Components 面板布局
v7.0 (2025-10) Suspended by 面板、Chrome Sources 面板集成
```

## 下一步

- [DevTools 桥梁原理](/11-devtools/01-devtools-bridge) — DevTools 桥梁原理和 installHook 机制
- [Profiler 与 Performance Tracks](/11-devtools/03-devtools-profiler-panel) — Profiler 面板和 Performance Tracks
- [Profiler 计时器](/12-internal-mechanisms/02-profiler-timer) — Profiler 计时器的内部实现

## 参考资料

- [React DevTools CHANGELOG (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-devtools/CHANGELOG.md) — ★ v4-v7 完整变更日志
- [React 源码 react-devtools-shared (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-devtools-shared) — DevTools 共享逻辑
- [React 源码 react-debug-tools (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-debug-tools) — Hooks 检查工具
- [React Developer Tools (官方文档)](https://react.dev/learn/react-developer-tools) — 安装和使用指南
- [Debug React apps with React Developer Tools (LogRocket)](https://blog.logrocket.com/debug-react-apps-react-devtools/) — DevTools 功能详解
- [Understanding React Dev Tools Profiler results (StackOverflow)](https://stackoverflow.com/questions/77872239/understanding-react-dev-tools-profiler-results) — Profiler 结果解读
- [React 源码 ReactFiberDevToolsHook.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberDevToolsHook.js) — Reconciler 侧 DevTools Hook
- [Profiler: Show which hooks changed (GitHub Issue #312)](https://github.com/bvaughn/react-devtools-experimental/issues/312) — Hooks 检查的内部实现讨论
