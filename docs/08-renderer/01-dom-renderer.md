---
title: "ReactDOM 渲染流程"
---



> 对应源码：[`packages/react-dom/src/client/ReactDOMRoot.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom/src/client/ReactDOMRoot.js), [`packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js)

## 1. createRoot

```javascript
// packages/react-dom/src/client/ReactDOMRoot.js（简化）

function createRoot(container, options) {
  const root = createContainer(container, ConcurrentRoot, ...);
  return new ReactDOMRoot(root);
}

class ReactDOMRoot {
  constructor(internalRoot) {
    this._internalRoot = internalRoot;
  }

  render(children) {
    const root = this._internalRoot;
    updateContainer(children, root, null, null);
  }

  unmount() { /* ... */ }
}
```

`createContainer` 最终调用 Reconciler 的 `createFiberRoot`，创建 [FiberRoot](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberRoot.js) 对象。

## 2. HostConfig：Reconciler 与 DOM 的桥梁

ReactDOM 提供的 [HostConfig](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js) 包括：

```javascript
// packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js

const HostConfig = {
  // 创建实例
  createInstance(type, props) {
    return document.createElement(type);
  },

  // 创建文本节点
  createTextInstance(text) {
    return document.createTextNode(text);
  },

  // 追加子节点
  appendInitialChild(parent, child) {
    parent.appendChild(child);
  },

  // 插入
  insertBefore(parent, child, before) {
    parent.insertBefore(child, before);
  },

  // 删除
  removeChild(parent, child) {
    parent.removeChild(child);
  },

  // 提交属性更新（diff 在此处完成）
  commitUpdate(instance, type, oldProps, newProps) {
    updateProperties(instance, type, oldProps, newProps);
    updateFiberProps(instance, newProps);
  },

  // 提交文本更新
  commitTextUpdate(textInstance, oldText, newText) {
    textInstance.nodeValue = newText;
  },

  // ... 更多（createTextNode、appendChild、removeChild、insertBefore 等）
  // 注意：ref 的 attach/detach 不在 HostConfig 中，
  // 而是在 ReactFiberCommitWork.js 的 safelyAttachRef / safelyDetachRef 中处理
};
```

## 3. Commit 阶段的 DOM 操作

Reconciler 通过 HostConfig 间接操作 DOM，这种[平台无关的设计](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/README.md)使得同一套 Reconciler 可以适配不同的渲染目标：

```
commitPlacement(fiber)
  → HostConfig.appendChild 或 insertBefore

commitDeletionEffects(root, returnFiber, deletedFiber)
  → 递归调用删除子树中的 Host 节点
  → HostConfig.removeChild（最终删除 DOM 节点）

commitUpdate(fiber)
  → HostConfig.commitUpdate(instance, type, oldProps, newProps)
  → updateProperties: diff 新旧 props 并应用到 DOM
```

## 4. 初始渲染流程

```
createRoot(document.getElementById('root'))
  → createContainer(container, ConcurrentRoot, ...)
  → createFiberRoot()
  → 创建 FiberRoot 和 HostRoot Fiber

root.render(<App />)
  → updateContainer()
    → lane = requestUpdateLane(current)   // 不是硬编码 SyncLane
    → scheduleUpdateOnFiber(HostRoot, lane)
  → ConcurrentRoot 默认走 workLoopConcurrentByScheduler（除非 lane 为 SyncLane）
  → performUnitOfWork → beginWork(App) → beginWork(div) → ...
  → completeWork(div) → createInstance('div') → document.createElement('div')
  → appendAllChildren → div.appendChild(span)
  → commitRoot()
  → commitPlacement → root.appendChild(div)
  → 用户看到 UI
```

## 下一步

- [SSR 渲染（Fizz）](/08-renderer/02-ssr-fizz) — SSR 流式渲染
- [自定义渲染器](/08-renderer/03-custom-renderer) — 自定义渲染器
- [选择性水合](/08-renderer/04-selective-hydration) — 选择性水合

## 参考资料

- [React 源码 ReactFiberConfigDOM.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js)
- [Build your own React (Rodrigo Pombo)](https://pomb.us/build-your-own-react/) — 渲染器实现
