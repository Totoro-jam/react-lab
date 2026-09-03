---
title: "Profiler 计时器"
---


> 对应源码：[`packages/react-reconciler/src/ReactProfilerTimer.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactProfilerTimer.js), [`packages/react-reconciler/src/ReactFiberBeginWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js)

## two numbers, one question

你在 DevTools Profiler 里看到一个组件渲染耗时 4.8ms。另一个数字 `baseDuration` 显示 23.7ms。

```
actualDuration:  4.8ms  → 这次更新实际花了多久
baseDuration:   23.7ms  → 如果没有 memo 化，估计要花多久
```

差距越大，说明你的 `memo`/`useMemo`/`shouldComponentUpdate` 越有效。

## 计时发生在哪里

```
beginWork(fiber)                    ← 开始计时
  → renderWithHooks()               ← 执行组件函数
  → reconcileChildren()             ← Diff 子节点
  → ...
completeWork(fiber)                 ← 停止计时，计算 actualDuration
```

```javascript
// ReactProfilerTimer.js（简化）

// 全局变量：当前正在计时的开始时间
let profilerStartTime = -1.1;  // 源码：ReactProfilerTimer.js:61

// beginWork 中调用（performUnitOfWork → beginWork 之前）
function startProfilerTimer(fiber) {
  profilerStartTime = now();  // 记录开始时间到全局变量
  if (fiber.actualStartTime < 0) {
    fiber.actualStartTime = profilerStartTime;  // 首次记录实际开始时间
  }
}

// completeWork 中调用
function stopProfilerTimerIfRunningAndRecordDuration(fiber) {
  if (profilerStartTime >= 0) {
    const elapsedTime = now() - profilerStartTime;
    fiber.actualDuration += elapsedTime;  // ← 累加（不是替换！多次完全/不完全渲染都会累加）
    fiber.selfBaseDuration = elapsedTime;  // ← 自身耗时（不含子节点）
    profilerStartTime = -1;  // 停止计时
  }
}
```

注意：`actualDuration` 是**累加**的（`+=`），因为并发模式下一个 Fiber 可能在同一次渲染中被多次 beginWork/completeWork（如 Suspense 挂起后恢复）。`selfBaseDuration` 是本次 completeWork 的自身耗时，`treeBaseDuration`（即 baseDuration）在 `bubbleProperties` 中由子节点的 `selfBaseDuration` 累加得到。

### 时间如何在 Fiber 树中冒泡

```
<App>           actualDuration = 5ms (自身 2ms + 子节点 3ms)
  <Header>      actualDuration = 0ms (被 memo 跳过)
  <Content>     actualDuration = 3ms (自身 1ms + 子节点 2ms)
    <List>      actualDuration = 2ms (自身 2ms)
```

`actualDuration` 包含**自身 + 后代**的渲染时间。`baseDuration` 是所有子组件各自 `baseDuration` 的总和——如果 `shouldComponentUpdate` 跳过了，它的 `baseDuration` 不会更新（保持上次的值）。

## `<Profiler>` 组件如何触发

```jsx
<Profiler id="Navigation" onRender={callback}>
  <Navigation />
</Profiler>
```

`<Profiler>` 在 Fiber 树中创建一个特殊的标记节点。计时启动发生在 `performUnitOfWork` 中：

```javascript
// ReactFiberWorkLoop.js:3089 附近（简化）

function performUnitOfWork(unitOfWork) {
  // ...

  // 检查是否在 ProfileMode 下
  if (enableProfilerTimer && (unitOfWork.mode & ProfileMode) !== NoMode) {
    startProfilerTimer(unitOfWork);  // ← 记录开始时间
  }

  // ... 执行 beginWork（组件渲染）

  return next;  // 返回下一个工作单元
}
```

### onRender 回调

```javascript
function onRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  // id:           "Navigation"——你设置的 id
  // phase:        "mount" | "update" | "nested-update"
  // actualDuration: 本次更新实际耗时
  // baseDuration:   无优化估计耗时
  // startTime:     开始渲染的时间戳
  // commitTime:    commit 的时间戳（所有 Profiler 共享同一个值）
}
```

> [Brian Vaughn 的 Profiler 笔记](https://gist.github.com/bvaughn/60a883af01716a03a1b3285a1029be0c)（React DevTools 作者）详细解释了每个指标的语义。

## 并发模式下的计时特殊性

```
用户交互 → 高优先级更新 → 渲染开始 → yield（让出主线程）
                                    → 5ms 后继续
                                    → yield
                                    → 继续 → 渲染完成 → commit

actualDuration 只包含实际工作的时间：
  yield 期间的时间不算
  Suspense 挂起期间的时间不算
  被中断的渲染时间不算
```

这意味着 `actualDuration` 可能远小于从 `startTime` 到 `commitTime` 的总时间——中间可能有多次 yield。

## React 19.2 Performance Tracks

> [React 19.2 博文](https://react.dev/blog/2025/10/01/react-19-2)介绍了新的 Performance Tracks。

React 19.2 在 Chrome DevTools 性能面板中新增了两条自定义轨道：

```
Scheduler ⚛ 轨道：
  显示不同优先级的工作（blocking、transition）
  包含：调度更新的事件、渲染开始/结束、被阻塞等待的时间

Components ⚛ 轨道：
  显示组件树的渲染和 effect 执行
  包含："Mount"（挂载）、"Blocked"（被阻塞 yield）
  帮助理解组件何时渲染和执行 effect
```

## 性能开销

ProfileMode 只在 DEV 或特殊 profiling build 中启用。Production build 默认不包含 Profiler 计时代码——`enableProfilerTimer` feature flag 为 false。

如需生产环境 profiling，需要使用 `scheduler/tracing` 的 special profiling build。

## 下一步

- [工作循环全景](/03-work-loop/01-work-loop-overview) — Work Loop 中的 yield 如何影响计时
- [Fast Refresh](/12-internal-mechanisms/01-fast-refresh) — Fast Refresh 如何与 Profiler 交互
- [DevTools 桥梁原理](/11-devtools/01-devtools-bridge) — DevTools 如何消费 Profiler 数据

## 参考资料

- [React 源码 ReactProfilerTimer.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactProfilerTimer.js) — Profiler 计时实现
- [React 源码 ReactFiberBeginWork.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js) — beginWork 中的计时调用
- [React Profiler API (官方文档)](https://react.dev/reference/react/Profiler) — `<Profiler>` 组件使用
- [React 16.5 Profiler Notes (Brian Vaughn)](https://gist.github.com/bvaughn/60a883af01716a03a1b3285a1029be0c) — ★ Profiler 作者的详细说明
- [React 19.2 博文 (官方)](https://react.dev/blog/2025/10/01/react-19-2) — Performance Tracks 新功能
- [Understanding React DevTools Profiler results (StackOverflow)](https://stackoverflow.com/questions/77872239/understanding-react-dev-tools-profiler-results) — Profiler 结果解读
- [Master React Profiler (dev.to)](https://dev.to/abhay_yt_52a8e72b213be229/master-react-profiler-optimize-your-apps-performance-1bcl) — Profiler 实战优化
- [React Profiler 旧文档](https://legacy.reactjs.org/docs/profiler.html) — onRender 参数说明
