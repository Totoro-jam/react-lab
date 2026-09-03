---
title: "StrictMode：故意双重调用 effect"
---


> 对应源码：[`packages/react-reconciler/src/ReactStrictModeWarnings.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactStrictModeWarnings.js), [`packages/react-reconciler/src/ReactFiberBeginWork.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js)（StrictMode 相关处理）

## 你的 effect 被调用了两次——这是故意的

你在 React 18+ 开发模式下看到 `useEffect` 执行了两次：mount → unmount → mount。你以为是 bug。

不是。这是 StrictMode **故意**的——为了帮你发现那些在"卸载再挂载"场景下会出问题的 effect。

## 为什么需要双重调用

> [React 官方文档](https://legacy.reactjs.org/docs/strict-mode.html)解释了动机：React 计划支持"保持状态的卸载/重新挂载"——比如用户切换 tab 后切回来，React 应该能立即显示之前的界面，保留所有 state。

```
未来计划的功能：
  tab A ⇄ tab B 切换时，React 卸载 A 但保留 state
  → 切回来时用保存的 state 重新挂载 A

这对 effect 意味着什么？
  → 一个组件的生命周期中可能被 mount/unmount 多次
  → effect 的清理函数必须可靠
  → effect 应该是幂等的（多次执行结果一致）

如果 effect 不能正确清理：
  → 订阅泄漏
  → 定时器累积
  → 重复的 API 请求
  → 事件监听器残留
```

StrictMode 通过在开发模式下 **mount → unmount → mount** 来提前暴露这些问题。

## 什么时候双重调用

```
✅ 开发模式（__DEV__）+ StrictMode 包裹 → 双重调用
❌ 生产模式 → 单次调用（无影响）
❌ 开发模式但没有 StrictMode → 单次调用

双重调用的范围：
  → 仅 StrictMode 子树中的组件
  → 仅首次 mount 时（后续 update 不会双重调用）
```

## 哪些东西被双重调用

```
被双重调用（mount → cleanup → mount）：
  → useEffect
  → useLayoutEffect
  → useInsertionEffect

不被双重调用：
  → useState/useReducer 初始值（state 保留）
  → useRef 初始值（ref 保留）
  → useMemo/useCallback（重新执行但不影响结果）
  → 组件函数本身（只渲染一次）

特殊处理：
  → console.log 在第二次调用时被抑制（避免日志重复）
```

## React 内部如何实现

StrictMode 的实现分散在多个阶段，而不是集中在 `updateMode` 中：

### 1. `updateMode`（beginWork 中）— 只做 reconcileChildren

```javascript
// ReactFiberBeginWork.js: updateMode（完整源码！）

function updateMode(current, workInProgress, renderLanes) {
  const nextChildren = workInProgress.pendingProps.children;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes);
  return workInProgress.child;
}
```

注意：`updateMode` 非常简单——只处理 children，不做任何 StrictMode 特殊逻辑。StrictMode 的 mode bit 通过 Fiber 树继承传给子组件。

### 2. Hooks mount 时添加 Dev 标记

```javascript
// ReactFiberHooks.js: mountEffect（简化）

function mountEffect(create, deps) {
  let fiberFlags = PassiveEffect | PassiveStaticEffect;
  if (__DEV__ && (currentlyRenderingFiber.mode & StrictEffectsMode) !== NoMode) {
    // StrictMode 下：额外添加 MountPassiveDevEffect flag
    fiberFlags |= MountPassiveDevEffect;
  }
  mountEffectImpl(fiberFlags, HookPassive, create, deps);
}

// mountLayoutEffect 同理，额外添加 MountLayoutDevEffect flag
```

### 3. Commit 阶段处理 Dev 标记

```javascript
// ReactFiberCommitEffects.js: commitHookEffectListMount（简化）

// 在 commit 阶段遍历 effect 链表
function commitHookEffectListMount(flags, finishedWork) {
  let effect = firstEffect;
  do {
    if ((effect.tag & flags) === flags) {
      // 正常挂载：调用 create()，返回值是 cleanup 函数
      const destroy = effect.create();
      effect.inst.destroy = destroy;  // 存储 cleanup

      if (__DEV__) {
        if ((flags & MountPassiveDevEffect) !== NoFlags) {
          // StrictMode 双重调用：
          // 1. effect 已执行（上面的 mount）
          // 2. 立即执行 cleanup（模拟 unmount）
          if (effect.inst.destroy !== undefined) {
            effect.inst.destroy();
            effect.inst.destroy = undefined;
          }
          // 3. 再次执行 effect（模拟 remount）
          const destroy2 = effect.create();
          effect.inst.destroy = destroy2;
        }
      }
    }
    effect = effect.next;
  } while (effect !== firstEffect);
}
```

## 编写可重入的 effect

```javascript
// ❌ 不好——双重调用会创建两个定时器
useEffect(() => {
  const id = setInterval(() => setCount(c => c + 1), 1000);
  // 没有 cleanup！
}, []);

// ✅ 好的——双重调用安全
useEffect(() => {
  const id = setInterval(() => setCount(c => c + 1), 1000);
  return () => clearInterval(id);  // cleanup 清理定时器
}, []);

// ✅ 好的——API 请求用 AbortController
useEffect(() => {
  const controller = new AbortController();
  fetch('/api/data', { signal: controller.signal })
    .then(res => res.json())
    .then(setData)
    .catch(err => {
      if (err.name !== 'AbortError') throw err;
    });
  return () => controller.abort();  // cleanup 取消请求
}, []);

// ✅ 好的——订阅用 cleanup 取消
useEffect(() => {
  const unsubscribe = store.subscribe(() => {
    setStoreData(store.getState());
  });
  return () => unsubscribe();  // cleanup 取消订阅
}, []);
```

> [React 官方 useEffect 文档](https://react.dev/learn/synchronizing-with-effects)和 [StackOverflow 讨论](https://stackoverflow.com/questions/72238175/why-useeffect-running-twice-and-how-to-handle-it-well-in-react)讨论了编写可重入 effect 的模式。

### 不应该用 effect 做的事

```
❌ 购买商品 → 放在事件处理器中（onClick）
❌ 初始化应用 → 放在模块顶层或 App 组件外
❌ 用户认证变化 → 用 context 直接传递
❌ 只在 mount 时执行的副作用 → 考虑是否有更好的替代方案
```

如果双重调用对你的某个 effect 造成了实际问题，这通常是一个信号——你可能不应该把那个逻辑放在 effect 中。

## 下一步

- [useEffect / useLayoutEffect](/04-hooks-internals/03-effect-hooks) — useEffect 的完整实现
- [Offscreen / Activity](/06-concurrent-features/05-offscreen) — Activity 组件（正是双重调用要准备的功能）
- [Fast Refresh](/12-internal-mechanisms/01-fast-refresh) — Fast Refresh 也忽略 effect 依赖数组

## 参考资料

- [React 源码 ReactStrictModeWarnings.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactStrictModeWarnings.js) — StrictMode 警告和双重调用实现
- [React 源码 ReactFiberBeginWork.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js) — `updateMode` 实现
- [Strict Mode (官方文档 - 旧版)](https://legacy.reactjs.org/docs/strict-mode.html) — ★ StrictMode 的所有检查项
- [Synchronizing with Effects (官方文档)](https://react.dev/learn/synchronizing-with-effects) — 编写可重入 effect 的指南
- [You Might Not Need an Effect (官方文档)](https://react.dev/learn/you-might-not-need-an-effect) — 什么时候不该用 effect
- [Why useEffect running twice (StackOverflow)](https://stackoverflow.com/questions/72238175/why-useeffect-running-twice-and-how-to-handle-it-well-in-react) — ★ 社区讨论和最佳实践
- [Prevent React from triggering useEffect twice (Medium)](https://taig.medium.com/prevent-react-from-triggering-useeffect-twice-307a475714d7) — 实际场景中的解决方案
- [Strict Mode (React 官方文档 - 新版)](https://react.dev/reference/react/StrictMode) — API 参考
