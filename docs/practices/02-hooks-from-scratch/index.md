---
title: "实践练习：手写 Hooks 实现"
---


> 目标：独立实现 useState、useEffect、useReducer 等核心 Hooks

## 1. 项目目标

脱离 React 环境，用纯 JavaScript 模拟实现 Hooks 机制，深入理解：

- Hooks 链表的组织方式
- mount 和 update 的两套实现
- useState 的更新队列和环形链表
- useEffect 的依赖比较和异步执行

## 2. 核心实现

### 模拟 Fiber 环境

```javascript
let currentFiber = null;     // 正在渲染的 Fiber
let currentHook = null;      // 当前处理的 hook
let workInProgressHook = null; // workInProgress 的 hook 指针
let isMount = false;         // mount vs update 标记
```

### mountWorkInProgressHook / updateWorkInProgressHook

实现两个版本的 hook 获取函数，模拟 React 的 mount/update 分发。

### useState

```javascript
function useState(initialValue) {
  let hook;
  if (isMount) {
    hook = {
      memoizedState: initialValue,
      queue: { pending: null },
      next: null,
    };
    if (workInProgressHook === null) {
      currentFiber.memoizedState = workInProgressHook = hook;
    } else {
      workInProgressHook = workInProgressHook.next = hook;
    }
  } else {
    hook = updateWorkInProgressHook();
    // 处理更新队列
    let update = hook.queue.pending;
    while (update) {
      hook.memoizedState = typeof update.action === 'function'
        ? update.action(hook.memoizedState)
        : update.action;
      update = update.next;
    }
  }

  const setState = (action) => {
    const update = { action, next: null };
    // 环形链表插入
    if (hook.queue.pending === null) {
      update.next = update;
    } else {
      update.next = hook.queue.pending.next;
      hook.queue.pending.next = update;
    }
    hook.queue.pending = update;
    // 触发"重新渲染"（模拟）
    scheduleRerender();
  };

  return [hook.memoizedState, setState];
}
```

### useEffect

```javascript
function useEffect(callback, deps) {
  let hook;
  if (isMount) {
    hook = { memoizedState: null, deps, next: null };
    pendingEffects.push(callback); // 收集待执行
  } else {
    hook = updateWorkInProgressHook();
    if (areHookInputsEqual(deps, hook.deps)) {
      // 依赖没变 → 跳过
    } else {
      hook.deps = deps;
      pendingEffects.push(callback);
    }
  }
  // ...
}
```

## 3. 验证

```javascript
function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('Alice');
  useEffect(() => {
    console.log('count changed:', count);
  }, [count]);
  return { count, name, setCount, setName };
}

// 第一次渲染（mount）
isMount = true;
let app = App(); // { count: 0, name: 'Alice' }

// 触发更新
app.setCount(1);

// 第二次渲染（update）
isMount = false;
app = App(); // { count: 1, name: 'Alice' }
// effect 执行：输出 "count changed: 1"
```

## 下一步

- [手写 mini-react](/practices/01-mini-react/) — 从零实现 React 核心
- [手写时间切片调度器](/practices/03-scheduler-demo/) — 手写时间切片调度器
- [Hooks 的 Mount 与 Update 机制](/04-hooks-internals/01-hooks-mount-update) — Hooks 底层机制

## 参考资料

- [Under the hood of React's hooks system (Eytan Manor)](https://the-guild.dev/blog/react-hooks-system) — Hooks 调用链追踪
- [A journey through the implementation of useState (Carl Mungazi)](https://www.newline.co/@CarlMungazi/a-journey-through-the-usestate-hook--a4983397) — useState 源码旅程
- [React 源码 ReactFiberHooks.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) — Hooks 完整实现
