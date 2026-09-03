---
title: "Fast Refresh：状态保持的热更新"
---


> 对应源码：[`packages/react-refresh/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-refresh), [`packages/react-reconciler/src/ReactFiberHotReloading.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHotReloading.js)

## 从 Live Reload 到 Fast Refresh

Live Reload 刷新整个页面——所有状态丢失。Hot Module Replacement（HMR）只替换改动的模块，但传统 HMR 不知道如何正确替换 React 组件——它可能保留旧组件的引用，导致新代码不生效。

Fast Refresh 是 React 官方的热更新方案。它的核心思路是：**让 React 自己参与热更新过程**——不是从外部替换组件，而是让 React 内部知道"这个函数变了，用新的版本重新渲染，但保留 state"。

## 四层架构

```
你的代码
     │
     ▼
┌─────────────────┐  ┌───────────────────┐  ┌──────────────────────────────┐
│ 1. Babel 插件   │  │ 2. Runtime        │  │ 3. React 内部                │
│ react-refresh/  │  │ react-refresh/    │  │ ReactFiberHotReloading.js   │
│ babel           │  │ runtime           │  │                              │
└────────┬────────┘  └────────┬─────────┘  └──────────────┬───────────────┘
         │                    │                            │
         └────────────┬──────┘                            │
                      ▼                                   │
         ┌────────────────────────┐                       │
         │ 4. Bundler HMR          │                       │
         │ webpack / turbopack     │───────────────────────┘
         │ module.hot.accept()    │
         └────────────────────────┘
```

## Babel 插件做了什么

`react-refresh/babel` 在编译时扫描所有 React 组件和自定义 Hook，注入两样东西：

```javascript
// 原始代码
function useCounter() {
  const [count, setCount] = useState(0);
  return [count, setCount];
}

export default function App() {
  const [count, setCount] = useCounter();
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

```javascript
// Babel 转换后
var _s = $RefreshSig$();  // ← 注入：收集 Hook 签名

function useCounter() {
  _s();  // ← 注入：标记 Hook 调用
  const [count, setCount] = useState(0);
  return [count, setCount];
}
_s(useCounter, 'useState{}', false, function() {
  return [];  // ← 声明依赖的自定义 Hook
});

var _s2 = $RefreshSig$();

export default function App() {
  _s2();
  const [count, setCount] = useCounter();
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
_s2(App, 'useCounter{}', false, function() {
  return [useCounter];  // ← 声明 App 依赖 useCounter
});

_c = App;
var _c;
$RefreshReg$(_c, 'App');  // ← 注入：注册组件
```

注入两个全局函数：

- `$RefreshReg$(type, id)` — 注册组件（建立 "函数引用 → ID" 映射）
- `$RefreshSig$()` — 收集 Hook 签名（检测 Hook 调用是否变了）

> [Leapcell 的 Fast Refresh 分析](https://leapcell.medium.com/beyond-hmr-understanding-reacts-fast-refresh-d6d80ef0fe4e)详细解释了编译时和运行时的配合。

## Runtime 如何工作

`react-refresh/runtime` 维护一个**组件注册表**——从 ID 到函数引用的映射：

```javascript
// react-refresh/runtime（简化）

// 注册表：ID → { current: 函数引用 }
const allFamiliesByID = new Map();
const allFamiliesByType = new Map();
const pendingUpdates = [];

function register(type, id) {
  let family = allFamiliesByID.get(id);
  if (family === undefined) {
    // 第一次注册
    family = { current: type };
    allFamiliesByID.set(id, family);
  } else {
    // 组件变了 → 记录待更新
    pendingUpdates.push([family, type]);
  }
  allFamiliesByType.set(type, family);
}

function performReactRefresh() {
  // 把 pendingUpdates 应用到 updatedFamiliesByType
  const updatedFamiliesByType = new Map();
  for (const [family, type] of pendingUpdates) {
    family.current = type;  // ← 更新引用
    updatedFamiliesByType.set(type, family);
  }

  // 通知 React 重新渲染
  helpersByRendererID.forEach(helpers => {
    helpers.setRefreshHandler(resolveFamily);
    // scheduleRefresh → React 用新函数引用重新渲染
  });
}
```

## React 内部如何替换

`ReactFiberHotReloading.js` 在 `createWorkInProgress` 时检查函数是否需要热替换：

```javascript
// ReactFiberHotReloading.js（简化）

let resolveFamily = null;  // 由 runtime 设置

function resolveTypeForHotReloading(type) {
  if (resolveFamily === null) {
    return type;  // 热更新未启用
  }
  const family = resolveFamily(type);
  if (family === undefined) {
    return type;  // 没变，返回原函数
  }
  return family.current;  // 变了，返回新函数
}

// 在 ReactFiber.js 的 createWorkInProgress 中（reuse 路径）：
function createWorkInProgress(current, pendingProps) {
  // ...
  workInProgress.type = resolveTypeForHotReloading(current.type);
  // ↑ Fiber 的 type 被替换为新版本函数
  // 但 memoizedState（hooks 链表）保持不变 → state 保留
}
```

关键：**只替换函数引用，不重建 hooks 链表**——这就是 Fast Refresh 能保留 `useState` 和 `useRef` 值的原因。

> [React Native Fast Refresh 文档](https://reactnative.dev/docs/fast-refresh)说明了状态保留的限制和 Hooks 行为。

### 什么时候保留 state，什么时候重置

```
保留 state 的条件：
  → 组件是函数组件（class 组件的 state 不保留）
  → 模块只导出 React 组件（有非组件 export 会重置）
  → Hook 调用顺序没变

强制重置：
  → // @refresh reset  注释
  → Hook 签名变化（调用的 Hook 类型或顺序变了）

总是重新执行（忽略依赖数组）：
  → useEffect
  → useMemo
  → useCallback
  → 这确保你的编辑立刻生效
```

## 下一步

- [Profiler 计时器](/12-internal-mechanisms/02-profiler-timer) — Profiler 如何计时
- [StrictMode](/12-internal-mechanisms/03-strict-mode) — StrictMode 的双重调用
- [Commit 阶段](/03-work-loop/05-commit-phase) — Commit 阶段中的 effect 执行

## 参考资料

- [Beyond HMR: Understanding React's Fast Refresh (Leapcell)](https://leapcell.medium.com/beyond-hmr-understanding-reacts-fast-refresh-d6d80ef0fe4e) — ★ 完整的四层架构深度分析
- [React Fast Refresh — The New React Hot Reloader](https://javascript.plainenglish.io/react-fast-refresh-the-new-react-hot-reloader-652c6645548c) — Fast Refresh 概述
- [Fast Refresh (React Native 文档)](https://reactnative.dev/docs/fast-refresh) — ★ 官方使用指南和限制说明
- [React 源码 react-refresh (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-refresh) — Babel 插件和 Runtime
- [React 源码 ReactFiberHotReloading.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHotReloading.js) — React 内部热更新支持
- [React 源码 ReactFiberClassComponent.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberClassComponent.js) — Class 组件热更新
- [vite-react-refresh (GitHub)](https://github.com/vitejs/vite-plugin-react) — Vite 的 Fast Refresh 集成
- [webpack react-refresh (GitHub)](https://github.com/pmmmwh/react-refresh-webpack-plugin) — Webpack 的 Fast Refresh 集成
