---
title: "合成事件系统"
---



> 对应源码：`packages/react-dom-bindings/src/events/`（含 [ReactDOMEventListener.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/events/ReactDOMEventListener.js) 等多个事件处理文件）

## 1. 事件委托

React 不在每个 DOM 元素上添加事件监听器。它在根容器（或 document）上注册一个统一的监听器，通过事件冒泡/捕获来收集和派发事件。[Events in React (Trabe)](https://medium.com/trabe/events-in-react-what-do-they-do-do-they-do-things-lets-find-out-9f1ac743b4c7) 对这一机制有深入分析。

```jsx
// 你写的：
<div onClick={handleClick}>
  <button>Click</button>
</div>

// React 实际做的（伪代码）：
// 不在 div 和 button 上 addEventListener
// 只在 root 容器上注册 click 监听器
rootContainer.addEventListener('click', dispatchEvent);
// 当用户点击 button 时：
// 1. 浏览器冒泡 click 事件到 rootContainer
// 2. React 的 dispatchEvent 被触发
// 3. React 从 event.target 遍历到 root，收集所有 onClick handler
// 4. 按顺序执行（capture 阶段从外到内，bubble 阶段从内到外）
```

## 2. 事件优先级

不同 DOM 事件有不同优先级（详见 [ReactDOMEventListener.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/events/ReactDOMEventListener.js) 的 `getEventPriority` 函数）：

```
DiscreteEventPriority（最高）:
  click, keydown, keyup, change, input, submit
  → SyncLane（事件级，通过 setCurrentUpdatePriority 设置）
  → Scheduler: UserBlockingSchedulerPriority

ContinuousEventPriority:
  mousemove, wheel, drag, touchmove, pointermove
  → InputContinuousLane
  → Scheduler: UserBlockingSchedulerPriority

DefaultEventPriority:
  其他所有事件
  → DefaultLane
  → Scheduler: NormalSchedulerPriority
```

注意：Scheduler 原有 `ImmediateSchedulerPriority`，但 React 已不再使用——源码注释（`ReactFiberRootScheduler.js:482-484`）：
> "Scheduler does have an 'ImmediatePriority', but now that we use microtasks for sync work we no longer use that."

Discrete 和 Continuous 事件在 Scheduler 层都映射为 `UserBlockingSchedulerPriority`。真正的同步执行不经过 Scheduler，而是通过 Lane 优先级直接在 `performSyncWorkOnRoot` 中执行。

事件优先级在事件派发时通过 `setCurrentUpdatePriority` 设置，之后 handler 中调用的 `scheduleUpdateOnFiber` 会读取该值决定 Lane。

## 3. 合成事件的创建

```javascript
// 简化的事件派发流程
function dispatchEvent(domEvent) {
  // 1. 从原生事件创建合成事件
  const syntheticEvent = createSyntheticEvent(domEvent);

  // 2. 从 event.target 向上遍历到 root
  //    收集所有注册了对应类型 handler 的 Fiber
  const dispatchListeners = [];
  let instance = getClosestInstanceFromNode(domEvent.target);
  while (instance !== null) {
    const listener = getListener(instance, 'onClick');
    if (listener) {
      dispatchListeners.push({ instance, listener });
    }
    instance = instance.parent;
  }

  // 3. 执行 capture 阶段（从外到内）
  for (let i = dispatchListeners.length - 1; i >= 0; i--) {
    dispatchListeners[i].listener.call(dispatchListeners[i].instance, syntheticEvent);
  }

  // 4. 执行 bubble 阶段（从内到外）
  for (let i = 0; i < dispatchListeners.length; i++) {
    if (syntheticEvent.isPropagationStopped) break;
    dispatchListeners[i].listener.call(dispatchListeners[i].instance, syntheticEvent);
  }
}
```

## 4. React 17+ 的变化

> [Getting to know React DOM's event handling system](https://the-guild.dev/blog/react-dom-event-handling-system) 详细记录了从 React 16 到 17 事件系统架构的变迁。

```
React 16:
  事件监听器在 document 上注册
  → 所有 React 根共享同一个 document

React 17+:
  事件监听器在 root container 上注册
  → 每个 createRoot 的容器独立
  → 更好的微前端隔离
  → 避免与 document 上其他库冲突
```

## 下一步

- [事件优先级](/07-event-system/02-event-priorities) — 事件优先级
- [事件派发](/07-event-system/03-event-dispatch) — 事件派发流程
- [Commit 阶段](/03-work-loop/05-commit-phase) — 事件处理如何映射到 Commit 阶段

## 参考资料

- [Events in React: What Do They Do? (Trabe)](https://medium.com/trabe/events-in-react-what-do-they-do-do-they-do-things-lets-find-out-9f1ac743b4c7)
- [Getting to know React DOM's event handling system (Eytan Manor)](https://the-guild.dev/blog/react-dom-event-handling-system)
- [React 官方文档 - SyntheticEvent](https://react.dev/learn/responding-to-events)
