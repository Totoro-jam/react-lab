---
title: "useEffect / useLayoutEffect 机制"
---


> 对应源码：[`ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js), [`ReactHookEffectTags.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactHookEffectTags.js)

## 1. Effect 对象

每个 `useEffect`/`useLayoutEffect` 在 hooks 链表中对应一个 Effect 对象：

```javascript
// 源码中 Effect 的实际结构

type EffectInstance = {
  destroy: void | (() => void),  // 上次 create 返回的 cleanup 函数存在 inst 里
};

type Effect = {
  tag: HookFlags,        // 标记：Passive(异步) | Layout(同步) | HasEffect(需要执行)
  inst: EffectInstance,   // 实例对象（含 destroy）
  create: () => (() => void) | void,  // 你传的回调函数
  deps: Array<mixed> | void | null,   // 依赖数组
  next: Effect,           // 指向下一个 effect（环形链表）
};
```

Effect 也形成链表，但不是通过 `hook.next`——多个 effect hook 各自的 `memoizedState` 存各自的 Effect，Effect 的 `next` 用于在 commit 阶段快速遍历同一 Fiber 上的所有 effect。

## 2. mountEffect

```javascript
// mountEffect 调用 mountEffectImpl（不同 hook 共用同一基础设施）
function mountEffect(create, deps) {
  mountEffectImpl(
    Passive | PassiveStatic,     // fiberFlags: 标记 fiber 上的 flags
    HookPassive,                  // hookFlags: 只传 HookPassive（HookHasEffect 在 mountEffectImpl 内部加上）
    create,
    deps,
  );
}

// mountEffectImpl 内部（mountEffect / mountLayoutEffect 共用）：
function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  // 1. 标记 fiber.flags（Passive + PassiveStatic 或 Update + LayoutStatic）
  currentlyRenderingFiber.flags |= fiberFlags;
  // 2. 创建 effect 并加入 effect 链表
  hook.memoizedState = pushSimpleEffect(
    HookHasEffect | hookFlags,  // tag: HasEffect 标记本次需要执行
    createEffectInstance(),      // inst: 包含 destroy 的实例对象
    create,
    nextDeps,
  );
}
```

`pushSimpleEffect` 创建 Effect 对象并加入 effect 链表：

```javascript
function pushSimpleEffect(tag, inst, create, deps) {
  const effect = { tag, inst, create, deps, next: null };
  // 构建 effect 环形链表（加入 componentUpdateQueue.lastEffect）
  return pushEffectImpl(effect);
}
```

## 3. updateEffect：依赖比较

```javascript
// updateEffect 调用 updateEffectImpl（共用基础设施）
function updateEffect(create, deps) {
  updateEffectImpl(Passive, HookPassive, create, deps);
}

// updateEffectImpl 内部（useEffect / useLayoutEffect 共用）：
function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const effect = hook.memoizedState;  // WIP hook 上的现有 effect
  const inst = effect.inst;            // inst 包含上次 create 返回的 destroy

  if (currentHook !== null) {
    if (nextDeps !== null) {
      const prevEffect = currentHook.memoizedState;
      const prevDeps = prevEffect.deps;
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        // 依赖没变 → 不含 HasEffect，commit 时跳过
        hook.memoizedState = pushSimpleEffect(hookFlags, inst, create, nextDeps);
        return;
      }
    }
  }

  // 依赖变了 → 标记 fiber.flags + 含 HasEffect（commit 时会执行）
  currentlyRenderingFiber.flags |= fiberFlags;
  hook.memoizedState = pushSimpleEffect(HookHasEffect | hookFlags, inst, create, nextDeps);
}
```

关键：只有 `HasEffect` 标记的 effect 才会在 commit 阶段执行。依赖没变的 effect 也会 push 到链表（保持顺序），但不含 `HasEffect`，commit 时会跳过。

## 4. 依赖比较

```javascript
function areHookInputsEqual(nextDeps, prevDeps) {
  if (prevDeps === null) return false;  // nextDeps 由调用方保证非 null
  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    if (is(nextDeps[i], prevDeps[i])) continue;
    return false;
  }
  return true;
}
```

用 `Object.is` 比较每个依赖。`Object.is` 比 `===` 更精确（处理 `NaN` 和 `+0`/`-0`）。

## 5. 执行时机的区别

`useEffect` 和 `useLayoutEffect` 的执行时机差异是 React 中最容易踩坑的地方，Dan Abramov 在 [useEffect vs useLayoutEffect](https://gist.github.com/gaearon/1d19088790e70acfd1fff9c28c6e8c4c) 中详细解释了两者的区别：

```
useLayoutEffect (Layout):
  tag: Layout | HasEffect
  执行时机: Commit 的 layout 阶段（同步，DOM 已变更但浏览器未绘制）
  flags: Update | LayoutStatic
  特点: 会阻塞浏览器绘制

useEffect (Passive):
  tag: Passive | HasEffect
  执行时机: Commit 完成后通过 scheduleCallback 异步调度
  flags: Passive | PassiveStatic
  特点: 不阻塞绘制
```

## 6. Commit 阶段的执行流程

```
Commit 阶段 Effect 执行顺序：

0. 调度 passive effects（三阶段之前）:
   → scheduleCallback(flushPassiveEffects)
   → 只是排入异步队列，不在此执行

1. beforeMutation 阶段:
   → getSnapshotBeforeUpdate（类组件）

2. mutation 阶段:
   → 对 layout effect：先执行 destroy（cleanup）
   → 对 passive effect：不执行

   ← 此处切换 current 指针：root.current = finishedWork ←

3. layout 阶段:
   → 对 layout effect：执行 create（新的回调）
   → 调用 componentDidMount/Update

4. passive 阶段（异步，paint 之后）:
   → 对 passive effect：先执行 destroy，再执行 create
   → 先执行所有 destroy，再执行所有 create
```

```
执行顺序示例：
  组件 A 有 useEffect(eA) 和 useLayoutEffect(lA)
  组件 B 有 useEffect(eB) 和 useLayoutEffect(lB)

  组件树: <A><B/></A>

  Commit 时:
    layout 阶段（同步，子→父）:
      lB.create()
      lA.create()

    passive 阶段（异步，子→父）:
      eB.destroy()（如果 deps 变了）
      eA.destroy()（如果 deps 变了）
      eB.create()
      eA.create()

  注意：effect 执行是子→父（与 Fiber 遍历的方向一致）
```

## 7. StrictMode 中的双重执行

开发模式下，`<StrictMode>` 会让 effect 执行两次——先执行 create+destroy，然后再执行 create。[Under the hood of React's hooks system](https://the-guild.dev/blog/react-hooks-system) 对这一行为有详细解释：

```
StrictMode 下的 effect 执行序列：
  mount:
    1. create()  → 返回 destroy
    2. destroy() ← 故意提前调用
    3. create()  → 重新执行

目的：检测你的 effect/cleanup 是否幂等
  如果 cleanup 不正确 → 第二次 create 会出问题
  这在并发模式/快速 remount 场景下很重要
```

## 下一步

- [useRef / useImperativeHandle](/04-hooks-internals/04-ref-hooks) — useRef 的实现
- [useContext 与 Context 传播](/04-hooks-internals/05-context-hooks) — useContext
- [Commit 阶段](/03-work-loop/05-commit-phase) — Commit 阶段详解

## 参考资料

- [useEffect vs useLayoutEffect (Dan Abramov)](https://gist.github.com/gaearon/1d19088790e70acfd1fff9c28c6e8c4c) — effect 执行时机详解
- [Under the hood of React's hooks system (Eytan Manor)](https://the-guild.dev/blog/react-hooks-system) — Hooks 调用链追踪
- [React 技术揭秘 - useEffect (卡颂)](https://react.iamkasong.com/hooks/effect.html) — 中文 effect Hook 分析
