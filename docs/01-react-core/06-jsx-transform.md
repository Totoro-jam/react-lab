---
title: "JSX Transform 内部机制"
---


> 对应源码：[`packages/react/src/jsx/`](https://github.com/facebook/react/tree/eafeac097b/packages/react/src/jsx), [`packages/react/src/jsx/ReactJSXElement.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/jsx/ReactJSXElement.js)

## 你写的 JSX 不是 JavaScript

```jsx
<div className="box">
  <span>Hello</span>
</div>
```

浏览器看不懂这个。它需要被编译成 JavaScript。

这个过程叫 **JSX Transform**——从"类 HTML 语法"到"JavaScript 对象"的转换。

## 两个时代：createElement 和 jsx-runtime

### 旧时代（React 16 及之前）：createElement

```jsx
// 你写的
<div className="box"><span>Hello</span></div>

// 编译后
React.createElement('div', { className: 'box' },
  React.createElement('span', null, 'Hello')
);
```

问题：每个用 JSX 的文件都需要 `import React`，因为编译产物引用了 `React.createElement`。

### 新时代（React 17+）：jsx-runtime

```jsx
// 你写的（不需要 import React）
<div className="box"><span>Hello</span></div>

// 编译后
import { jsx as _jsx } from 'react/jsx-runtime';

_jsx('div', {
  className: 'box',
  children: _jsx('span', { children: 'Hello' })
});
```

React 17 引入了新的 JSX Transform。编译器自动从 `react/jsx-runtime` 导入函数，不再需要手动 `import React`。

## 三个函数：jsx / jsxs / jsxDEV

```javascript
// packages/react/src/jsx/ReactJSX.js（别名导出）
export { jsx, jsxs, jsxDEV };

// packages/react/src/jsx/ReactJSXElement.js 中的实际函数名：
//   jsxProd、jsxProdSignatureRunningInDevWithDynamicChildren、
//   jsxProdSignatureRunningInDevWithStaticChildren、jsxDEV
// ReactJSX.js 将它们别名为 jsx / jsxs / jsxDEV 供外部使用
```

`jsx` 和 `jsxs` 的区分**只在开发模式中有意义**：

```
jsx: 子元素是动态的（如 .map() 生成的）
  → 开发模式下 React 需要额外的 key 校验

jsxs: 子元素是静态的（编译时已知数量）
  → 开发模式下使用不同的 key 校验路径

生产环境中：两者完全相同（jsxProd），无运行时差异。
```

`jsxDEV` 是开发模式专用的替代版本。当 Babel 编译开发构建时，所有 `jsx`/`jsxs` 调用被替换为 `jsxDEV`，签名比生产版本多一个 `isStaticChildren` 参数（区分静态/动态子元素，影响 key 校验路径）：

```javascript
// 生产签名：jsxProd(type, config, maybeKey)
// 开发签名：jsxDEV(type, config, maybeKey, isStaticChildren)

// jsxDEV 内部自动捕获调试信息（不需要编译器传入）：
//   debugStack = Error('react-stack-top-frame')  → 挂载到 element._debugStack
//   debugTask  = createTask(getTaskName(type))    → 挂载到 element._debugTask
```

注意：React 17/18 的旧版 `jsxDEV` 接受 `source`（文件位置）和 `self`（组件实例）参数，React 19 已移除这两个参数，改用内部自动捕获的 owner stack（`_debugStack`）和 debug task（`_debugTask`），配合 `captureOwnerStack` API 使用。

## ReactElement 对象的创建

无论 `createElement` 还是 `jsx`，最终都创建一个 ReactElement 对象：

```javascript
// packages/react/src/jsx/ReactJSXElement.js（简化）

const element = {
  $$typeof: REACT_ELEMENT_TYPE,  // Symbol(Symbol(react.element))
  type: 'div',                    // 标签名 或 组件函数
  key: null,                      // 列表 key
  ref: null,                      // ref 引用
  props: {                        // 属性 + children
    className: 'box',
    children: { /* 另一个 element */ }
  },
  // 开发模式额外字段（当前版本）
  _owner: null,                   // 创建者（用于 DevTools）
  _store: { validated: false },   // 验证标记
  _debugInfo: null,               // 调试信息（替代了旧的 _self/_source）
  _debugStack: undefined,         // 调试栈
  _debugTask: undefined,          // 调试任务
};

Object.freeze(element);           // 不可变！
```

### $$typeof 的安全意义

`$$typeof` 用 Symbol 而不是字符串——这是一个**安全设计**。Dan Abramov 在 [Why Do React Elements Have a $$typeof Property?](https://overreacted.io/why-do-react-elements-have-typeof-property/) 中解释：

```javascript
// 如果 $$typeof 是字符串 'react.element'
// 攻击者可以通过注入 JSON 来创建恶意 element：
// { "$$typeof": "react.element", "type": "img", "props": { "src": "x" } }

// 但 Symbol 不能通过 JSON 传输
// → 注入的 JSON 没有 $$typeof
// → React 拒绝渲染它
```

## createElement 的完整流程

```javascript
// packages/react/src/jsx/ReactJSXElement.js（简化）

export function createElement(type, config, children) {
  // 1. 提取 key（React 19 中 ref 不再单独提取——保留在 props 里）
  let key = null;
  if (config != null) {
    if (hasValidKey(config)) {
      key = '' + config.key;  // key 被转为字符串
    }
  }

  // 2. 处理 props（去掉 key、__self、__source，但保留 ref！）
  const props = {};
  if (config != null) {
    for (const propName in config) {
      if (propName !== 'key' &&
          propName !== '__self' && propName !== '__source') {
        props[propName] = config[propName];
      }
    }
  }

  // 3. 处理 children（用 arguments 而非 rest params，避免数组分配）
  const childrenLength = arguments.length - 2;
  if (childrenLength === 1) {
    props.children = children;
  } else if (childrenLength > 1) {
    const childArray = Array(childrenLength);
    for (let i = 0; i < childrenLength; i++) {
      childArray[i] = arguments[i + 2];
    }
    props.children = childArray;
  }

  // 4. 处理 defaultProps
  if (type && type.defaultProps) {
    for (const propName in type.defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = type.defaultProps[propName];
      }
    }
  }

  // 5. 创建 ReactElement
  // React 19 中 ref 继续保留在 props.ref，不再单独传
  return ReactElement(type, key, props, /* owner */);
}
```

## 新旧 transform 的对比

```
经典 transform（React 16 以下）          自动 runtime（React 17+）
─────────────────────────────────      ──────────────────────────
编译产物需要 import React                不需要 import React
  import React from 'react';            直接用 JSX
  React.createElement('div', {})       jsx('div', {})

使用 React.createElement                  使用 jsx() / _jsx()
  一个函数处理所有元素类型                编译器自动选择 runtime

key/ref 都混在 config（第二个参数）里    key 单独作为第三个参数
  createElement('div', {key, ref})       _jsx('div', {ref}, key)
  （React 19 起 ref 也保留在 props 中）

显示引入                                  自动引入（编译器添加）
  每个文件顶部都要 import React           编译器自动注入 import { jsx }
```

React 17 的[新版 JSX transform](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html) 让你不再需要在每个文件顶部 `import React`。TypeScript 4.1+ 和 Babel 7.9+ 开始支持 `"jsx": "react-jsx"` 配置。

## 配置方式

Babel 配置示例：

```json
{
  "presets": [
    ["@babel/preset-react", {
      "runtime": "automatic"
    }]
  ]
}
```

或者 TypeScript：

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx"
  }
}
```

`"react-jsx"` = 新 transform（automatic），`"react"` = 旧 transform（classic）。

## JSX → Element → Fiber 的完整链路

```
[编译]  JSX
    ↓
  _jsx('div', { className: 'box', children: ... })
    ↓
[运行时]  ReactElement 对象（不可变）
    {
      $$typeof: Symbol(react.element),
      type: 'div',
      props: { className: 'box', children: [...] },
    }
    ↓
[Reconciler]  Fiber 节点（可变的工作单元）
    {
      tag: 5,              // HostComponent
      type: 'div',
      pendingProps: { className: 'box', children: [...] },
    }
    ↓
[Commit]  真实 <div class="box">...</div>
```

每一步都是上一节的输入：

1. **JSX** → 编译后变成函数调用
2. **函数调用** → 返回 React Element 对象（不可变的数据描述）
3. **Element** → Reconciler 将其转为 Fiber 节点（可变的工作单元）
4. **Fiber** → beginWork/completeWork 处理 → 产出 flags
5. **Commit** → 根据 flags 操作真实 DOM

## 下一步

- [Fiber 节点结构：Fiber 如何从 Element 创建](/02-fiber-architecture/01-fiber-node-structure) — Fiber 如何从 JSX 编译产物创建
- [beginWork：createFiberFromElement 的调用位置](/03-work-loop/02-begin-work) — reconcileChildren 中调用 createFiberFromElement
- [React 官方文档 - New JSX Transform](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html)

## 参考资料

- [Introducing the New JSX Transform (React 官方博客)](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html) — ★ 官方公告，包含完整迁移指南
- [Why Do React Elements Have a $$typeof Property? (Dan Abramov)](https://overreacted.io/why-do-react-elements-have-typeof-property/) — $$typeof 的安全设计意义
- [React.js Deep Dive #1 — createElement and jsx-runtime (Medium)](https://medium.com/@juliaazt/react-js-deep-dive-1-createelement-and-jsx-runtime-63c75882f7b0) — createElement 和 jsx-runtime 的深入分析
- [JSX In Depth (React 官方文档)](https://legacy.reactjs.org/docs/jsx-in-depth.html) — JSX 语法详解
- [Babel 文档 @babel/plugin-transform-react-jsx](https://babeljs.io/docs/babel-plugin-transform-react-jsx) — Babel 插件配置选项
- [React 17 adds JSX Runtime (Saeloun Blog)](https://blog.saeloun.com/2021/07/01/react-17-adds-jsx-runtime-and-jsx-dev-runtime-for-the-new-jsx-transform/) — 新旧 transform 对比
- [React 源码 jsx/ 目录 (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react/src/jsx) — jsx/jsxs/jsxDEV 实现
- [React 源码 ReactJSXElement.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/jsx/ReactJSXElement.js) — createElement 和 ReactElement 创建
- [How Does React Tell a Class from a Function? (Dan Abramov)](https://overreacted.io/how-does-react-tell-a-class-from-a-function/) — type 字段如何区分不同组件类型
