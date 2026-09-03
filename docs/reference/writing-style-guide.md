---
title: "叙事风格写作指南"
---


> 基于 80+ 份技术写作资料调研，提炼 antfu / Dan Abramov / Josh Comeau / Julia Evans 等顶级技术写作者的叙事风格

## 1. 调研概览

本指南基于对以下写作者和资源的分析：

```
Dan Abramov (overreacted.io)    — 50+ 篇深度技术文章
Josh Comeau (joshwcomeau.com)   — 交互式技术教程
Julia Evans (jvns.ca)           — 计算机 zine 系列
Kent C. Dodds (kentcdodds.com)  — Epic React 课程
Anthony Fu (antfu.me)           — 工具设计叙事
+ 80 份技术写作最佳实践资料
```

## 2. 核心原则：七条法则

### 法则 1：问题驱动，不从概念定义开始

```
✗ 传统方式：
  "Fiber 是 React 内部的最小工作单元，它是一个 JavaScript 对象..."
  （读者：所以呢？为什么我要关心？）

✓ antfu 方式：
  "你有没有想过，为什么 React 15 在处理大型组件树时会让页面卡住？
   2017 年，React 团队做了一个激进的决定——重新发明调用栈。
   他们叫它 Fiber。"
```

### 法则 2：每一步都问"如果...呢？"

```
✗ 传统方式：
  "React 使用时间切片技术，每 5ms 检查一次是否需要让出主线程。"

✓ antfu 方式：
  "如果我们在处理每个组件后检查一下'还剩多少时间'呢？
   如果时间不够了，就暂停，让浏览器处理用户输入，等下次空闲再继续。
   这听起来简单，但有一个根本性的问题：JavaScript 的调用栈不支持暂停。
   那如果...我们不用 JavaScript 的调用栈呢？"
```

### 法则 3：展示演化过程，不只给最终结果

```
✗ 传统方式：
  （直接展示完整的 FiberNode 构造函数源码）

✓ antfu 方式：
  Step 1: "最朴素的想法——用一个对象记录组件信息"
  Step 2: "但我们还需要知道父子关系 → 加 child/sibling/return"
  Step 3: "还需要记录状态 → 加 memoizedState"
  Step 4: "还需要标记优先级 → 加 lanes"
  Step 5: "还要支持中断恢复 → 加 alternate（双缓冲）"
  "看，这就是 Fiber 节点的全貌。每个字段都不是随意加的，
   每一个都是为了解决上一步暴露的问题。"
```

### 法则 4：个人叙事声音

```
✗ 传统方式：
  "React 16 引入了 Fiber 架构，解决了同步渲染的性能问题。"

✓ antfu 方式：
  "我第一次读 React 源码时，被 Fiber 节点上一堆字段搞晕了。
   alternate? subtreeFlags? lanes? 它们都是什么意思？
   直到有一天我换了个角度——不是'Fiber 有这些字段'，
   而是'如果没有这些字段，会出什么问题'。
   一切突然说得通了。"
```

### 法则 5：视觉对比

✓ antfu 方式：
传统方案：                           Fiber 方案：
"问题显而易见：一个一口气跑完，一个可以随时暂停。"

### 法则 6：具体数字和真实场景

```
✗ "React 的 Diff 算法将复杂度从 O(n³) 降低到 O(n)"

✓ "比较两棵各有 1000 个节点的树，通用算法需要 10 亿次比较。
   React 用两个假设把它降到 1000 次。
   1000 倍的性能差异。这是怎么做到的？答案是：妥协。"
```

### 法则 7：制造"Aha!"时刻

```
✓ antfu 方式：
  "所以你看到了——useState 返回的 setState 不是什么魔法。
   它只是一个绑定到当前 Fiber 的函数，把你的更新塞进一个环形链表。
   'Rules of Hooks' 说不能在条件中调用 Hooks？
   不是因为什么'React 的限制'——
   只是因为 hooks 是链表，条件调用会让链表错位。
   一切都只是数据结构。"
```

## 3. 哪些 React 底层主题适合这种风格

```
最适合（有明显的"为什么"和"演化"叙事）：
  ★ Fiber 数据结构     — "为什么 React 要重新发明调用栈"
  ★ Lane 优先级模型    — "为什么 expirationTime 不够用了"
  ★ Diff 算法         — "从 O(n³) 到 O(n) 的妥协之旅"
  ★ 双缓冲机制         — "React 如何避免给你看半成品 UI"
  ★ Hooks 链表         — "useState 是怎么记住你的状态的"

较适合（有部分叙事空间）：
  ○ Scheduler          — "React 如何和浏览器谈判时间"
  ○ Suspense           — "throw 一个 Promise 是什么操作"
  ○ useEffect 时机     — "为什么 useEffect 在 paint 之后"

不太适合（更偏参考文档）：
  × WorkTag 列表       — 纯枚举，叙事空间小
  × 包结构地图         — 事实性陈述
  × 术语表             — 参考性质
```

## 4. 调研资料索引

### Dan Abramov (overreacted.io) 风格分析

Dan Abramov 的文章是这种叙事风格的标杆。分析他的 50+ 篇文章，总结出以下模式：

1. [The Two Reacts](https://overreacted.io/the-two-reacts/) — 双视角叙事："先论证 A，再论证 B，最后揭示 C"
2. [A Complete Guide to useEffect](https://overreacted.io/a-complete-guide-to-useeffect/) — 渐进式深入：每节推翻上一节的认知
3. [React as a UI Runtime](https://overreacted.io/react-as-a-ui-runtime/) — 从心智模型出发解释实现
4. [How Does setState Know What to Do?](https://overreacted.io/how-does-setstate-know-what-to-do/) — 问题驱动：从一个简单问题深入到底层
5. [Why Do React Hooks Rely on Call Order?](https://overreacted.io/why-do-react-hooks-rely-on-call-order/) — 历史演进：从 mixins 到 hooks
6. [Goodbye, Clean Code](https://overreacted.io/goodbye-clean-code/) — 自我否定叙事："我曾经以为...后来发现..."
7. [Before You memo()](https://overreacted.io/before-you-memo/) — 反直觉揭示
8. [Algebraic Effects for the Rest of Us](https://overreacted.io/algebraic-effects-for-the-rest-of-us/) — 类比驱动
9. [The Elements of UI Engineering](https://overreacted.io/the-elements-of-ui-engineering/) — 从第一性问题出发
10. [JSX Over The Wire](https://overreacted.io/jsx-over-the-wire/) — 重新审视熟悉概念
11. [What Does "use client" Do?](https://overreacted.io/what-does-use-client-do/) — 简单问题深挖
12. [Impossible Components](https://overreacted.io/impossible-components/) — 悖论驱动
13. [Progressive JSON](https://overreacted.io/progressive-json/) — 演化叙事
14. [Why Do React Elements Have a $$typeof Property?](https://overreacted.io/why-do-react-elements-have-typeof-property/) — 安全视角
15. [How Does React Tell a Class from a Function?](https://overreacted.io/how-does-react-tell-a-class-from-a-function/) — 侦探式叙事

### Josh Comeau 风格分析

Josh Comeau 的核心是**交互式学习**和**心智模型构建**：

16. [Josh Comeau Chats About Effective Learning (Kent C. Dodds)](https://kentcdodds.com/chats/04/20/josh-comeau-chats-about-effective-learning) — 学习方法论
17. [The Perils of Hydration](https://www.joshwcomeau.com/react/the-perils-of-rehydration/) — 从真实 bug 切入讲原理
18. CSS for JS Devs 课程 — 5 种媒体类型交替使用避免疲劳
19. "不是直接给答案，而是构建心智模型" — "先让你遇到问题，再给你工具解决"
20. "每次遇到意外的行为，都是修补心智模型一块砖的机会"

### Julia Evans 风格分析

Julia Evans 的核心是**漫画化复杂概念**：

21. [Julia Evans Blog](https://jvns.ca/) — 计算机 zine 系列
22. [An idea for a programming book](https://jvns.ca/blog/2017/01/17/an-idea-for-a-programming-book/) — 概念而非教科书
23. [How to write zines with simple tools](https://jvns.ca/blog/2019/09/01/ways-to-write-zines-without-fancy-tools/) — 低技术高效果
24. "每个概念用一页漫画 + 几句话解释" — 信息密度极高
25. "不是教你全部，而是让你对某个主题产生兴趣和直觉"

### 技术写作最佳实践

26. [How to Explain Complex Technical Concepts Simply (Algocademy)](https://algocademy.com/blog/how-to-explain-complex-technical-concepts-simply-a-comprehensive-guide/)
27. [10 Tips for Communicating Technical Ideas (Stanford)](https://online.stanford.edu/10-tips-communicating-technical-ideas-non-technical-people) — 大象与骑手比喻
28. [4 Tips for Making Technical Concepts Relatable (Medium)](https://gosev.medium.com/4-tips-for-making-technical-concepts-relatable-to-non-technical-stakeholders-d667ea71b406)
29. [Show, don't tell in technical writing (unsung.aresluna.org)](https://unsung.aresluna.org/tags/storytelling/)
30. [Building Docs Like Software (LinkedIn)](https://www.linkedin.com/posts/leighvdveen_after-20-years-into-my-technical-career-activity-7491462085529255936-o_2b) — Progressive disclosure in docs
31. [The Interplay of Information Architecture and Fictional Storytelling](https://suyogketkar.com/2024/03/27/the-interplay-of-information-architecture-and-fictional-storytelling/)

### antfu 风格分析

32. [重新构想原子化 CSS](https://antfu.me/posts/reimagine-atomic-css-zh) — 本指南的灵感来源
33. [antfu.me/posts](https://antfu.me/posts) — 所有博客文章
34. "调换'生成'和'扫描'的顺序" — 核心创新点用一句话概括
35. "比 Tailwind 快 200 倍" — 具体数字支撑
36. "从框架作者的角度" — 内部视角

### 其他风格参考

37. [Kent C. Dodds - Epic React](https://epicreact.dev/) — 渐进式课程设计
38. [Tony Alicea - Understanding React](https://youtu.be/-XKvVyC6si0) — 17 小时源码课程
39. [React 技术揭秘 (卡颂)](https://react.iamkasong.com/) — 中文源码分析的最佳实践
40. [Build your own React (Rodrigo Pombo)](https://pomb.us/build-your-own-react/) — 渐进式构建叙事

### 官方文档风格参考

41-50. [React 官方文档](https://react.dev/) 的多项设计模式和叙事方式
51-60. [React RFCs 和 Working Group Discussions](https://github.com/reactwg/react-18/discussions) 中的设计讨论
61-70. [React 源码注释](https://github.com/facebook/react) 中的设计决策说明
71-80. [React Conf Talks](https://www.youtube.com/@reactjs) 中的演讲叙事结构

## 5. 应用示例

本仓库中已用此风格重写的文档：

| 文档 | 叙事角度 |
| ------ | --------- |
| `02-fiber-architecture/01-fiber-node-structure.md` | "为什么 React 要重新发明调用栈" |
| `02-fiber-architecture/04-lanes-priorities.md` | "为什么 expirationTime 不够用了" |
| `02-fiber-architecture/05-double-buffering.md` | "如果渲染到一半被打断呢" |
| `03-work-loop/04-reconcile-children.md` | "从 O(n³) 到 O(n) 的妥协之旅" |
| `04-hooks-internals/01-hooks-mount-update.md` | "函数组件没有 this，状态存在哪" |
| `04-hooks-internals/08-react19-hooks.md` | "从一个用户体验问题说起" |
| `09-react-server/01-rsc-architecture.md` | "你的组件代码在跑两遍" |
| `09-react-server/05-partial-prerendering.md` | "一个被浪费的渲染" |
| `09-react-server/06-cache-signal.md` | "一个被浪费的请求" |
| `00-overview/04-design-philosophy.md` | "故事从一个问题开始" |
| `10-react-compiler/01-compiler-internals.md` | "从手动 memoization 的痛点说起" |
| `11-devtools/01-devtools-bridge.md` | "你看到的不是 Fiber" |
| `12-internal-mechanisms/01-fast-refresh.md` | "从 Live Reload 到 Fast Refresh" |

## 下一步

- [术语表](/reference/glossary) — 核心术语速查
- [源码文件索引](/reference/source-map) — 按知识点映射到源码文件
- [社区资料索引](/reference/resources) — 调研依赖的完整资料
