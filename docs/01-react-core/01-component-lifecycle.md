---
title: "Component / PureComponent 源码"
---


> 对应源码：[`packages/react/src/ReactBaseClasses.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactBaseClasses.js)

## 1. Component 类定义

```javascript
// packages/react/src/ReactBaseClasses.js（简化）

function Component(props, context, updater) {
  this.props = props;
  this.context = context;
  this.refs = emptyObject;
  this.updater = updater || ReactNoopUpdateQueue;
}

Component.prototype.isReactComponent = {};  // 标记为类组件

Component.prototype.setState = function(partialState, callback) {
  this.updater.enqueueSetState(this, partialState, callback, 'setState');
};

Component.prototype.forceUpdate = function(callback) {
  this.updater.enqueueForceUpdate(this, callback, 'forceUpdate');
};
```

关键点：

- `isReactComponent = {}` 是一个空对象，它的存在（而非值）标记了这是一个类组件。React 用 `Component.prototype.isReactComponent` 来区分类组件和函数组件。关于 Component、Element 和 Instance 的区别，Dan Abramov 在 [React Components, Elements, and Instances](https://legacy.reactjs.org/blog/2015/12/18/react-components-elements-and-instances.html) 中做了经典阐释。
- `this.updater` 是注入的更新器——在不同环境下由 Reconciler 提供。类组件自己不知道如何触发更新，它委托给 `updater`。

## 2. PureComponent

```javascript
function PureComponent(props, context, updater) {
  this.props = props;
  this.context = context;
  this.refs = emptyObject;
  this.updater = updater || ReactNoopUpdateQueue;
}

// 继承 Component
const pureComponentPrototype = (PureComponent.prototype = new ComponentDummy());
pureComponentPrototype.constructor = PureComponent;
Object.assign(pureComponentPrototype, Component.prototype);

// 标记浅比较
pureComponentPrototype.isPureReactComponent = true;
```

`PureComponent` 和 `Component` 的唯一区别就是 `isPureReactComponent = true`。Reconciler 在 [`checkShouldComponentUpdate`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberClassComponent.js) 中检查这个标记：

```javascript
// ReactFiberClassComponent.js checkShouldComponentUpdate（简化）
if (ctor.prototype && ctor.prototype.isPureReactComponent) {
  // PureComponent → 当 props 或 state 有变化时才更新
  return !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState);
}
// Component → 默认总是更新（除非 shouldComponentUpdate 返回 false）
return true;
```

注意逻辑：`!shallowEqual` 表示**不相等**时返回 `true`（应该更新）。即 PureComponent 在 props 或 state **有变化**时才重新渲染。

## 3. updater 的注入

```javascript
// packages/react/src/ReactNoopUpdateQueue.js
const ReactNoopUpdateQueue = {
  isMounted: function() { return false; },
  enqueueSetState: function() {
    console.warn('Can only update a mounting component.');
  },
  // ...
};
```

在组件 mount 时，Reconciler 会替换实例的 `updater`（见 [`ReactFiberClassComponent.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberClassComponent.js) 中的 `constructClassInstance`）：

```javascript
// ReactFiberClassComponent.js（简化）
function constructClassInstance(workInProgress, ctor, props) {
  // ... 创建实例 ...
  const instance = new ctor(props, context);
  instance.updater = classComponentUpdater;
  workInProgress.stateNode = instance;
  // classComponentUpdater 有 enqueueSetState/enqueueForceUpdate 的真正实现
  return instance;
}
```

## 4. 生命周期在 Fiber 架构中的执行时机

Fiber 架构将生命周期分为两个阶段：Render 阶段（可中断）和 Commit 阶段（不可中断）。

```
Render 阶段（beginWork / completeWork）：
  可以被中断、恢复或丢弃
  │
  ├─ constructor                   ← 首次创建实例（仅在 mount）
  ├─ getDerivedStateFromProps      ← 每次 render 前调用
  ├─ shouldComponentUpdate         ← 决定是否渲染
  └─ render                        ← 返回 JSX

Commit 阶段（同步执行）：
  不可中断，一次性完成
  │
  ├─ before mutation:
  │   └─ getSnapshotBeforeUpdate   ← 捕获 DOM 变更前的信息
  │
  ├─ mutation:
  │   ├─ 清理旧 DOM / 插入新 DOM
  │   └─ componentWillUnmount      ← unmount 前（在删除 DOM 时触发）
  │
  └─ layout:
      ├─ componentDidMount         ← mount 后（首次）
      └─ componentDidUpdate        ← update 后
```

### 为什么有些生命周期被废弃

```
被废弃的 Render 阶段生命周期：
  UNSAFE_componentWillMount
  UNSAFE_componentWillReceiveProps
  UNSAFE_componentWillUpdate

原因：Render 阶段在并发模式下可以被中断、恢复或重复执行
  → 这些生命周期可能被多次调用
  → 如果开发者在里面写了副作用（如发起请求）→ 重复执行导致 bug

替代方案：
  componentWillReceiveProps → getDerivedStateFromProps（纯函数）
  componentWillUpdate → componentDidUpdate（移到 commit 阶段）
  componentWillMount → constructor 或 componentDidMount
```

## 5. classComponentUpdater 的真正实现

```javascript
// ReactFiberClassComponent.js:165-243（简化）

const classComponentUpdater = {
  // 注意：当前源码中只有三个方法，没有 isMounted

  enqueueSetState(inst, payload, callback) {
    const fiber = getInstance(inst);
    const lane = requestUpdateLane(fiber);
    const update = createUpdate(lane);
    update.payload = payload;
    if (callback != null) { update.callback = callback; }
    const root = enqueueUpdate(fiber, update, lane);
    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, lane);
      entangleTransitions(root, fiber, lane);
    }
  },

  enqueueReplaceState(inst, payload, callback) {
    const fiber = getInstance(inst);
    const lane = requestUpdateLane(fiber);
    const update = createUpdate(lane);
    update.tag = ReplaceState;
    update.payload = payload;
    // ... 同 enqueueSetState 的调度逻辑 ...
  },

  enqueueForceUpdate(inst, callback) {
    const fiber = getInstance(inst);
    const lane = requestUpdateLane(fiber);
    const update = createUpdate(lane);
    update.tag = ForceUpdate;  // 标记为强制更新
    // ... 同 enqueueSetState 的调度逻辑 ...
  },
};
```

`forceUpdate` 通过设置 `ForceUpdate` 标记来跳过 `shouldComponentUpdate` 检查。注意 `enqueueUpdate` 返回 root，只有 `root !== null` 时才调度更新——如果 root 为 null 说明更新已经在其他地方被处理了。

## 6. React 19 中 ref 作为普通 prop

React 19 中，`ref` 可以直接作为普通 prop 传递给函数组件，不再需要 `forwardRef`：

```jsx
// React 19
function MyInput({ ref, ...props }) {
  return <input ref={ref} {...props} />;
}

// React 18 需要 forwardRef
const MyInput = React.forwardRef((props, ref) => {
  return <input ref={ref} {...props} />;
});
```

## 下一步

- [Hooks API 全景](/01-react-core/02-hooks-api-overview) — React Hooks API 全景
- [Hooks 的 Mount 与 Update 机制](/04-hooks-internals/01-hooks-mount-update) — Hooks 底层机制
- [beginWork 详解](/03-work-loop/02-begin-work) — beginWork 中如何处理 ClassComponent

## 参考资料

- [React Components, Elements, and Instances (Dan Abramov)](https://legacy.reactjs.org/blog/2015/12/18/react-components-elements-and-instances.html) — ★ 组件、元素、实例的经典区分
- [React.Component (官方文档)](https://legacy.reactjs.org/docs/react-component.html) — 完整的生命周期方法参考
- [React 源码 ReactBaseClasses.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactBaseClasses.js) — Component/PureComponent 定义
- [React 源码 ReactFiberClassComponent.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberClassComponent.js) — classComponentUpdater 和 lifecycle 调用
- [React 源码 ReactFiberClassUpdateQueue.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js) — 类组件更新队列
- [How Does setState Know What to Do? (Dan Abramov)](https://overreacted.io/how-does-setstate-know-what-to-do/) — 依赖注入与 updater 机制
- [Why Do We Write super(props)? (Dan Abramov)](https://overreacted.io/why-do-we-write-super-props/) — constructor 中的 super 细节
- [React 19: What's New (Scrimba)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — React 19 ref as prop
- [Optimized for Change (Dan Abramov)](https://overreacted.io/optimized-for-change/) — API 设计哲学
