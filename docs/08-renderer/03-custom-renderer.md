---
title: "自定义渲染器"
---



> 对应源码：[`packages/react-reconciler/src/ReactFiberConfig.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberConfig.js), [`packages/react-noop-renderer/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-noop-renderer)

## 1. Reconciler 的平台无关设计

[`react-reconciler`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/README.md) 不直接操作 DOM——它通过 **HostConfig** 与平台交互。任何实现了 HostConfig 的渲染器都可以使用 React 的 Reconciler。

```
Reconciler 需要 HostConfig 提供的方法：

实例管理：
  createInstance(type, props)          → 创建节点
  createTextInstance(text)             → 创建文本节点
  appendInitialChild(parent, child)    → 追加子节点
  appendChild(parent, child)
  insertBefore(parent, child, before)
  removeChild(parent, child)

更新：
  commitUpdate(instance, type, oldProps, newProps) → 更新属性（含 diff）
  commitTextUpdate(textInstance, oldText, newText) → 更新文本

辅助：
  getRootHostContext(rootContainer)
  getChildHostContext(parentContext, type)
  shouldSetTextContent(type, props)
  resetTextContent(instance)
  finalizeInitialChildren(instance, type, props)
  supportsMutation / supportsPersistence

可选：
  hydrateInstance / hydrateTextInstance  ← SSR 水合
  commitMount / commitTextUpdate
  scheduleTimeout / cancelTimeout
  noTimeout
  ...
```

## 2. 创建自定义渲染器

```javascript
import {Reconciler} from 'react-reconciler';

// 参考 Rodrigo Pombo 的 [Build your own React](https://pomb.us/build-your-own-react/) 了解渲染器实现思路

const HostConfig = {
  createInstance(type, props) {
    // 你的目标平台创建节点逻辑
    return { type, props, children: [] };
  },
  appendInitialChild(parent, child) {
    parent.children.push(child);
  },
  createTextInstance(text) {
    return { type: 'text', text, children: [] };
  },
  // ... 其他必需方法
};

const reconciler = Reconciler(HostConfig);

// 创建根
function createRoot(container) {
  const root = reconciler.createContainer(
    container,                    // containerInfo
    ConcurrentRoot,                // tag
    null,                          // hydrationCallbacks
    false,                         // isStrictMode
    false,                         // concurrentUpdatesByDefaultOverride (已忽略)
    '',                            // identifierPrefix
    (error) => console.error(error), // onUncaughtError
    (error) => console.error(error), // onCaughtError
    (error) => console.error(error), // onRecoverableError
    () => {},                      // onDefaultTransitionIndicator
    null,                          // transitionCallbacks
  );
  return {
    render(children) {
      reconciler.updateContainer(children, root, null, () => {});
    }
  };
}
```

## 3. 已有的自定义渲染器

```
react-dom           → DOM HostConfig
react-art            → SVG/Canvas HostConfig
react-native-renderer → Native View HostConfig
react-test-renderer  → Mock HostConfig（不产生真实输出）
[react-noop-renderer](https://github.com/facebook/react/tree/eafeac097b/packages/react-noop-renderer)  → 空操作（Reconciler 自测用）
react-three-fiber    → Three.js HostConfig（社区）
ink                  → Terminal HostConfig（社区）
```

## 下一步

- [选择性水合](/08-renderer/04-selective-hydration) — 选择性水合
- [完整水合生命周期](/08-renderer/05-hydration-complete) — 完整水合生命周期
- [ReactDOM 渲染流程](/08-renderer/01-dom-renderer) — ReactDOM 渲染流程

## 参考资料

- [Build your own React (Rodrigo Pombo)](https://pomb.us/build-your-own-react/)
- [React 源码 react-noop-renderer](https://github.com/facebook/react/tree/eafeac097b/packages/react-noop-renderer)
- [Custom Renderers (React 官方)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/README.md)
