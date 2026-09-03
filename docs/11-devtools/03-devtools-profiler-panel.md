---
title: "DevTools Profiler 与 Performance Tracks"
---


> 对应源码：[`packages/react-reconciler/src/ReactProfilerTimer.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactProfilerTimer.js), [React 19.2 Performance Tracks 文档](https://react.dev/reference/dev-tools/react-performance-tracks)

## Profiler 两个面板

React DevTools 有两个性能分析面板：

```
Profiler 面板（DevTools 内置）：
  → 火焰图 (Flamegraph)
  → 排序图 (Ranked)
  → 组件渲染列表
  → "Why did this render?"（可选）

Timeline 面板（React 19.2+）：
  → 在浏览器 Performance 面板中显示 React 自定义轨道
  → Scheduler 轨道：Blocking / Transition / Suspense / Idle
  → Components 轨道：组件渲染和 effect 执行
  → Server 轨道：Server Components 和 Server Requests
```

## Profiler 面板：传统的 Render 分析

### 火焰图

火焰图的 X 轴是组件树层级（不是时间），Y 轴是渲染耗时：

```
       ┌──────── App (5ms) ──────────┐
       │                              │
  ┌──── Header (0ms) ────┐    ┌──── Main (3ms) ────┐
  │                       │    │                     │
  (bailout,                 ┌── List (2ms) ──┐      (bailout)
   props 未变)              │                 │
                           ┌─ Item (1ms) ─┐  ┌─ Item (1ms) ─┐
                           │               │  │               │
                           (render)        (render)          (render)
```

火焰图的关键规则：

- 子组件的宽度**包含在**父组件内
- bailout 的组件显示为 0ms
- `actualDuration` 包含后代渲染时间

### 排序图 (Ranked)

按渲染耗时从高到低排序——帮你快速找到最慢的组件：

```
1. Context.Consumer  4.8ms  ← 最慢
2. List              3.2ms
3. Item              1.5ms
4. Item              1.3ms
5. Header            0ms    ← bailout
```

### "Why did this render?"

开启"Record why each component rendered"后，点击组件可看到渲染原因：

```
Why did this render?
  • state updated (count: 0 → 1)
  • props changed (data)
```

## React 19.2 Performance Tracks

> [React 19.2 博文](https://react.dev/blog/2025/10/01/react-19-2)和[官方文档](https://react.dev/reference/dev-tools/react-performance-tracks)介绍了 Performance Tracks。

Performance Tracks 是 React 19.2 在浏览器 Performance 面板中新增的自定义轨道：

### Scheduler 轨道

```
Scheduler ⚛
  ├── Blocking    ← 同步更新（用户交互触发）
  ├── Transition  ← 非阻塞后台工作（startTransition）
  ├── Suspense    ← Suspense 边界相关
  └── Idle        ← 最低优先级工作
```

每个轨道显示：

- **Update**：什么导致了新的渲染
- **Render**：React 调用组件函数的阶段
- **Commit**：提交 DOM 变更 + layout effects
- **Remaining Effects**：passive effects（useEffect）

### Components 轨道

```
Components ⚛
  └── 火焰图式显示
       每个条 = 一个组件的渲染持续时间
       颜色深浅 = 渲染耗时长短
       包含 effect 执行时间
```

### Server 轨道（开发模式）

```
Server Requests ⚛
  └── 所有最终传入 React Server Component 的 Promise
       点击可查看创建 Promise 的堆栈和 resolve 的值

Server Components ⚛
  └── Server Component 渲染持续时间的火焰图
       "Primary" 轨道 + "Parallel" 轨道（并发渲染时）
```

## Profiler 计时与 Performance Tracks 的关系

```
DevTools Profiler 面板          Browser Performance 面板
──────────────────────          ──────────────────────
beginWork/completeWork 计时      Scheduler 轨道的 Render 阶段
actualDuration                   Components 轨道的火焰图宽度
commit 阶段耗时                  Scheduler 轨道的 Commit 阶段
useEffect 执行                   Remaining Effects 阶段

两者数据源相同（ReactProfilerTimer.js）
但展示方式不同：
  DevTools Profiler = 按组件分组
  Performance Tracks = 按时间线排列
```

## 级联更新检测

Performance Tracks 能可视化**级联更新**——渲染过程中调度新更新导致 React 丢弃已完成的工作：

```
Render pass 1:
  → 渲染组件 A
  → A 中调度了新更新（cascading update！）
  → React 丢弃已完成的工作
  → 从头开始 Render pass 2

Performance Tracks 中：
  点击 "Cascading update" 条目 → 显示哪个组件调度了新更新
  → 包含堆栈信息
```

## 实际使用建议

```
发现性能问题时的排查顺序：

1. Performance 面板 → React 19.2 Tracks
   → 查看 Scheduler 轨道：哪个优先级的工作最多？
   → 查看 Components 轨道：哪些组件渲染最久？
   → 检查是否有 Cascading updates

2. DevTools Profiler 面板
   → 录制 → 排序图找最慢组件
   → 火焰图看组件树结构
   → "Why did this render?" 查渲染原因

3. 检查是否有不必要的重渲染
   → 开启 "Highlight updates when components render"
   → 观察 DevTools 中高亮的组件
   → 如果 Compiler 已启用，检查是否真正被 memoized
```

## 下一步

- [DevTools 桥梁原理](/11-devtools/01-devtools-bridge) — DevTools 桥梁原理
- [Components 面板](/11-devtools/02-devtools-components-panel) — Components 面板内部机制
- [Profiler 计时器](/12-internal-mechanisms/02-profiler-timer) — Profiler 计时器的源码实现

## 参考资料

- [React Performance Tracks (官方文档)](https://react.dev/reference/dev-tools/react-performance-tracks) — ★ React 19.2 Tracks 完整说明
- [React 19.2 博文 (官方)](https://react.dev/blog/2025/10/01/react-19-2) — Performance Tracks 发布介绍
- [React DevTools CHANGELOG (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-devtools/CHANGELOG.md) — v4-v7 变更日志
- [React Profiler API (官方文档)](https://react.dev/reference/react/Profiler) — `<Profiler>` 组件 API
- [React 16.5 Profiler Notes (Brian Vaughn)](https://gist.github.com/bvaughn/60a883af01716a03a1b3285a1029be0c) — Profiler 作者的详细说明
- [Understanding React DevTools Profiler results (StackOverflow)](https://stackoverflow.com/questions/77872239/understanding-react-dev-tools-profiler-results) — Profiler 结果解读
- [Master React Profiler (dev.to)](https://dev.to/abhay_yt_52a8e72b213be229/master-react-profiler-optimize-your-apps-performance-1bcl) — Profiler 实战优化
- [React 源码 ReactProfilerTimer.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactProfilerTimer.js) — 计时实现源码
