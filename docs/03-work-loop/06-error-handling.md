---
title: "错误边界与恢复机制"
---



> 对应源码：[`packages/react-reconciler/src/ReactFiberThrow.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js), `ReactFiberUnwindWork.js`, `ReactCapturedValue.js`

## 1. 错误处理的挑战

在同步渲染中，错误处理很简单——try/catch 就行。但 Fiber 的并发渲染引入了复杂性。[Inside Fiber (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) 详细描述了这种复杂性的来源。

```
错误可能在 performUnitOfWork 中抛出
  → workInProgress 树可能只构建了一半
  → Fiber 链表可能处于不一致状态
  → Context 栈可能未正确 pop
  → hooks 链表可能未完全处理

这种状态下不能简单地 try/catch 继续——需要"回退"到一致状态。这就是 [React 技术揭秘 - 异步可中断更新](https://react.iamkasong.com/concurrent/interrupt.html) 中描述的 unwind 机制的核心动机。
```

## 2. 两种错误类型

```
错误类型            触发示例                          处理方式
─────────────────────────────────────────────────────────────────────
Render 错误         undefined.map() 或               unwind → 找到 Error Boundary →
(Error)             throw new Error()                渲染 fallback UI

Suspense 挂起        数据未加载完成 throw promise      unwind → 找到 Suspense Boundary →
(Promise)                                           渲染 fallback UI
                                                    等待 promise resolve 后重试
```

## 3. 错误捕获流程

```
正常渲染流程：
  beginWork(App) → beginWork(Parent) → beginWork(ErrorBoundary)
  → beginWork(Child) → 抛出错误！

performUnitOfWork 捕获错误：
  → throwException(fiber, error)
  → 标记出错 Fiber 的祖先链为 ShouldCapture
  → 标记 Incomplete flag

unwind 流程（completeUnitOfWork 中检测到 Incomplete）：
  completeUnitOfWork(ErrorBoundary)
  → flags 有 Incomplete
  → unwindUnitOfWork(ErrorBoundary)
  → unwindWork(current, ErrorBoundary)
  → ErrorBoundary 有 ShouldCapture 标记
  → 是 error boundary！
  → 清除 ShouldCapture，设置 DidCapture
  → 返回新的 Fiber（用 fallback 重新渲染）

恢复流程：
  workInProgress = newFiber（重新从 ErrorBoundary 开始）
  → beginWork(ErrorBoundary)
  → 检测到 DidCapture
  → 调用 getDerivedStateFromError 计算新 state
  → 渲染 fallback UI
  → 正常完成
```

## 4. throwException：标记祖先链

```javascript
// packages/react-reconciler/src/ReactFiberThrow.js（简化）

function throwException(root, returnFiber, sourceFiber, value, rootRenderLanes) {
  // sourceFiber 是出错的 Fiber
  // value 是抛出的值（Error 或 Promise/Thenable）

  sourceFiber.flags |= Incomplete;

  // Promise/Thenable 处理（Suspense 路径完全独立于错误路径）
  if (value !== null && typeof value === 'object' && typeof value.then === 'function') {
    // 这是 Suspense！通过 getSuspenseHandler() 从 Context 栈获取最近的 Suspense 边界
    const suspenseBoundary = getSuspenseHandler();
    if (suspenseBoundary !== null) {
      // 标记 Suspense 边界 should capture
      markSuspenseBoundaryShouldCapture(
        suspenseBoundary, returnFiber, sourceFiber, root, rootRenderLanes
      );
      // 注册 wakeable 的 ping listener（promise resolve 后重试）
      attachPingListener(root, wakeable, rootRenderLanes);
      return false;
    }
    // 没有 Suspense 边界 → 当作错误处理
  }

  // 错误路径：向上遍历祖先链，找到 Error Boundary
  const errorInfo = createCapturedValueAtFiber(value, sourceFiber);
  let workInProgress = returnFiber;
  do {
    switch (workInProgress.tag) {
      case ClassComponent: {
        const ctor = workInProgress.type;
        const instance = workInProgress.stateNode;
        // 检查是否是 Error Boundary：
        // 1. 还没捕获过错误（DidCapture flag 未设置）
        // 2. 有 getDerivedStateFromError 或 componentDidCatch
        if (
          (workInProgress.flags & DidCapture) === NoFlags &&
          (typeof ctor.getDerivedStateFromError === 'function' ||
            (instance !== null &&
             typeof instance.componentDidCatch === 'function' &&
             !isAlreadyFailedLegacyErrorBoundary(instance)))
        ) {
          workInProgress.flags |= ShouldCapture;
          const lane = pickArbitraryLane(rootRenderLanes);
          workInProgress.lanes = mergeLanes(workInProgress.lanes, lane);
          // 创建错误更新并入队
          const update = createClassErrorUpdate(lane);
          initializeClassErrorUpdate(update, root, workInProgress, errorInfo);
          enqueueCapturedUpdate(workInProgress, update);
          return false; // 找到了 Error Boundary，停止向上遍历
        }
        break;
      }
      case HostRoot: {
        // 根节点也能捕获错误（作为最后的 fallback）
        workInProgress.flags |= ShouldCapture;
        const lane = pickArbitraryLane(rootRenderLanes);
        workInProgress.lanes = mergeLanes(workInProgress.lanes, lane);
        const update = createRootErrorUpdate(workInProgress.stateNode, errorInfo, lane);
        enqueueCapturedUpdate(workInProgress, update);
        return false;
      }
    }
    workInProgress = workInProgress.return;
  } while (workInProgress !== null);

  // 没有 Error Boundary → 全局未捕获错误
  return true;
}
```

## 5. unwindUnitOfWork：回退到边界

```javascript
// packages/react-reconciler/src/ReactFiberWorkLoop.js:3433（简化）

function unwindUnitOfWork(unitOfWork, skipSiblings) {
  let incompleteWork = unitOfWork;
  do {
    const current = incompleteWork.alternate;

    // 调用 unwindWork 而不是 completeWork
    const next = unwindWork(current, incompleteWork, entangledRenderLanes);

    if (next !== null) {
      // 找到了能处理错误的边界！
      // 清除非 HostEffect 的标记
      next.flags &= HostEffectMask;
      workInProgress = next;
      return; // 回到 workLoop 从边界重新开始
    }

    // 这个 Fiber 不能处理错误 → 继续向上
    const sibling = skipSiblings ? null : incompleteWork.sibling;
    if (sibling !== null) {
      workInProgress = sibling;
      return; // 处理兄弟节点（Suspense 允许继续渲染兄弟）
    }

    incompleteWork = incompleteWork.return;
    workInProgress = incompleteWork;
  } while (incompleteWork !== null);
}
```

## 6. Error Boundary 的 flag 流转

```
正常渲染时 ErrorBoundary 的 flags 变化：

  第一次渲染（出了错）:
    1. throwException 标记 ShouldCapture
       flags = ShouldCapture | Incomplete

    2. unwindUnitOfWork 找到这个边界
       → 清除非 HostEffect 标记（包括 Incomplete）
       → 设置 DidCapture
       flags = DidCapture

    3. 重新 beginWork(ErrorBoundary)
       → 检测到 DidCapture
       → 调用 getDerivedStateFromError(error)
       → 更新 state
       → render() 返回 fallback UI
       → 正常完成

  后续渲染（无错误）:
    beginWork(ErrorBoundary)
      → 检测到 alternate.flags 有 DidCapture
      → 但本次没有新错误
      → 清除 DidCapture
      → 状态恢复正常
      → render() 返回正常 UI（除非 state 仍标记为错误）
```

## 7. Suspense 的错误处理

Suspense 处理的是"Promise 挂起"，而不是真正的 Error：

```
组件中 throw 一个 Promise:
  const [data, setData] = useState(null);
  if (data === null) {
    throw fetchData(); // throw 一个 Promise
  }
  return <div>{data}</div>;

React 处理：
  1. throwException 检测到 value 是 Promise（或 Thenable）
  2. 标记祖先 Suspense 边界为 ShouldCapture
  3. unwind 到 Suspense
  4. Suspense 渲染 fallback
  5. 注册 Promise.then()
  6. Promise resolve 后 → pingSuspendedRoot()
  7. 重新调度渲染（RetryLane）
  8. 再次渲染时数据已就绪 → 正常完成
```

## 8. 完整的 Error Boundary 示例

```jsx
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // React 在重新渲染前调用
    // 更新 state 让 render 返回 fallback
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // React 在 commit 阶段调用
    // 可以记录错误日志
    logError(error, info);
  }

  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong.</h1>;
    }
    return this.props.children;
  }
}
```

内在流程：

```
<ErrorBoundary>
  <BuggyComponent />  ← render 时 throw Error
</ErrorBoundary>

1. beginWork(BuggyComponent) → 执行函数体 → throw Error
2. performUnitOfWork catch 错误 → throwException()
3. 向上标记：
   BuggyComponent: flags |= Incomplete
   ErrorBoundary:  flags |= ShouldCapture
   创建 ClassErrorUpdate（含 getDerivedStateFromError）

4. completeUnitOfWork(BuggyComponent)
   → 检测到 Incomplete → unwindUnitOfWork
   → BuggyComponent 不能处理（不是 boundary）→ 向上
   → ErrorBoundary 有 ShouldCapture → 匹配！

5. unwindWork(ErrorBoundary)
   → 清除 ShouldCapture → 设置 DidCapture
   → 返回 ErrorBoundary 重新渲染

6. beginWork(ErrorBoundary)
   → 检测到 DidCapture
   → 处理 updateQueue → 调用 getDerivedStateFromError(error)
   → state.hasError = true
   → render() 返回 <h1>Something went wrong.</h1>

7. 正常完成渲染 → Commit
8. Commit layout 阶段 → 调用 componentDidCatch(error, info)
```

## 9. 函数组件不能作为 Error Boundary

目前只有类组件可以作为 [Error Boundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)（需要 `getDerivedStateFromError` 和/或 `componentDidCatch`）。函数组件没有等价的能力。这是因为在错误恢复时，React 需要一个"持久化"的 state 来记住错误状态，而函数组件的 state 机制在错误边界场景下不够灵活。

## 下一步

- [Hooks 的 Mount 与 Update 机制](/04-hooks-internals/01-hooks-mount-update) — 了解 Hooks 如何在 render 中工作
- [Suspense 机制](/06-concurrent-features/02-suspense) — Suspense 的完整机制
- [ReactDOM 渲染流程](/08-renderer/01-dom-renderer) — DOM 操作的底层实现

## 参考资料

- [Error Boundaries (React 官方文档)](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [React 技术揭秘 - 异步可中断更新 (卡颂)](https://react.iamkasong.com/concurrent/interrupt.html)
- [Inside Fiber (Max Koretskyi) - Error handling](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/)
- [React 源码 ReactFiberThrow.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js)
