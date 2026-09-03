---
title: "工具型 Hooks：useId / useDeferredValue / useEffectEvent / useInsertionEffect"
---


> 对应源码：[`packages/react-reconciler/src/ReactFiberHooks.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js), [`packages/react-reconciler/src/ReactFiberTreeContext.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberTreeContext.js)

## useId：基于树位置的唯一 ID

### 问题：计数器在 SSR 中不靠谱

你给 `<label>` 和 `<input>` 配对需要 `id`。直觉做法是用全局计数器：

```javascript
let counter = 0;
function MyInput() {
  const id = `input-${counter++}`;
  return <><label htmlFor={id}>Name</label><input id={id} /></>;
}
```

这在纯客户端可以工作。但在 SSR + 选择性水合中，**水合顺序不确定**——某个 Suspense 边界的内容可能比另一个先到达。客户端生成的 ID 和服务端生成的 ID 可能不匹配 → 水合失败。

### 解决：基于 Fiber 树位置编码

`useId` 不用计数器，而是基于 **Fiber 在树中的位置路径** 生成 ID。位置是确定性的——无论渲染顺序如何，同一个 Fiber 在树中位置不变。

```javascript
// ReactFiberHooks.js:mountId（简化）

function mountId(): string {
  const hook = mountWorkInProgressHook();
  const identifierPrefix = root.identifierPrefix;

  let id;
  if (getIsHydrating()) {
    // 水合中：用树位置编码（服务端和客户端一致）
    const treeId = getTreeId();
    id = '_' + identifierPrefix + 'R_' + treeId;
    // 如果同一组件有多个 useId，附加本地序号
    const localId = localIdCounter++;
    if (localId > 0) {
      id += 'H' + localId.toString(32);
    }
    id += '_';
  } else {
    // 非水合：用全局计数器（纯客户端足够）
    const globalClientId = globalClientIdCounter++;
    id = '_' + identifierPrefix + 'r_' + globalClientId.toString(32) + '_';
  }
  hook.memoizedState = id;
  return id;
}

function updateId(): string {
  // 更新时直接返回存储的 ID - ID 不会变
  const hook = updateWorkInProgressHook();
  return hook.memoizedState;
}
```

### getTreeId：位编码树路径

```javascript
// ReactFiberTreeContext.js（简化）

export function getTreeId() {
  const overflow = treeContextOverflow;
  const idWithLeadingBit = treeContextId;
  const id = idWithLeadingBit & ~getLeadingBit(idWithLeadingBit);
  return id.toString(32) + overflow;
}
```

树位置用**位编码**表示——每个层级的位置编码进一个整数。路径 `root → child[2] → child[1]` 会编码为一个唯一的 32 进制字符串。

React 19.2 将默认前缀从 `«r»`（19.1 使用，但不兼容 `view-transition-name` 和 XML 1.0 名称）改为 `_r_`。完整演变：`:r:`（19.0，不合法 CSS 选择器）→ `«r»`（19.1）→ `_r_`（19.2）。

---

## useDeferredValue：延迟一个值

### 与 useTransition 的区别

```
useTransition：
  你控制 setState 的调用时机
  → startTransition(() => setSearch(query))
  → 适合"我知道这个更新可以慢"

useDeferredValue：
  你接收一个值（可能来自 props），延迟它的使用
  → const deferred = useDeferredValue(value)
  → 适合"我控制不了值的来源，但可以让渲染基于旧值"
```

### 内部实现

```javascript
// ReactFiberHooks.js:updateDeferredValue + updateDeferredValueImpl（简化）

function updateDeferredValue(value, initialValue) {
  const hook = updateWorkInProgressHook();
  // prevValue 从 currentHook（alternate）取，不是 WIP hook
  const prevValue = currentHook.memoizedState;
  return updateDeferredValueImpl(hook, prevValue, value, initialValue);
}

function updateDeferredValueImpl(hook, prevValue, value, initialValue) {
  if (is(value, prevValue)) {
    // 值没变 → 直接返回（注意：返回 value 不是 prevValue）
    return value;
  }

  // 值变了：判断是否需要延迟
  if (/* 紧急渲染 && 不在 deferred work 中 */ shouldDeferValue) {
    // === 延迟路径 ===
    // 安排低优先级 deferred render 用新值重新渲染
    const deferredLane = requestDeferredLane();
    // 注意：不更新 hook.memoizedState！这次渲染保持旧值
    currentlyRenderingFiber.lanes = mergeLanes(currentlyRenderingFiber.lanes, deferredLane);
    return prevValue;  // 本次渲染返回旧值
  } else {
    // === 非延迟路径（本次已经是低优先级渲染）===
    // 直接用新值
    hook.memoizedState = value;
    return value;
  }
}
```

关键逻辑：**值变了不立即用新值，先返回旧值**。在 deferred lane 上安排一次低优先级更新（用新值渲染）。如果有更高优先级的更新到达，这个低优先级更新会被打断。等低优先级更新恢复时，再次进入 `updateDeferredValueImpl`，这次 `shouldDeferValue` 为 false（已经是低优先级了），于是走 **非延迟路径**，设置 `hook.memoizedState = value` 并返回新值。

```
用户输入 "a" → input 更新（高优先级）→ 页面用旧值渲染 → 立即响应
              → DeferredLane 用新值渲染（低优先级）→ 可能被打断

用户再输入 "ab" → input 更新（高优先级）→ 用 "a" 的延迟值渲染
                 → 旧的 DeferredLane("a") 被打断
                 → 新的 DeferredLane("ab") 排队
```

### 双重渲染陷阱

> [Nadia Makarevich 的 useTransition 分析](https://www.developerway.com/posts/use-transition)详细描述了这个陷阱。

useTransition 和 useDeferredValue 都会导致**双次渲染**——先用旧值渲染（`isPending` 切换为 true），再用新值渲染。如果旧值的渲染很重（因为没有 memo 化），使用这两个 Hooks 反而**让性能变差**。

---

## useEffectEvent：effect 中的"实时"函数（React 19.2 稳定）

### 解决什么问题

```javascript
// 问题：theme 改变导致 chat 重连
function ChatRoom({ roomId, theme }) {
  useEffect(() => {
    const connection = createConnection(roomId);
    connection.on('connected', () => {
      showNotification('Connected!', theme);  // 用了 theme
    });
    connection.connect();
    return () => connection.disconnect();
  }, [roomId, theme]);  // ← theme 一变，effect 重新执行 → chat 重连！
}
```

`theme` 只在 `connected` 事件回调中被使用——它不应该导致 effect 重新执行。但你又不能从依赖数组中删除它（eslint 会警告，且如果以后逻辑变了可能出 bug）。

### useEffectEvent 的解法

```javascript
function ChatRoom({ roomId, theme }) {
  // 提取"事件"部分
  const onConnected = useEffectEvent(() => {
    showNotification('Connected!', theme);
    // ↑ 总是读到最新的 theme 值
  });

  useEffect(() => {
    const connection = createConnection(roomId);
    connection.on('connected', () => {
      onConnected();  // ← 调用 effect event
    });
    connection.connect();
    return () => connection.disconnect();
  }, [roomId]);  // ← theme 不在依赖中！
}
```

### 内部机制

```
useEffectEvent 内部实现（简化自 ReactFiberHooks.js 源码）：

mount: const ref = {impl: callback}; → 存到 hook.memoizedState
update: const ref = hook.memoizedState;
        → useEffectEventImpl({ref, nextImpl: callback})
          → 后续在 commit 阶段才更新 ref.impl = nextImpl（不一定在每次渲染时立即更新！）

返回的函数（每次都返回同一个函数引用！原理同 useCallback 但无依赖检查）：
  eventFn(...args) {
    → ref.impl.apply(undefined, args)
    → ref.impl 总是指向最新渲染传入的 callback
  }

所以：
  → theme 变了 → onConnected 的 ref.impl 在 commit 后更新 → effect 不重新执行
  → connected 事件触发 → 调用 onConnected() → 执行 ref.impl
    → ref.impl 指向最新渲染传入的 callback → 读到最新的 theme
```

> [React 19.2 博客](https://react.dev/blog/2025/10/01/react-19-2)和 [certificates.dev 的分析](https://certificates.dev/blog/whats-new-in-react-192)对 useEffectEvent 有完整说明。

### 使用规则

```
✅ 用于从 effect 中触发的"事件"回调（通知、分析、日志）
✅ 总是读到最新的 props 和 state
✅ React 19.2 中已稳定（之前为实验性，19.0-19.1 为 Canary）
✅ 需要升级 eslint-plugin-react-hooks@latest 以支持禁用 lint 检查
❌ 不是响应式的 → 不加入 useEffect 依赖数组
❌ 只在定义它的组件/Hook 的 effect 中调用
❌ 不要传递给其他组件或 Hook
❌ 不要用 useRef 手动实现类似模式（eslint 无法验证 ref workaround 的正确性）
```

### 为什么不是 useReducer / useRef

```
useEffectEvent vs useRef + useEffect：

useRef workaround:
  const themeRef = useRef(theme);
  themeRef.current = theme;  // ← 每次渲染都写 ref（可能违反 "不要在 render 中写 side effects" 原则）
  
  useEffect(() => {
    connection.on('connected', () => {
      showNotification('Connected!', themeRef.current);  // ← 有效但 eslint 无法验证
    });
  }, [roomId]);
  
  问题：
  → 每次渲染都更新 ref.current（render 阶段有 side effects）
  → eslint 检查无法帮忙验证正确性
  → 如果回调内需要调用其他 hooks（如 setState），无法保证安全

useEffectEvent：
  const onConnected = useEffectEvent(() => {
    showNotification('Connected!', theme);  // ← 直接访问，总是最新值
  });
  
  useEffect(() => {
    connection.on('connected', () => {
      onConnected();  // ← 清晰的事件分离
    });
  }, [roomId]);  // ← onConnected 不需作为依赖（lint 规则不要求）
  
  优势：
  → ref.impl 只在 commit 阶段更新（不在 render 阶段写 side effects）
  → eslint-plugin-react-hooks 识别 effect event → 不会警告缺少依赖
  → 可以在 callback 内安全使用其他 hooks（如果有必要）
```

### 与普通回调的区别

```
普通回调（每次渲染创建新函数）：
  const handler = () => console.log(theme);
  → handler 是每次 render 新的函数引用
  → 如果用作 useEffect 依赖 → 每次都触发 effect 重新执行
  → 即使不作为依赖 → 使用时捕获的 theme 是 render 时的值（stale closure 风险）

useEvent（稳定引用 + 最新值）：
  const handler = useEffectEvent(() => console.log(theme));
  → handler 引用稳定（每次返回同一个函数）
  → 不作为 effect 依赖
  → 调用时 ref.impl 指向最新渲染传入的 callback → 读到最新 theme
  → 既不影响 effect 重执行，又不会 stale closure
```

---

## useInsertionEffect：CSS-in-JS 的底层支持

### 在所有 effect 之前执行

```
Commit 阶段的 effect 执行顺序：

  mutation 阶段（DOM 变更，同步）：
    ├─ 对每个 fiber（子→父顺序）：
    │   ├─ 递归处理子树 mutation effects（包括 HookInsertion unmount）
    │   ├─ Placement 插入 DOM 节点（commitReconciliationEffects）
    │   ├─ HookInsertion unmount + mount ← useInsertionEffect 的 create/destroy
    │   └─ HookLayout unmount ← useLayoutEffect 的 destroy（上次 create 返回的 cleanup）
    （所有 destroy 都在 create 之前执行——防止兄弟组件 effect 互相干扰）

  ← 切换 current 指针 →

  layout 阶段（DOM 已变更但未绘制，同步）：
    └─ HookLayout mount ← useLayoutEffect 的 create
    └─ componentDidMount / componentDidUpdate

  浏览器绘制

  passive 阶段（异步，paint 之后）：
    ├─ HookPassive unmount  ← useEffect 的 destroy（cleanup）
    └─ HookPassive mount    ← useEffect 的 create
```

所以 `useInsertionEffect` 在 **mutation 阶段中**执行——Fiber 的 Placement 之后、 `useLayoutEffect` create 之前。它的目的是确保 CSS-in-JS 注入的 `<style>` 在 layout 读取（`useLayoutEffect` create）之前就已经到位。

### 为什么需要它

CSS-in-JS 库（如 styled-components）需要在渲染时动态注入 `<style>` 标签。如果注入太晚（在 `useLayoutEffect` 中），浏览器已经读取了一次布局——注入后需要重新计算布局，导致闪烁。

`useInsertionEffect` 在 **mutation 阶段中**执行（Placement 之后、layout 阶段之前）——此时 DOM 已插入但浏览器尚未读取布局，注入样式不会导致额外的重排。

```javascript
// CSS-in-JS 库的典型使用
function useStyle(rules) {
  useInsertionEffect(() => {
    // 在 mutation 阶段注入 <style>（DOM 已存在但布局未读取）
    const style = document.createElement('style');
    style.textContent = generateCSS(rules);
    document.head.appendChild(style);
    return () => style.remove();
  }, [rules]);
}
```

**注意**：`useInsertionEffect` 是为 CSS-in-JS 库作者设计的，普通应用开发者不需要直接使用。它不应读取布局信息（如 `getBoundingClientRect`），因为此时同一次 commit 中的其他 DOM 变更可能还未完成。

## 下一步

- [useTransition / useDeferredValue](/04-hooks-internals/07-concurrent-hooks) — useTransition/useDeferredValue 的实现
- [React 19 新 Hooks](/04-hooks-internals/08-react19-hooks) — React 19 新 Hooks 的完整分析
- [过渡更新 Transitions](/06-concurrent-features/03-transitions) — Transition 的优先级中断机制

## 参考资料

- [How does useId() work internally in React? (JSer.dev)](https://jser.dev/2023-04-25-how-does-useid-work/) — ★ useId 的完整源码分析，包含树位置编码原理
- [React 19.2 博文 (官方)](https://react.dev/blog/2025/10/01/react-19-2) — ★ useEffectEvent 稳定、Activity、Partial Pre-rendering
- [What's New in React 19.2 (certificates.dev)](https://certificates.dev/blog/whats-new-in-react-192) — useEffectEvent 和 Activity 实战指南
- [React 19.2 useEffectEvent hook (Medium)](https://medium.com/@ignatovich.dm/react-19-2-useeffectevent-hook-f8eb2348553e) — useEffectEvent 解决 stale closure 的原理
- [useTransition: performance game changer or...? (Nadia Makarevich)](https://www.developerway.com/posts/use-transition) — ★ 双重渲染陷阱的详细分析
- [Understanding useTransition and useDeferredValue](https://javascript.plainenglish.io/react-performance-hooks-understanding-usetransition-and-usedeferredvalue-af1ffec0561a) — 两个 Hook 的对比
- [useTransition vs useDeferredValue (Academind)](https://academind.com/articles/react-usetransition-vs-usedeferredvalue) — 何时用哪个
- [React 源码 ReactFiberHooks.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js) — 所有 Hooks 实现
- [React 源码 ReactFiberTreeContext.js (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberTreeContext.js) — useId 的树位置编码
- [React 官方文档 - useId](https://react.dev/reference/react/useId) — API 参考
- [React 官方文档 - useDeferredValue](https://react.dev/reference/react/useDeferredValue) — API 参考
- [React 官方文档 - useInsertionEffect](https://react.dev/reference/react/useInsertionEffect) — API 参考
- [React 19: What's New (Scrimba)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — React 19.0-19.2 全部新特性概览
