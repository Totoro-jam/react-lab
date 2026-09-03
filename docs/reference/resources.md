---
title: "社区高质量资料索引"
---


> 本索引精选仓库调研依赖的核心社区资料，按主题分类。完整资料数（含各文档内联引用）见 [仓库 README 内容统计](https://github.com/Totoro-jam/react-lab#内容统计)。

## 1. React 官方资源

1. [React 官方文档](https://react.dev/) — 最新官方文档
2. [React v18.0 Blog](https://legacy.reactjs.org/blog/2022/03/29/react-v18.html) — React 18 发布说明
3. [React Design Principles](https://legacy.reactjs.org/docs/design-principles.html) — 设计原则
4. [React Basic Theoretical Concepts](https://github.com/reactjs/react-basic) — 理论概念
5. [React Components, Elements, and Instances (Dan Abramov)](https://legacy.reactjs.org/blog/2015/12/18/react-components-elements-and-instances.html)
6. [Reconciliation (官方文档)](https://legacy.reactjs.org/docs/reconciliation.html) — Diff 算法说明
7. [React 18 Working Group](https://github.com/reactwg/react-18/discussions) — RFC 和讨论
8. [Suspense RFC](https://github.com/reactjs/rfcs/blob/main/text/0213-suspense-in-react-18.md)
9. [New Suspense SSR Architecture](https://github.com/reactwg/react-18/discussions/37)
10. [Automatic Batching Discussion](https://github.com/reactwg/react-18/discussions/21)
11. [React Hooks Reference](https://react.dev/reference/react)
12. [React 19 Blog](https://react.dev/blog) — React 19 新特性

## 2. Fiber 架构核心分析

13. [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture) — ★ Fiber 架构设计文档（原作者）
14. [Inside Fiber: in-depth overview (Max Koretskyi)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — ★★★ 最详细的源码分析
15. [The how and why on React's usage of linked list in Fiber (Max Koretskyi)](https://blog.ag-grid.com/the-how-and-why-on-reacts-usage-of-linked-list-in-fiber/)
16. [Understanding React's Fiber Architecture (Tejas Kumar)](https://gitnation.com/contents/understanding-reacts-fiber-architecture) — 演讲
17. [A deep dive into React Fiber and source code (Reddit)](https://www.reddit.com/r/reactjs/comments/14pj7ej/a_deep_dive_into_react_fiber_and_source_code/)
18. [I Built React from Scratch and Discovered Why Fiber Changes Everything](https://medium.com/@jsmmkt123/i-built-react-from-scratch-and-discovered-why-fiber-changes-everything-8a1504ed1b94)

## 3. 中文源码分析

19. [React 技术揭秘 (卡颂)](https://react.iamkasong.com/) — ★★★ 最佳中文 React 源码教程
20. [浅谈对 React Fiber 的理解 (Jacky-Summer)](https://github.com/Jacky-Summer/personal-blog/blob/master/React系列/浅谈对%20React%20Fiber%20的理解.md)
21. [React Fiber 架构：从原理到实践的全面解析 (知乎)](https://zhuanlan.zhihu.com/p/1905658241603606091)
22. [React Fiber 架构解析 (xypisces)](https://xypisces.github.io/guide/fiber.html)

## 4. Hooks 实现分析

23. [Making Sense of React Hooks (Dan Abramov)](https://medium.com/@dan_abramov/making-sense-of-react-hooks-fdbde8803889) — ★ Hooks 设计动机
24. [Under the hood of React's hooks system (Eytan Manor)](https://the-guild.dev/blog/react-hooks-system) — ★★ Hooks 源码分析
25. [A journey through the implementation of useState (Carl Mungazi)](https://www.newline.co/@CarlMungazi/a-journey-through-the-usestate-hook--a4983397)
26. [How many of you know how react hooks work under the hood (Reddit)](https://www.reddit.com/r/reactjs/comments/1aekfec/how_many_of_you_know_how_react_hooks_work_under/)

## 5. Lane 优先级模型

27. [What are Lanes in React source code? (JSer.dev)](https://jser.dev/react/2022/03/26/lanes-in-react/) — ★★★ Lane 模型最佳分析
28. [React 源码 ReactFiberLane.js](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js)

## 6. Scheduler 调度器

29. [Min Heap implementation in Scheduler (Reddit)](https://www.reddit.com/r/reactjs/comments/coiz7p/min_heap_implementation_in_shared_scheduler/)
30. [Implementing a Priority-Based Scheduler (Grasp)](https://paths.grasp.study/modules/bca60c95-4be6-4515-9331-c6179738e476/lessons/c454cc35-0afe-4b45-b373-0c7e04c1de06)
31. [React Scheduler 源码](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js)

## 7. 并发特性

32. [React 19 Concurrent Rendering Deep Dive (JSManifest)](https://medium.com/@jsmanifest/react-19-concurrent-rendering-deep-dive-actions-transitions-and-suspense-in-production-0ae9199fa95f)
33. [Selective Hydration (patterns.dev)](https://www.patterns.dev/react/react-selective-hydration/)
34. [React Design Principles - Scheduling](https://legacy.reactjs.org/docs/design-principles.html)

## 8. 事件系统

35. [Events in React: What Do They Do? (Trabe)](https://medium.com/trabe/events-in-react-what-do-they-do-do-they-do-things-lets-find-out-9f1ac743b4c7) — ★
36. [Getting to know React DOM's event handling system (Eytan Manor)](https://the-guild.dev/blog/react-dom-event-handling-system) — ★★
37. [The React and React Native Event System Explained](https://levelup.gitconnected.com/how-exactly-does-react-handles-events-71e8b5e359f2)
38. [How react events are different from Javascript (Reddit)](https://www.reddit.com/r/reactjs/comments/u3jfum/how_react_events_are_different_from_javascript/)

## 9. Diff 算法

39. [React reconciliation and diffing algorithm (Shihara Dilshan)](https://shiharadilshan.medium.com/react-reconciliation-and-diffing-algorithm-5faa9531175)
40. [Deconstructing React / Virtual DOM and Diff Algorithm (Tiark Rompf)](https://tiarkrompf.github.io/notes/?/deconstructing-react/aside3)
41. [Virtual DOM and Reconciliation Algorithm (Rohan Paul)](https://github.com/rohan-paul/Awesome-JavaScript-Interviews/blob/master/React/Virtual-DOM-and-Reconciliation-Algorithm.md)

## 10. SSR / Hydration

42. [The Perils of Hydration (Josh Comeau)](https://www.joshwcomeau.com/react/the-perils-of-rehydration/) — ★★★
43. [Understanding React Server Components (Tony Alicea)](https://tonyalicea.dev/blog/understanding-react-server-components/) — ★★★ RSC 最佳分析

## 11. RSC / Flight

44. [Understanding React Server Components (Tony Alicea)](https://tonyalicea.dev/blog/understanding-react-server-components/)
45. [React 19 Deep Dive (QED42)](https://www.qed42.com/insights/reacts-latest-evolution-a-deep-dive-into-react-19)
46. [RSC Payload Parser (Alvar Lagerlöf)](https://github.com/alvarlagerlof/rsc-parser)

## 12. React Compiler

47. [I tried React Compiler today (Nadia Makarevich)](https://www.developerway.com/posts/i-tried-react-compiler) — ★★★
48. [React Compiler: In-Depth (Jack Herrington)](https://www.youtube.com/watch?v=vyXuS740JgQ)
49. [React Compiler Deep Dive (Sathya Gunasekaran)](https://www.youtube.com/watch?v=O8Pv6Z1JgTM)
50. [With the new React Forget compiler handling memoization (Reddit)](https://www.reddit.com/r/reactjs/comments/1rg7wqj/with_the_new_react_forget_compiler_handling/)

## 13. 手写 React

51. [Build your own React (Rodrigo Pombo)](https://pomb.us/build-your-own-react/) — ★★★ 最佳手写教程
52. [Didact GitHub Repo](https://github.com/pomber/didact)

## 14. 综合分析 / 演讲

53. [Understanding React Course (Tony Alicea)](https://youtu.be/-XKvVyC6si0) — 17 小时源码课程
54. [React Conf 2021 Keynote](https://www.youtube.com/watch?v=LGTwZBDIbbQ)
55. [What's Next for React (ReactNext 2016)](https://www.youtube.com/watch?v=LGTwZBDIbbQ)

## 15. 官方源码与仓库

56. [React GitHub Repository](https://github.com/facebook/react)
57. [React WorkTags.js 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactWorkTags.js)
58. [React FiberNode 构造函数源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiber.js)
59. [React WorkLoop 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberWorkLoop.js)
60. [React BeginWork 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js)
61. [React CompleteWork 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCompleteWork.js)
62. [React CommitWork 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberCommitWork.js)
63. [React ChildFiber / Diff 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactChildFiber.js)
64. [React Hooks 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberHooks.js)
65. [React FiberLane 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberLane.js)
66. [React FiberFlags 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberFlags.js)
67. [React InternalTypes 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactInternalTypes.js)
68. [React FiberThrow 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberThrow.js)
69. [React FiberRootScheduler 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberRootScheduler.js)
70. [React Reconciler README](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/README.md)
71. [Scheduler 源码](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/forks/Scheduler.js)
72. [SchedulerMinHeap 源码](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerMinHeap.js)
73. [SchedulerPriorities 源码](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerPriorities.js)
74. [SchedulerFeatureFlags 源码](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerFeatureFlags.js)
75. [ReactFiberConfigDOM 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js)
76. [ReactBaseClasses 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactBaseClasses.js)
77. [ReactHooks 入口源码](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactHooks.js)
78. [ReactContext 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactContext.js)
79. [ReactMemo 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactMemo.js)
80. [ReactLazy 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactLazy.js)
81. [ReactForwardRef 源码](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactForwardRef.js)
82. [react-noop-renderer](https://github.com/facebook/react/tree/eafeac097b/packages/react-noop-renderer)
83. [fiber-debugger fixture](https://github.com/facebook/react/tree/eafeac097b/fixtures/fiber-debugger)
84. [concurrent fixtures](https://github.com/facebook/react/tree/eafeac097b/fixtures/concurrent)
85. [React Feature Flags](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactFeatureFlags.js)
86. [React Symbols](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactSymbols.js)
87. [React Shared Internals](https://github.com/facebook/react/blob/eafeac097b/packages/shared/ReactSharedInternals.js)

## 16. React Foundation 与版本历史

88. [Introducing the React Foundation (官方博客)](https://react.dev/blog/2025/10/07/introducing-the-react-foundation) — 宣告，七家创始成员
89. [The React Foundation 正式成立 (官方博客)](https://react.dev/blog/2026/02/24/the-react-foundation) — 八个铂金成员，正式成立
90. [Linux Foundation 新闻稿](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-react-foundation) — 完整成员名单、Seth Webster
91. [Meta 工程博客](https://engineering.fb.com/2025/10/07/open-source/introducing-the-react-foundation-the-new-home-for-react-react-native/) — 五年 $3M+ 承诺
92. [React Foundation 官网](https://react.foundation/about) — 治理、RIS、CoIS 倡议
93. [React 19.1 Changelog (GitHub)](https://github.com/facebook/react/blob/eafeac097b/CHANGELOG.md) — Owner Stacks、Enhanced Suspense、unstable_prerender
94. [React 19.2 Blog (官方)](https://react.dev/blog/2025/10/01/react-19-2) — Activity、useEffectEvent、PPR
95. [React 19.2 Changelog (GitHub)](https://github.com/facebook/react/blob/eafeac097b/CHANGELOG.md) — 版本细节

## 17. Next.js 16 Cache Components / PPR

96. [Next.js Caching (官方文档)](https://nextjs.org/docs/app/getting-started/caching) — cacheComponents、'use cache'
97. [use cache 指令 (官方 API)](https://nextjs.org/docs/app/api-reference/directives/use-cache) — cacheLife / cacheTag
98. [cacheComponents 配置 (官方)](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
99. [Next.js 16 Deep Dive: Caching (Medium)](https://medium.com/@sureshdotariya/next-js-16-deep-dive-understanding-the-new-caching-architecture-574041fe7c6d) — 缓存架构深度分析
100. [Next.js Lazy Loading (官方)](https://nextjs.org/docs/app/guides/lazy-loading) — RSC 与 React.lazy 的关系

## 18. RSC Flight 协议与安全

101. [React2Shell CVE-2025-55182 分析 (Picus Security)](https://www.picussecurity.com/resource/blog/react-flight-protocol-rce-vulnerability-cve-2025-55182-and-cve-2025-66478-explained)
102. [Weaponizing the Flight Protocol (Smashing Magazine)](https://www.smashingmagazine.com/2026/07/weaponizing-defending-react-flight-protocol/) — Flight 协议机制与安全
103. [RSC Flight Protocol 解析 (c0nrad.io)](https://blog.c0nrad.io/posts/rsc-flight-protocol/) — Wire format 可视化

## 19. 测试与工程实践

104. [Code Splitting and Lazy Loading (GreatFrontEnd)](https://www.greatfrontend.com/blog/code-splitting-and-lazy-loading-in-react) — React.lazy 与 RSC 迁移完整指南
105. [A Developer's Guide to Lazy Loading (freeCodeCamp)](https://www.freecodecamp.org/news/a-developers-guide-to-lazy-loading-in-react-and-nextjs/) — React.lazy vs next/dynamic

## 下一步

- [术语表](/reference/glossary) — 核心术语速查
- [源码文件索引](/reference/source-map) — 按知识点映射到源码文件
- [源码阅读方法论](/reference/reading-guide) — 如何有效阅读源码
