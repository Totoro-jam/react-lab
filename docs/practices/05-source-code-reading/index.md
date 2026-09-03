---
title: "实践练习：源码阅读实战"
description: 在 React 官方源码中直接设断点调试
---


> 对应章节：全部——这是一个贯穿所有章节的实践方法

## 为什么推荐这个实践

阅读源码最有效的方式不是从第一行开始读，而是**带着问题找答案**。本仓库的 react/ submodule 提供了完整的 React 源码，你可以直接在其中设断点、搜索、跳转。

## 推荐资料

- [理解 React 课程 (Tony Alicea)](https://youtu.be/-XKvVyC6si0) — 17 小时的源码深度课程
- [React 技术揭秘 - 调试源码 (卡颂)](https://react.iamkasong.com/preparation/debug.html) — 中文调试方法
- [React Contributing Guide](https://react.dev/wiki/Contributing-to-React) — 官方贡献指南

## 前置知识

- 完成 `00-overview` 全部 3 篇文档
- 了解 JavaScript 调试基础（断点、调用栈、作用域检查）

## 实践步骤

### 1. 克隆仓库并安装依赖

```bash
git clone --recursive https://github.com/Totoro-jam/react-lab.git
cd react-lab/react
yarn install
```

### 2. 构建 React 开发版本

```bash
yarn build react/index,react-dom/index --type=NODE
```

构建产物在 `build/node_modules/`。

### 3. 使用 fixtures 调试

React 仓库中有专门的调试用例：

```
react/fixtures/concurrent/    ← 并发特性调试
react/fixtures/fiber-debugger/ ← Fiber 树可视化
react/fixtures/fizz/          ← SSR 流式渲染
react/fixtures/flight/        ← RSC Flight 协议
```

### 4. 推荐的断点位置

| 想理解的问题 | 文件 | 断点位置 |
| ------------- | ------ | --------- |
| setState 后发生了什么 | `ReactFiberConcurrentUpdates.js` | `enqueueUpdate` |
| Fiber 树怎么遍历的 | `ReactFiberWorkLoop.js` | `performUnitOfWork` |
| Hook 状态存在哪 | `ReactFiberHooks.js` | `mountWorkInProgressHook` |
| Suspense 怎么暂停的 | `ReactFiberThrow.js` | `throwException` |
| 优先级怎么调度的 | `ReactFiberRootScheduler.js` | `ensureRootIsScheduled` |
| 时间切片在哪里让出 | `Scheduler.js` | `shouldYieldToHost` |

### 5. 对照文档阅读

每篇文档的"对应源码"和源码行号引用都可以在 `react/packages/` 中找到。建议的阅读方式：

1. 先读本仓库的文档，建立宏观理解
2. 然后在源码中找到对应函数，设断点
3. 运行 fixtures 中的示例触发代码
4. 在断点处观察调用栈和变量

## 下一步

- [React Compiler 体验](/practices/06-react-compiler-playground/) — React Compiler 体验
- [React 19 特性实践](/practices/07-react19-features/) — React 19 特性实践
- [源码阅读方法论](/reference/reading-guide) — 源码阅读方法论

## 预期收获

- 能在 React 源码中快速定位任意功能的实现
- 能用断点调试理解运行时行为
- 建立从 API 到源码的完整映射认知
