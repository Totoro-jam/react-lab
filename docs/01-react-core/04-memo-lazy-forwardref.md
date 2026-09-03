---
title: "memo / lazy / forwardRef"
---



> 对应源码：[`packages/react/src/ReactMemo.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactMemo.js), [`ReactLazy.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactLazy.js), [`ReactForwardRef.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactForwardRef.js)

## 1. [React.memo](https://react.dev/reference/react/memo)

```javascript
// packages/react/src/ReactMemo.js
export function memo(type, compare) {
  return {
    $$typeof: REACT_MEMO_TYPE,
    type,           // 包装的原始组件
    compare: compare === undefined ? null : compare,
  };
}
```

`memo` 返回的不是新组件——只是一个带 `REACT_MEMO_TYPE` 标记的对象。Reconciler 在 [`createFiberFromElement`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiber.js) 中检测到 `REACT_MEMO_TYPE`，创建 `MemoComponent` (tag=14) 的 Fiber。

在 `beginWork` 中处理 `MemoComponent` 时：

```javascript
// beginWork 中 MemoComponent 的处理逻辑（简化自 ReactFiberBeginWork.js）

// mount（current === null）：
// 如果是简单函数组件且无自定义比较 → 升级为 SimpleMemoComponent (tag=15)
// 如果不是 → 创建新 Fiber 处理

// update（current !== null）：
const hasScheduledUpdate = checkScheduledUpdateOrContext(current, renderLanes);
if (!hasScheduledUpdate) {
  const prevProps = currentChild.memoizedProps;
  // 默认使用 shallowEqual 比较
  let compare = Component.compare;
  compare = compare !== null ? compare : shallowEqual;
  // compare 返回 true（相等）→ bailout！跳过子树
  if (compare(prevProps, nextProps) && /* ref 也没变 */) {
    return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
  }
}
// 否则继续渲染
```

## 2. [React.lazy](https://react.dev/reference/react/lazy)

```javascript
// packages/react/src/ReactLazy.js
export function lazy(ctor) {
  const payload = {
    _status: -1,       // 加载状态：-1=未加载, 0=加载中, 1=完成, 2=失败
    _result: ctor,     // 初始值是 ctor 函数，加载完成后变为模块对象
  };
  return {
    $$typeof: REACT_LAZY_TYPE,
    _payload: payload,  // 加载状态和结果包在 _payload 里
    _init: lazyInitializer, // 初始化函数：调用 _result() 加载模块
  };
}
```

Reconciler 在 `LazyComponent` (tag=16) 的 [`beginWork`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js) 中：

```javascript
const lazyComponent = workInProgress.type;
const payload = lazyComponent._payload;
const init = lazyComponent._init;
if (payload._status === -1) {
  // 首次：调用 _init(payload) 加载模块
  // init 内部调用 payload._result()（即 ctor 函数），拿到 thenable
  init(payload); // 成功后 payload._result 变为模块对象，_status 变为 1
}
// 后续：从 payload._result.default 读取组件，正常渲染
```

## 3. React.forwardRef

```javascript
// packages/react/src/ReactForwardRef.js
export function forwardRef(render) {
  return {
    $$typeof: REACT_FORWARD_REF_TYPE,
    render,  // (props, ref) => ReactElement
  };
}
```

`ForwardRef` (tag=11) 在 `beginWork` 中调用 `render(props, ref)` 而不是普通函数调用——额外传入 `ref` 作为第二参数。

React 19 中 `ref` 可以直接作为普通 prop 传递，`forwardRef` 被简化但保持向后兼容。

## 4. React.lazy 与 Server Components 的关系

React 18 引入的 `React.lazy` 是客户端代码拆分（code splitting）工具，React 19 的 Server Components（RSC）改变了它的适用范围。

### 4.1 核心区别

Server Components **只运行在服务端**，不会作为 JavaScript 发送到浏览器，因此不需要也不应该使用 `React.lazy` 拆分：

| 组件类型 | 是否进入客户端 bundle | 需要 `React.lazy`? | 说明 |
| ---------- | --------------------- | ------------------- | ------ |
| Server Component（App Router 默认） | 否 | 否 | 本身不在 bundle 里 |
| Client Component（`'use client'`）全局使用的 | 是 | 可选 | 重的才值得拆 |
| Client Component 条件渲染的（模态框、图表、编辑器） | 是 | **是** | 高收益拆分点 |
| 路由组件 | 是 | 路由器自动处理 | 每个路由独立包 |

### 4.2 迁移参考

从 `React.lazy` 时代迁移到 RSC 架构时，关键是判断"哪些组件不再需要 lazy"：

```javascript
// ❌ 之前：客户端代码拆分
const ProductList = React.lazy(() => import('./ProductList'));

// ✅ 之后：ProductList 改为 Server Component，自动不进客户端 bundle
// 不需要 React.lazy，也不需要 Suspense
async function Page() {
  const products = await getProducts();  // 服务端直接获取数据
  return <ProductList products={products} />;  // 服务端渲染
}
```

```javascript
// ✅ 仍然需要 React.lazy 的场景：重型的 Client Component
'use client'
import { lazy, Suspense } from 'react'

// 富文本编辑器 200-500KB，条件渲染时节省明显
const RichEditor = lazy(() => import('./RichEditor'))

function App() {
  const [editing, setEditing] = useState(false)
  return (
    <>
      {editing && (
        <Suspense fallback={<div>Loading editor...</div>}>
          <RichEditor />
        </Suspense>
      )}
    </>
  )
}
```

### 4.3 next/dynamic 废弃提示

在 Next.js App Router 中，`next/dynamic` 封装了 `React.lazy` + `Suspense`。但 Next.js [文档](https://nextjs.org/docs/app/guides/lazy-loading) 明确指出：

> Server Components 会自动进行代码拆分，你可以使用流式传输逐步发送 UI。Lazy loading 仅适用于 Client Components。

且 `ssr: false` 选项**只在 Client Component 中有效**，在 Server Component 中使用会报错。

### 4.4 Suspense 边界的复用

`React.lazy` 用的 `<Suspense>` 边界可以被复用于多种新的异步场景，无需为每种场景分别设置边界：

```javascript
// 一个 Suspense 边界同时处理：
// - React.lazy 加载 chunk
// - use() 读取 promise
// - 流式 SSR 等待数据
<Suspense fallback={<Loading />}>
  <LazyChart />        {/* React.lazy */}
  <Profile data={promise} />  {/* use(promise) 暂停 */}
</Suspense>
```

## 下一步

- [React.Children](/01-react-core/05-children) — React.Children 工具方法
- [JSX Transform](/01-react-core/06-jsx-transform) — JSX 编译机制
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — Fiber 如何从 Element 创建

## 参考资料

- [React 官方文档 - memo](https://react.dev/reference/react/memo)
- [React 官方文档 - lazy](https://react.dev/reference/react/lazy)
- [React 源码 ReactMemo.js](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactMemo.js)
- [React 源码 ReactLazy.js](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactLazy.js)
- [Next.js Lazy Loading (官方)](https://nextjs.org/docs/app/guides/lazy-loading) — `next/dynamic` 在 App Router 中的使用
- [Code Splitting and Lazy Loading in React (GreatFrontEnd)](https://www.greatfrontend.com/blog/code-splitting-and-lazy-loading-in-react) — 代码拆分完整指南
- [React 官方文档 - Suspense](https://react.dev/reference/react/Suspense) — Suspense 边界复用
