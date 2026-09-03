---
title: "React 设计哲学：从起源到原则"
---


> 对应源码：[`packages/react/src/`](https://github.com/facebook/react/tree/eafeac097b/packages/react/src), [React Design Principles (官方)](https://legacy.reactjs.org/docs/design-principles.html)

## 1. 故事从一个问题开始

2011 年，Facebook 的广告管理应用正在崩溃——不是因为代码有 bug，而是因为代码本身变得**不可维护**。

应用越加越大，团队越招越多，但每次改动都像在雷区走路——改一个功能，不知道会牵连多少其他地方。他们管这叫"级联更新"（cascading updates）：一个组件的状态变了，触发一连串的预期外反应，像多米诺骨牌。

```
传统前端开发的问题：

  某个广告卡片的数据变了
    → 手动更新卡片标题 DOM
    → 手动更新卡片统计 DOM
    → 手动更新对应的侧边栏
    → 手动更新父列表的计数
    → 发现遗漏了某个 DOM 没有同步
    → 用户看到了不一致的 UI（数据已更新但 DOM 没跟上）
```

这种代码有专有名词——**命令式 DOM 操作**（imperative DOM manipulation）。它要求开发者手动管理："什么时候该改什么 DOM"。

Facebook 的工程师 Jordan Walke 觉得这个问题该换个思路了。

## 2. FaxJS：React 的雏形

早在 2010 年，Facebook 就开发了 **XHP**——一个 PHP 的 C++ 扩展，让你用类似 JSX 的语法写 HTML。XHP 的核心理念是：**HTML 不应该用字符串拼接，而应该用组合（composition）来构建**。XHP 最初由 Marcel Laverdet 等工程师开发，[Our First 50,000 Stars](https://react.dev/blog/2016/09/28/our-first-50000-stars.html) 博文记录了这段历史。

Jordan Walke 受到 XHP 的启发，用 JavaScript 写了一个实验性的框架叫 **FaxJS**。它的核心思路：你不应该手动操作 DOM，你应该描述"UI 应该长什么样"，让框架自己去算怎么改 DOM。

```
命令式思维：               声明式思维：
  获取 DOM 节点              描述 UI 应该是什么样（状态 + 模板）
  修改 innerHTML             框架自动计算 DOM diff
  担心遗漏了哪里              应用最小变更集到真实 DOM
  测试每一个分支              只需测试"状态→UI"的映射
```

FaxJS 后来演变成了 React。2013 年 5 月，Pete Hunt 在 JSConf EU 上发表了题为 ["Reconfiguring Best Practices"](https://www.youtube.com/watch?v=x7cQ3m4K4ro) 的演讲，将 React 正式开源。

那次演讲的核心论点至今仍是 React 的基石：

1. **JSX 不是模板语言**——它就是 JavaScript，JavaScript 本身就是最好的模板语言
2. **虚拟 DOM 不是性能优化**——它是一种架构选择，让 React 可以在不同环境渲染
3. **"脏活"应该交给库**——diff 计算可以自动做，开发者不应该手动操作 DOM

## 3. 十三条设计原则

React 官方的 [Design Principles](https://legacy.reactjs.org/docs/design-principles.html) 文档列出了 React 团队的设计哲学。我们逐条来看——每一条都不是空话，你在源码中都能找到它对应的设计决策。

### 3.1 组合（Composition）

> "The key feature of React is composition of components. Components written by different people should work well together."

React 的第一条原则是组合。你写了一个 `<Button>`，别人写了一个 `<Form>`，任何人都能把 `<Button>` 放进 `<Form>` 里用——不需要知道对方的内部实现。

这条原则解释了为什么 Fiber 架构里每个组件是一个独立的节点（`FiberNode`），而不是一个巨型函数调用。每个 Fiber 节点有自己的状态、自己的优先级、自己的副作用标记——它可以被**独立中断、独立恢复、独立跳过（bailout）**。

```javascript
// FiberNode 的设计体现组合性：
// 每个节点有自己独立的状态，不依赖外部渲染上下文
const fiber = {
  memoizedState: null,   // 自己的 state/hooks
  flags: NoFlags,         // 自己的副作用标记
  lanes: NoLanes,         // 自己的优先级
  alternate: null,        // 自己的双缓冲指针
  child: null,            // 链表而非树——支持独立遍历
  sibling: null,
  return: null,
};
```

### 3.2 公共抽象（Common Abstraction）

> "If we notice that many components implement a certain feature in incompatible or inefficient ways, we might prefer to bake it into React."

React 不会什么都做——如果一个功能大家用得一致、实现得好，它就留在用户代码里。只有当大家各自实现的版本不兼容或效率低时，React 才会将其吸收到核心中。

这就是为什么 `useState`/`useEffect` 是 React 内置的——不是文过饰非，而是因为在函数组件中管理状态歧出百态，React 需要一个统一的抽象。

同理，Hooks 在 16.8 引入也是因为类组件的 lifecycle、HOCs、render props 都在用各自的方式处理"副作用的抽象"，但这些方式互不兼容，混合起来非常混乱。

### 3.3 逃生通道（Escape Hatches）

> "React is pragmatic. It is driven by the needs of products. If some pattern is hard to express declaratively, we will provide an imperative API."

React 偏好声明式，但当声明式无法表达某些必要模式时，React 提供逃生通道：

| 逃生通道 | 解决的问题 | 源码位置 |
| ---------- | ----------- | --------- |
| `useRef` | 声明式模型不适合可变值引用 | `ReactFiberHooks.js: mountRef` |
| `flushSync` | 需要同步刷新，绕过 batching | `react-dom/src/ReactDOMFlushSync.js` |
| `useSyncExternalStore` | 外部 store 在并发渲染时防止 tearing | `ReactFiberHooks.js: mountSyncExternalStore` |
| `useEffectEvent` | Effect 中需要"只读最新值"，不触发重渲染 | `ReactFiberHooks.js: mountEvent` |
| `flushPassiveEffects` | 测试中手动执行 passive effects | `ReactFiberWorkLoop.js` |
| `unstable_batchedUpdates` | React 18 之前手动批处理（已自动） | `legacy-react/` |

设计哲学是：**如果某个模式有用但难以声明式表达，宁可临时提供可替换的命令式 API，也不要浪费一年时间追求完美的声明式 API**。

### 3.4 稳定性（Stability）

> "We value API stability. But stability in the sense of 'nothing changes' is overrated. It quickly turns into stagnation."

React 的稳定性哲学不是"永远不变"，而是"变了就有清晰的迁移路径"。

典型例子：

- React 16：旧的生命周期钩子（`componentWillMount` 等）被标记为 `UNSAFE_`，Codemod 自动迁移
- React 17：`ReactDOM.render` 被废弃，但一直保留到 React 19 才禁止，给足迁移时间
- React 18：`unstable_batchedUpdates` 变为自动批处理，旧 API 仍然兼容
- React 19：`forwardRef` 被简化（ref 可以直接作为 prop 传递），但保留向后兼容

在源码中，这种稳定性体现为 feature flags：

```javascript
// packages/shared/ReactFeatureFlags.js
export const disableLegacyMode: boolean = true;
// disableLegacyMode 在 React 19 中为 true → LegacyRoot 已禁用
// 但在 Meta 内部 Native 平台仍为 false → 渐进迁移中
```

### 3.5 互操作性（Interoperability）

> "We place high value in interoperability with existing systems and gradual adoption."

Facebook 自己就有非 React 的代码——XHP 系统、其他 UI 库、各种遗留代码。React 必须能和它们共存。

这就是为什么 React 有 `dangerouslySetInnerHTML`（直接设置 innerHTML 的逃生通道）、有 Portal（可以把组件渲染到 DOM 树的任何位置）、有 `flushSync`（可以脱离 batching 框架直接刷新）。

### 3.6 调度（Scheduling）

> "React is not a generic data processing library. It is a library for building user interfaces. We think that it is uniquely positioned in an app to know which computations are relevant right now."

这是 Fiber 架构的魂。React 不是"数据变了立刻渲染"，而是"数据变了**什么时候**渲染由 React 决定"。

```
Push 模型（多数响应式框架）：   Pull 模型（React）：
  数据变化 → 立刻推送更新          数据变化 → 调度更新
  用户无法控制时机                  React 决定什么时候执行
  无法批处理                        可以批量合并
  无法优先级排序                    可以高优先级打断低优先级
  无法暂停                          可以暂停 + 恢复
```

这就是为什么 `setState` 是"异步"的——实际它不是异步操作，而是**调度**：你提出"我想更新状态"的请求，React 决定什么时候执行。

在源码中，这体现在 `scheduleUpdateOnFiber(root, fiber, lane)` → `ensureRootIsScheduled(root)`：更新先入队，再根据优先级决定何时处理。

### 3.7 开发者体验（Developer Experience）

React 在开发模式下有大量的 console.warn，这些警告在 production 被剥离。这是有意识的工程决策——开发慢一点没关系，但开发时能发现常见错误无比重要。

参见 `packages/react/src/ReactHooks.js: resolveDispatcher`：开发模式下 `dispatcher === null` 会 `console.error`，但生产模式直接返回 null 让后续代码自然报 TypeError（避免热路径上做额外检查）。

### 3.8 调试（Debugging）

> "Props and state are those breadcrumbs."

React 的调试哲学：任何 UI 状态都可以追溯到 props 和 state。如果 UI 错了，你只需要看 props 和 state 对不对。

这就是为什么 Fiber 不把状态藏在闭包里——而是放在 `memoizedState`、`memoizedProps` 字段上，DevTools 可以直接读取。

### 3.9 不做全局配置（No Global Configuration）

> "We find global runtime configuration options to be problematic."

React 没有类似 `React.configure(options)` 的 API。配置全部在**构建时**完成（development / production build flag）。这确保了多个 React 应用可以嵌套运行而不互相干扰。

### 3.10 跨平台（Beyond the DOM）

> "Being renderer-agnostic is an important design constraint of React."

这就是为什么有 `HostConfig` 抽象——React DOM、React Native、React ART 各自提供自己的 `createInstance`、`commitUpdate` 等实现。Reconciler 本身不知道"什么是 DOM"。

### 3.11 实现简洁优先（Implementation）

> "We prefer boring code to clever code. Code is disposable and often changes."

这一条决定了 React 源码的风格——**冗长但好读**。你会看到很多看似"啰嗦"的代码，比如手动遍历链表而不是用 `Array.map`（因为要可暂停），大量 if/else 而不是函数式链式调用。这些都是有意的：在有 5 万个组件的 Facebook 代码库中，可维护性比优雅性更重要。

### 3.12 工具友好（Optimized for Tooling）

这就是为什么 API 名字那么长——`componentDidMount` 而不是 `didMount`，`dangerouslySetInnerHTML` 而不是 `setHTML`。为了在全代码库中能精确搜索到所有使用点，便于 Codemod 自动迁移。

### 3.13 内部 Dogfooding

> "Heavy internal usage gives us the confidence that React won't disappear tomorrow."

React 首先是 Facebook 自己在用——5 万个组件、每天数亿用户。它不会因为社区热度退潮而消失。

## 4. 两个 React：客户端 vs 服务端

Dan Abramov 在 ["The Two Reacts"](https://overreacted.io/the-two-reacts/) 一文中提出了一个关键洞察：

```
React 的"真正"公式：UI = f(data, state)

"客户端" React：UI = f(state)
  → 组件跑在用户设备上
  → 可以直接读取本地 state（如点击计数、输入文字）
  → 响应即时，无网络往返

"服务端" React：UI = f(data)
  → 组件跑在服务器上
  → 可以直接读取服务器文件、数据库
  → 渲染完成后只把 UI 发给客户端（不是数据 + 组件代码）

Server Components 让两种 React 可以混合使用：
  服务端组件跑完 → 把 UI 结果（不是数据）传给客户端
  客户端组件接手处理交互 → 重新调用服务端组件获取新 UI
```

这就是 RSC 的理论框架——不是简单的"在服务端渲染"，而是**两种不同的运行时**可以无缝组合。

## 5. "YAGNI" 与实用主义

React 有一种"到了再加"的实用主义精神：

- Fiber 在 2016 年设计时就预留了并发能力，但到 2022 年才启用（React 18）
- Lanes 模型在 React 17 内部已实现，但 18 才暴露给用户
- `lazy` 在 2018 加了，但 `use` 到 2024 才正式提供替代
- Error Boundaries 用 class 组件特性（不能直接 try/catch render），不是任意函数
- Hooks 花了好几年实验，16.8 才正式发布

不是懒——是**完美主义会毁掉项目**。先发"够好"的版本，等积累了大量真实使用数据，再决定下一个大改动。

这种精神在源码中的表现是大量的 `enableXxx` feature flags：

```javascript
// packages/shared/ReactFeatureFlags.js
export const enableViewTransition: boolean = true;                // 视图过渡主体已启用
export const enableViewTransitionParentEnterExit = __EXPERIMENTAL__; // 父级 enter/exit 仍在实验
export const enableGestureTransition = __EXPERIMENTAL__;           // 手势过渡仍在实验
export const enableAsyncDebugInfo: boolean = true;                // 异步调试信息
export const enableTransitionTracing: boolean = false;             // Transition 追踪
```

## 6. React Foundation：治理独立化

2025 年 10 月，在 React Conf 上宣布 React 项目将转移至 **[React Foundation](https://react.dev/blog/2025/10/07/introducing-the-react-foundation)**——由 Linux Foundation 托管的独立基金会。[2026 年 2 月正式成立](https://react.dev/blog/2026/02/24/the-react-foundation)。

React 不再只是 Meta 的项目。治理由社区驱动的委员会负责，八个铂金成员（Amazon、Callstack、Expo、Huawei、Meta、Microsoft、Software Mansion、Vercel）共同参与。业务治理与技术治理分离——技术方向独立于基金会董事会。详见 [架构演进 §11](./01-architecture-evolution.md#_11-react-foundation-治理独立化)。

React 项目目前的最新版本（截至 2026 年 8 月）：

- React 19.2.7（stable channel）— 2026 年 6 月发布
- React 19.3.0（开发中，源码中的 `ReactVersion`）— 未来版本
- Canary / Experimental 通道有更多实验特性（View Transitions、Fragment Refs）

## 下一步

- [版本演进历史](/00-overview/05-version-history) — React 从 2013 到 2026 的完整版本演进时间线
- [关键设计决策](/00-overview/06-design-decisions) — 七个关键设计决策的"为什么"
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — 这些原则在 Fiber 架构中的具体落地

## 参考资料

- [React Design Principles (官方)](https://legacy.reactjs.org/docs/design-principles.html) — ★ React 团队官方设计哲学文档，十三条原则的权威来源
- [The Two Reacts (Dan Abramov)](https://overreacted.io/the-two-reacts/) — ★ UI = f(data, state) 的双 React 心智模型
- [Before You memo() (Dan Abramov)](https://overreacted.io/before-you-memo/) — ★ 组合模式的性能含义，为 React Compiler 设计埋下伏笔
- [React as a UI Runtime (Dan Abramov)](https://overreacted.io/react-as-a-ui-runtime/) — ★ 从 runtime 而非 library 的角度理解 React
- [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture) — Fiber 的原始设计文档，包含调度设计理由
- [The History of React.js on a Timeline (RisingStack)](https://blog.risingstack.com/the-history-of-react-js-on-a-timeline/) — ★ React 2010-2024 的完整历史时间线
- [React Labs: View Transitions, Activity, and more (官方博客)](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) — 2025 实验特性公告
- [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — Activity、useEffectEvent、Partial Pre-rendering、Performance Tracks
- [Introducing the React Foundation (官方)](https://react.dev/blog/2025/10/07/introducing-the-react-foundation) — Foundation 宣告
- [The React Foundation 正式成立 (官方)](https://react.dev/blog/2026/02/24/the-react-foundation) — 八个铂金成员、正式成立
- [React 19: What's New for Developers (Scrimba, 2026)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — ★ 2026 年视角的 React 19 特性完整状态表
- [What's new in React 19.1.0 (Medium)](https://medium.com/@onix_react/whats-new-in-react-19-1-0-d87dda0905a9) — Owner Stacks、Suspense 改进
- [React 19.2, Simply Explained (Medium)](https://medium.com/@natanael280198/react-19-2-simply-explained-630f158688b9) — 19.2 特性的简要说明
- [How Does setState Know What to Do? (Dan Abramov)](https://overreacted.io/how-does-setstate-know-what-to-do/) — 依赖注入设计思想
- [Why Do React Elements Have a $$typeof Property? (Dan Abramov)](https://overreacted.io/why-do-react-elements-have-typeof-property/) — 安全设计哲学
- [Goodbye, Clean Code (Dan Abramov)](https://overreacted.io/goodbye-clean-code/) — 实用主义 vs 理想主义
- [The Elements of UI Engineering (Dan Abramov)](https://overreacted.io/the-elements-of-ui-engineering/) — UI 工程的第一性问题
- [A Complete Guide to useEffect (Dan Abramov)](https://overreacted.io/a-complete-guide-to-useeffect/) — Effect 的设计理念和常见误区
- [How Are Function Components Different from Classes? (Dan Abramov)](https://overreacted.io/how-are-function-components-different-from-classes/) — 函数组件 vs 类的设计权衡
- [Why Do React Hooks Rely on Call Order? (Dan Abramov)](https://overreacted.io/why-do-react-hooks-rely-on-call-order/) — Hooks 顺序依赖的设计原因
- [JSX Over The Wire (Dan Abramov)](https://overreacted.io/jsx-over-the-wire/) — RSC 序列化格式的设计理念
- [Progressive JSON (Dan Abramov)](https://overreacted.io/progressive-json/) — 流式 JSON 的设计哲学
- [How Imports Work in RSC (Dan Abramov)](https://overreacted.io/how-imports-work-in-rsc/) — RSC 模块加载机制
- [What Does "use client" Do? (Dan Abramov)](https://overreacted.io/what-does-use-client-do/) — 指令边界的设计
