---
title: "事件优先级与调度"
---



> 对应源码：[ReactDOMEventListener.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/events/ReactDOMEventListener.js)（`getEventPriority` 函数），[ReactEventPriorities.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactEventPriorities.js)（优先级常量定义）

## 1. 事件到优先级的映射

> [What are Lanes in React? (JSer.dev)](https://jser.dev/react/2022/03/26/lanes-in-react/) 详细解释了事件优先级如何映射到 Lane 模型。

```javascript
// packages/react-dom-bindings/src/events/ReactDOMEventListener.js
// getEventPriority 函数（简化）

import {
  DiscreteEventPriority,    // = SyncLane
  ContinuousEventPriority,   // = InputContinuousLane
  DefaultEventPriority,     // = DefaultLane
} from 'react-reconciler/src/ReactEventPriorities';

function getEventPriority(domEventName) {
  switch (domEventName) {
    // Discrete（离散事件）— 最高优先级（部分列表）
    case 'click':
    case 'keydown':
    case 'keyup':
    case 'change':
    case 'input':
    case 'submit':
    case 'dragstart':    // 注意：dragstart 和 dragend 是 Discrete
    case 'dragend':
    case 'drop':
    // ... 更多
      return DiscreteEventPriority;   // = SyncLane

    // Continuous（连续事件）— 较低优先级（部分列表）
    case 'mousemove':
    case 'wheel':
    case 'drag':         // 注意：drag 是 Continuous，但 dragstart/dragend 是 Discrete
    case 'touchmove':
    case 'pointermove':
    case 'scroll':
    case 'resize':
    // ... 更多
      return ContinuousEventPriority; // = InputContinuousLane

    // 其他所有事件
    default:
      return DefaultEventPriority;     // = DefaultLane
  }
}
```

## 2. 事件触发更新的调度链路

```
用户点击 button
dispatchEvent(click)
获取事件优先级 → DiscreteEventPriority
dispatchDiscreteEvent
执行 onClick handler
handler 内部调用 setState
dispatchSetState → requestUpdateLane
当前 event priority = DiscreteEventPriority
Lane = SyncLane（同步更新！）
```

> Lane 的定义和优先级换算逻辑详见 [ReactFiberLane.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js)。

```
scheduleUpdateOnFiber(fiber, SyncLane)
同步渲染（workLoopSync，不可中断）
```

离散事件（如 click）触发的更新是**同步**的，这意味着用户点击后 UI 会立即更新——没有延迟感。

## 3.Portal 与事件传播

React [Portal](https://react.dev/reference/react-dom/createPortal) 的事件不是通过 DOM 冒泡传播的——而是通过 Fiber 树传播。

```jsx
// DOM 结构:               React 组件树:
// <div id="root">         <App>
//   <div id="modal">        <Parent>
//     <button/>               <Portal target="#modal">
//                               <Child>
//                                 <button/>
//
// button 的 onClick 冒泡：
// DOM: button → #modal → #root
// React: button → Child → Portal → Parent → App
```

React 事件系统沿着 Fiber 树遍历（而非 DOM 树），确保 Portal 内的事件能传播到 React 组件树的祖先。

## 下一步

- [事件派发](/07-event-system/03-event-dispatch) — 事件派发流程
- [合成事件系统](/07-event-system/01-synthetic-events) — 合成事件的工作原理
- [优先级体系](/05-scheduler/04-priority-levels) — 优先级与 Lane 的映射

## 参考资料

- [What are Lanes in React? (JSer.dev)](https://jser.dev/react/2022/03/26/lanes-in-react/) — 事件优先级到 Lane 的映射
- [React Portal 事件传播 (官方)](https://react.dev/reference/react-dom/createPortal)
