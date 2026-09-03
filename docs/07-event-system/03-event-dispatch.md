---
title: "事件派发流程"
---



> 对应源码：`packages/react-dom-bindings/src/events/`（含 [ReactDOMEventListener.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/events/ReactDOMEventListener.js)、[DOMPluginEventSystem.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/events/DOMPluginEventSystem.js) 等事件派发核心文件）

## 1. 完整的事件派发链路

> [Getting to know React DOM's event handling system](https://the-guild.dev/blog/react-dom-event-handling-system) 对完整的事件派发流程有图文并茂的解析。

```
用户在 DOM 上操作
浏览器触发原生事件
根容器上的事件监听器触发 dispatchEvent
extractEvents → 合成事件创建（插件系统）
accumulateSinglePhaseListeners → 从 target 向上遍历收集 listener
processDispatchQueue → 按顺序执行 listener
listener 执行 → 可能调用 setState → 触发更新
```

## 2. 事件注册

React 在 `createRoot` 时在根容器上注册事件监听器（参见 [DOMPluginEventSystem.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/events/DOMPluginEventSystem.js) 中的事件注册逻辑）：

```javascript
// 简化自 DOMPluginEventSystem.js:432-459
function listenToAllSupportedEvents(rootContainer) {
  allNativeEvents.forEach(domEventName => {
    // selectionchange 不冒泡，挂在 document 上
    if (domEventName !== 'selectionchange') {
      if (!nonDelegatedEvents.has(domEventName)) {
        // 非 nonDelegated 事件注册冒泡阶段
        listenToNativeEvent(domEventName, false, rootContainer);
      }
      // 所有事件都注册捕获阶段
      listenToNativeEvent(domEventName, true, rootContainer);
    }
  });
  // selectionchange 挂在 ownerDocument 上（不冒泡）
  if (ownerDocument !== null) {
    listenToNativeEvent('selectionchange', false, ownerDocument);
  }
}
```

## 3. 完整执行顺序

> [Events in React (Trabe)](https://medium.com/trabe/events-in-react-what-do-they-do-do-they-do-things-lets-find-out-9f1ac743b4c7) 逐步分析了事件从触发到回调执行的完整时序。

```
一次 click 事件的处理：

T=0: 用户点击 <button>
T=0: 浏览器触发 native click 事件
T=0: 冒泡到根容器 → dispatchEvent 被调用
T=0: 创建合成 SyntheticEvent
T=0: 从 button 向上遍历 Fiber 树，收集所有 onClick handler
T=0: 执行 capture 阶段 handlers（从外到内）
T=0: 执行 bubble 阶段 handlers（从内到外）
     → handler 中可能调用 setState
     → setState 创建 Update，分配 SyncLane
T=0: 所有 handler 执行完毕
T=0: scheduleUpdateOnFiber(SyncLane)
T=0: 同步渲染开始（workLoopSync）
T~5: 渲染完成，DOM 更新
T~5: 用户看到 UI 变化

整个过程同步完成，用户感知不到延迟。
```

## 下一步

- [合成事件系统](/07-event-system/01-synthetic-events) — 合成事件的工作原理
- [事件优先级](/07-event-system/02-event-priorities) — 事件优先级
- [ReactDOM 渲染流程](/08-renderer/01-dom-renderer) — DOM 渲染的完整流程

## 参考资料

- [Getting to know React DOM's event handling system (Eytan Manor)](https://the-guild.dev/blog/react-dom-event-handling-system)
- [The React and React Native Event System Explained](https://levelup.gitconnected.com/how-exactly-does-react-handles-events-71e8b5e359f2)
