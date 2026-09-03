---
title: "实践练习：React 19.2 新特性实战"
description: "Activity + useEffectEvent + cacheSignal + Performance Tracks 动手实践"
---


> 对应章节：[06-concurrent-features/05-offscreen.md](../../06-concurrent-features/05-offscreen), [04-hooks-internals/09-utility-hooks.md](../../04-hooks-internals/09-utility-hooks), [09-react-server/06-cache-signal.md](../../09-react-server/06-cache-signal), [11-devtools/01-devtools-bridge.md](../../11-devtools/01-devtools-bridge)

## 为什么推荐这个实践

React 19.2 在 2025 年 10 月发布，引入了多个改变开发者日常编码模式的新特性。[React 19.2 官方博客](https://react.dev/blog/2025/10/01/react-19-2) 完整列出了这些特性。本练习让你亲手体验最有影响力的三个：`<Activity>`、`useEffectEvent` 和 `cacheSignal`。

## 推荐资料

- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — ★ 官方发布说明
- [What's New in React 19.2 (certificates.dev)](https://certificates.dev/blog/whats-new-in-react-192) — ★ 实战指南，含 Activity 和 useEffectEvent 深度分析
- [React 19.2: Upgrade Guide (MakerKit)](https://makerkit.dev/blog/tutorials/react-19-2) — ★ 完整升级指南，含 CVE 安全补丁
- [React 19.2: Deep Dive into Activity and useEffectEvent (DEV Community)](https://dev.to/taronvardanyan/react-192-deep-dive-into-activity-and-useeffectevent-1f1g) — 深入讲解
- [Tried React 19's Activity Component (JavaScript Plain English)](https://javascript.plainenglish.io/tried-react-19s-activity-component-here-s-what-i-learned-5532797ee532) — 实际使用心得
- [React Activity Component: Stop Losing UI State (Medium)](https://medium.com/@aguzzimarcello/a-practical-guide-to-reacts-new-activity-component-2f92a8d2a299) — Activity 实战
- [React 19.2: A Complete Breakdown (Medium)](https://medium.com/@gurukishore111/react-19-2-a-complete-breakdown-of-new-features-with-examples-5062f247ae92) — 新特性概述

## 前置知识

- React 19 基础（hooks、Server Components、Suspense）
- pnpm/打包工具基础
- 最好有一个可以实验的 React 项目（或创建新项目）

## 实践步骤

### 1. 安装 React 19.2

```bash
# 创建新项目
pnpm create vite@latest react19-lab -- --template react
cd react19-lab

# 安装 React 19.2
pnpm install react@^19.2.0 react-dom@^19.2.0

# 升级 ESLint 插件到 v6（支持 useEffectEvent 规则）
pnpm install -D eslint-plugin-react-hooks@^6
```

### 2. Activity：保持状态的后台切换

**目标**：构建一个多标签页面板——切走时保留输入状态，切回时恢复。

#### 2.1 传统方式的问题

```jsx
// 传统条件渲染——切走会卸载组件，丢失状态
function Dashboard({ activeTab }) {
  return (
    <div>
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  );
}

// 问题：用户在 Settings 里填了姓名，切到 Analytics 再切回 → 姓名丢了
```

#### 2.2 用 Activity 解决

```jsx
import { Activity } from 'react';

function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div>
      <nav>
        <button onClick={() => setActiveTab('overview')}>Overview</button>
        <button onClick={() => setActiveTab('analytics')}>Analytics</button>
        <button onClick={() => setActiveTab('settings')}>Settings</button>
      </nav>

      {/* 三个 tab 都保留在 DOM 中，只是切换可见性 */}
      <Activity mode={activeTab === 'overview' ? 'visible' : 'hidden'}>
        <OverviewTab />
      </Activity>
      <Activity mode={activeTab === 'analytics' ? 'visible' : 'hidden'}>
        <AnalyticsTab />
      </Activity>
      <Activity mode={activeTab === 'settings' ? 'visible' : 'hidden'}>
        <SettingsTab />
      </Activity>
    </div>
  );
}

// SettingsTab 的输入在切换后依然保留
function SettingsTab() {
  const [name, setName] = useState('');
  return <input value={name} onChange={(e) => setName(e.target.value)} />;
}
```

#### 2.3 验证 Activity 的行为

```
hidden 模式时发生的：
  ✓ 组件 state 保留（name 不丢失）
  ✓ DOM 节点保留（display:none CSS 隐藏）
  ✓ useEffect / useLayoutEffect 的 cleanup 函数被执行（但 effect 本身不重新运行）
  ✓ 更新被降级为低优先级——不阻塞 visible 部分
  ✗ effect 不会重新订阅（如 WebSocket、setInterval 等）
  ✗ 外部资源（如 video）可能继续播放——需手动 cleanup

visible 模式时发生的：
  ✓ 组件正常显示
  ✓ effects 重新 mount（subscribe、start interval 等）
  ✓ 更新恢复正常优先级
  ✓ DOM 从 display:none 恢复
```

### 3. useEffectEvent：分离"事件"和"响应"

**目标**：重构一个常见的 useEffect 依赖问题——chat 通知中的 theme 不应导致重连。

#### 3.1 问题代码

```jsx
import { useEffect } from 'react';

function ChatRoom({ roomId, theme }) {
  useEffect(() => {
    const connection = createConnection(serverUrl, roomId);
    connection.on('connected', () => {
      showNotification('Connected!', theme);  // theme 在这里使用
    });
    connection.connect();
    return () => connection.disconnect();
  }, [roomId, theme]);  // ← theme 一变就会重连 chat！

}
```

#### 3.2 用 useEffectEvent 解决

```jsx
import { useEffect, useEffectEvent } from 'react';

function ChatRoom({ roomId, theme }) {
  // 提取"事件"——不是响应式，不影响 effect 依赖
  const onConnected = useEffectEvent(() => {
    showNotification('Connected!', theme);
    // ↑ 总是读到最新的 theme
  });

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId);
    connection.on('connected', () => {
      onConnected();  // ← 调用 effect event
    });
    connection.connect();
    return () => connection.disconnect();
  }, [roomId]);  // ← theme 不在依赖中！
}
```

#### 3.3 验证 useEffectEvent 的行为

```
theme 从 "dark" 变为 "light"：

效果：
  ✓ effect 不重新执行（不会重连 chat）
  ✓ onConnected 的 ref.impl 在 commit 后更新为最新 closure
  ✓ connected 事件触发时 → 调用 onConnected() → ref.impl 执行
    → 闭包中 `theme` 是最新值（"light"）

对比 useRef workaround：
  useEffectEvent 更安全
  → ref 更新在 commit 阶段（不是 render 阶段写 side effects）
  → eslint 能识别 effect event（不会误报缺少依赖）
```

#### 3.4 更多 useEffectEvent 使用场景

```jsx
// 场景 1：分析日志，只读最新 state 不触发 effect 重执行
function Page({ url }) {
  const { items } = useContext(ShoppingCartContext);

  const onVisit = useEffectEvent((visitedUrl) => {
    logVisit(visitedUrl, items.length);  // 总是读最新的 items.length
  });

  useEffect(() => {
    onVisit(url);
  }, [url]);  // ← items 不在依赖中
}

// 场景 2：WebSocket 消息，根据当前 user 选择性处理
function Notifications({ userId, notifications }) {
  const handleMessage = useEffectEvent((message) => {
    if (message.userId === userId) {  // 总是读最新的 userId
      notifications.show(message.text);
    }
  });

  useEffect(() => {
    ws.on('message', handleMessage);
    return () => ws.off('message', handleMessage);
  }, []);  // ← userId 不在依赖中（WebSocket 不重连）
}
```

### 4. cacheSignal：RSC 中的资源清理

**目标**：在 Server Component 中使用 `cache()` + `cacheSignal()` 实现 fetch 自动取消。

#### 4.1 问题

```jsx
// 没有资源清理——用户导航离开时，fetch 仍在后台运行
async function ProductPage({ id }) {
  const product = await fetch(`/api/products/${id}`).then(r => r.json());
  // 如果用户在 fetch 完成前离开 → fetch 浪费带宽
  return <Product product={product} />;
}
```

#### 4.2 用 cacheSignal 解决

```jsx
import { cache, cacheSignal } from 'react';

// 1. 用 cache() 去重——同一次请求中相同 id 只 fetch 一次
const getProduct = cache(async (id) => {
  const signal = cacheSignal();  // ← 关键：获取 abort 信号
  const response = await fetch(`/api/products/${id}`, { signal });

  // 处理 abort 错误（重要！）
  if (!response.ok) {
    throw new Error(`Failed to fetch product ${id}`);
  }
  return response.json();
});

async function ProductPage({ id }) {
  const product = await getProduct(id);
  return <Product product={product} />;
}
```

#### 4.3 处理 AbortError

```jsx
// 不处理 AbortError 会导致未捕获 promise 拒绝
const getProduct = cache(async (id) => {
  const signal = cacheSignal();
  try {
    const response = await fetch(`/api/products/${id}`, { signal });
    return response.json();
  } catch (error) {
    // 区分 abort（正常行为）和真实错误
    if (error instanceof Error && error.name === 'AbortError') {
      return null;  // ← 静默返回
    }
    throw error;  // ← 重新抛出真实错误
  }
});
```

#### 4.4 触发时机

```javascript
// cacheSignal() 返回的 AbortSignal 在以下情况触发：
// 1. RSC 渲染成功完成 → cache scope 释放 → abort
// 2. RSC 渲染中止（用户导航离开）→ abort
// 3. RSC 渲染失败（组件掷错）→ abort
```

### 5. Performance Tracks：Chrome DevTools 中的 React 调度

**目标**：用 Performance Tracks 理解 React 的优先级分配。

#### 5.1 启用

```bash
# development 默认启用
# profiling build：
# 需要 alias react-dom/client → react-dom/profiling
# 在 vite.config.js:
export default defineConfig({
  resolve: {
    alias: {
      'react-dom/client': 'react-dom/profiling',
    },
  },
});
```

#### 5.2 录制并分析

```
1. 打开 Chrome DevTools → Performance tab
2. 点击 Record
3. 与你的应用交互（点击按钮、切换标签、输入文字）
4. 停止 Record
5. 在时间线上查看：
   - Scheduler Track ⚛
     ├── Blocking        ← 用户交互（同步）
     ├── Transition      ← startTransition 中的更新
     ├── Suspense        ← Suspense 边界揭示
     └── Idle            ← 低优先级后台
   - Components Track ⚛
     ├── Mount           ← 组件首次渲染
     ├── Update          ← 组件更新
     └── Effects         ← useEffect/useLayoutEffect 执行
```

#### 5.3 级联更新检测

```
如果你看到 "Cascading update" 标记：
  → 某个组件在 render 过程中调用了 setState
  → React 可能丢弃已完成工作，重新渲染
  → 点击该标记查看是哪个组件触发，以及堆栈

常见原因：
  → useEffect 中设置 state（应该考虑 useEffectEvent）
  → suspense 后恢复时触发额外更新
  → React 19.2 的 ESLint v6 会标记出 setState in effect 违规
```

#### 5.4 完整实操 Walkthrough

以下是一次完整的 Performance Tracks 性能排查实战，覆盖三个最常见的性能问题：

```jsx
// 测试代码——含三种性能问题
function SearchDashboard({ url }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  // 问题 1：cascading update——render 阶段设置 state
  const [isSearching, setIsSearching] = useState(false);
  // isSearching = results.length > 0; ← 在 render 中设置 → cascading update!

  // 问题 2：同步阻塞性的 transition
  const search = () => {
    // 没有 startTransition → 走 Blocking Track → 阻塞主线程
    fetch(url + '?q=' + query)
      .then(r => r.json())
      .then(data => setResults(data));
  };

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <button onClick={search}>Search</button>
      <ul>{results.map(r => <li key={r.id}>{r.name}</li>)}</ul>
    </>
  );
}
```

```
第 1 步：录制
  1. 打开 Chrome DevTools → Performance tab
  2. 点击 Record 按钮
  3. 在应用中：输入搜索词 → 点击 Search 按钮 → 等待结果出现
  4. 点击 Stop 按钮
  5. 在时间线上查看：

第 2 步：查看 Scheduler Track
  发现："Blocking" 子轨道里有一个 200ms 的条
  → 这是什么？点击该条目 → 查看 Update 事件详情
  → Update 标签中显示："onClick"（来自 button 的 onclick 事件）

  分析：搜索的 `fetch` 后的 setState 走了 SyncLane（Blocking Track）
  问题：200ms 期间主线程被阻塞，用户无法交互
  修正：把 setState 用 startTransition 包裹

第 3 步：查看 Components Track
  发现：SearchDashboard 渲染旁边的 "Cascading update" 标记
  → 点击该标记查看详情：
  → "setState called during render"
  → 堆栈指向第 N 行：isSearching 的设置

  分析：在 render 中设置 state 导致 React 丢弃完成的工作，重新渲染
  修正：删掉 isSearching state，改为 derives: `const isSearching = results.length > 0`

第 4 步：检查 Effects 阶段
  点击 "Effects" 标记 → 查看 useEffect 的执行时间
  如果花费超过 16ms → 说明 effect 太慢
  修正：考虑 useEffectEvent 提取事件或拆分 effect

第 5 步：验证修正
  修正后重新录制：
  Blocking Track 应该只有 input 输入（用户交互必需）
  Transition Track 应该出现 200ms 的搜索更新
  Components Track 中的 "Cascading update" 标记消失
```

#### 5.5 Performance Tracks 排查清单

```
每次都能复发且在 16ms 内修复不了的问题 → 用 Performance Tracks 录制：

  [ ] Blocking Track 有长时间的 block（>100ms）？
      → 检查是否用 startTransition 包裹了非紧急更新
      → 考虑 useDeferredValue
      → 检查是否是 fetch 后 setState 直接走 SyncLane

  [ ] Transition Track 占用很多时间但没有显示出来？
      → 可能不是 transition——走了 Blocking Track
      → 检查 startTransition 是否正确包裹

  [ ] Components Track 上有 "Cascading update" 标记？
      → render 阶段调用 setState 了
      → 用 ESLint v6 catch: set-state-in-effect 规则
      → 检查 derived state：要不要直接计算而不是存 state

  [ ] Components Track Mount 时间过长（>200ms）？
      → 巨型组件需要拆分
      → 用 React.lazy 拆分代码
      → 用 Suspense + Activity 预渲染

  [ ] Server Components Track（开发模式）中 fetch 变红？
      → 检查 cacheSignal 的 AbortError 处理
      → 考虑 reduced fetch 次数（合并请求）
      → 检查 apollo/client 等外部库的 RSC 适配
```

### 6. 总结对照

| 传统方式 | React 19.2 新方式 | 收益 |
| --------- | ------------------ | ------ |
| `{visible && <Tab/>}` | `<Activity mode={visible ? 'visible' : 'hidden'}>` | 保留 state、DOM |
| `useEffect(..., [theme])` 导致重连 | `useEffectEvent` + `useEffect(..., [roomId])` | theme 不再导致重连 |
| fetch 没有 AbortSignal | `cache(fetch, signal: cacheSignal())` | 导航离开自动取消 |
| DevTools 只有 Main Track | Performance Tracks | 可看 React 调度细节 |

## 对照源码阅读

- [ReactFiberActivityComponent.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberActivityComponent.js) — Activity 内部实现
- [ReactFiberHooks.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) — useEffectEvent (mountEvent/updateEvent)
- [ReactCacheImpl.js](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactCacheImpl.js) — cache() + cacheSignal()
- 对照本仓库 `06-concurrent-features/05-offscreen.md` 和 `09-react-server/06-cache-signal.md`

## 预期收获

- 理解 Activity 的 hidden/visible 模式对 effect 和 state 的影响
- 掌握 useEffectEvent 解决"依赖数组问题"的模式
- 学会 cacheSignal 在 RSC 中的资源清理实践
- 能用 Performance Tracks 诊断渲染性能问题
- 了解 React 19.2 的 ESLint v6 新规则如何为 React Compiler 准备代码

## 下一步

- [Offscreen / Activity](/06-concurrent-features/05-offscreen) — Activity 的内部实现
- [React 19 新 Hooks](/04-hooks-internals/08-react19-hooks) — useEffectEvent 的源码分析
- [Profiler 与 Performance Tracks](/11-devtools/03-devtools-profiler-panel) — Performance Tracks 的完整使用指南

## 安全提示

> [React 19.2 Upgrade Guide (MakerKit)](https://makerkit.dev/blog/tutorials/react-19-2) 详细记录了 2025 年 12 月披露的 CVE-2025-55182（React2Shell）漏洞。
> 如果你使用 React Server Components 且版本为 19.0.0–19.2.2，需要立即升级到 19.2.3。此漏洞是 RCE（远程代码执行），影响 `react-server-dom-webpack` 等包。Next.js 用户需升级到特定 Next.js 版本。

## 参考资料

- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — ★ 官方公告
- [What's New in React 19.2 (certificates.dev)](https://certificates.dev/blog/whats-new-in-react-192) — ★ 实战指南
- [React 19.2: Upgrade Guide (MakerKit)](https://makerkit.dev/blog/tutorials/react-19-2) — ★ 升级指南，含 CVE 安全补丁
- [React 19.2 Deep Dive (DEV Community)](https://dev.to/taronvardanyan/react-192-deep-dive-into-activity-and-useeffectevent-1f1g) — Activity + useEffectEvent 深入
- [React 19.2 A Complete Breakdown (Medium)](https://medium.com/@gurukishore111/react-19-2-a-complete-breakdown-of-new-features-with-examples-5062f247ae92) — 代码示例
- [React Performance Tracks (官方)](https://react.dev/reference/dev-tools/react-performance-tracks) — Performance Tracks 文档
- [React Activity 官方文档](https://react.dev/reference/react/Activity) — Activity API 文档
- [React useEffectEvent 官方文档](https://react.dev/reference/react/useEffectEvent) — useEffectEvent API 文档
- [React cacheSignal 官方文档](https://react.dev/reference/react/cacheSignal) — cacheSignal API 文档
- [Separating Events from Effects (官方)](https://react.dev/learn/separating-events-from-effects) — effect event 设计哲学
- [eslint-plugin-react-hooks v6 changelog](https://github.com/facebook/react/blob/eafeac097b/packages/eslint-plugin-react-hooks/CHANGELOG.md) — ESLint 规则
