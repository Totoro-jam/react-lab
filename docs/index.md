---
title: React 底层源码与架构学习
layout: home

hero:
  name: React 底层源码
  text: 与架构学习
  tagline: 面向有前端开发经验、希望系统深入理解 React 底层设计的工程师
  actions:
    - theme: brand
      text: 开始阅读
      link: /00-overview/01-architecture-evolution
    - theme: alt
      text: GitHub 仓库
      link: https://github.com/Totoro-jam/react-lab

features:
  - icon: 🏗️
    title: 架构全景
    details: 从 Stack Reconciler 到 Fiber 架构的演进、设计哲学、版本历史、关键设计决策全解，84 篇文档覆盖所有核心子系统与最新特性。
  - icon: 🧬
    title: Fiber 数据结构
    details: FiberNode 的每个字段设计动机，WorkTag 类型体系，Lane 优先级模型，双缓冲机制。
  - icon: 🪝
    title: Hooks 底层机制
    details: 10 篇文档覆盖所有 Hooks 的 mount/update 实现链路和源码行号，含 useSyncExternalStore、useEffectEvent、useActionState、use()。
  - icon: ⚡
    title: 并发特性
    details: Suspense 的 throw Promise 机制，Transition、Gesture Transitions、Automatic Batching、Activity、View Transitions、完整水合生命周期。
  - icon: 🔍
    title: 源码验证
    details: 所有函数名、行号、WorkTag 值、Lane 值均从 React 19.3 开发分支源码验证，369 个 GitHub 链接固定指向 commit eafeac097b 快照，源码变动不影响文档。
  - icon: 📚
    title: 400+ 调研资料
    details: Dan Abramov、Andrew Clark、Max Koretskyi、卡颂、JSer.dev、Vercel、Meta、Epic React、Testing Library 等 400+ 份高质量资料。
  - icon: 🎯
    title: React 19.2 全面覆盖
    details: Activity、useEffectEvent、Partial Pre-rendering、Performance Tracks、Owner Stacks、CacheSignal、ViewTransitions、Gesture Transitions。
  - icon: 🧪
    title: 测试与工程实践
    details: React Testing Library、act()、noop-renderer、Babel/SWC/Vite 集成、7 个从零手写实践练习。
---
