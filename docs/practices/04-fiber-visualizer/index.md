---
title: "实践练习：Fiber 树可视化工具"
---


> 目标：构建一个可视化工具，观察 Fiber 树的构建和更新过程

## 1. 项目目标

构建一个交互式工具，帮助你直观理解：

- Fiber 树的结构（child/sibling/return 指针）
- beginWork → completeWork 的遍历顺序
- flags 副作用标记
- 双缓冲（current ↔ workInProgress）

## 2. 实现思路

### 方案 A：在 React DevTools 中观察

最简单的方式是使用 React DevTools 的 Profiler 功能：

1. 打开一个简单的 React 应用
2. 在 DevTools Elements 面板中查看组件树（这是 Fiber 树的高层视图）
3. 使用 Profiler 录制一次更新，查看组件渲染顺序和时间
4. 在 Console 中访问 Fiber 节点：

   ```javascript
   // 获取 DOM 元素对应的 Fiber
   const domNode = document.querySelector('#root');
   const key = Object.keys(domNode).find(k => k.startsWith('__reactFiber'));
   const fiber = domNode[key];

   // 遍历 Fiber 树
   function printFiberTree(fiber, depth = 0) {
     const indent = '  '.repeat(depth);
     console.log(`${indent}${getComponentName(fiber)} [tag=${fiber.tag}] flags=${fiber.flags}`);
     let child = fiber.child;
     while (child) {
       printFiberTree(child, depth + 1);
       child = child.sibling;
     }
   }
   printFiberTree(fiber);
   ```

### 方案 B：构建自定义可视化

用 D3.js 或 Canvas 绘制 Fiber 树：

```
功能：
1. 输入组件代码（或用预设示例）
2. 渲染后展示 Fiber 树的图形化表示
3. 标注每个节点的 tag、flags、lanes
4. 点击节点显示详细信息
5. 触发更新时，展示 workInProgress 树的构建过程（动画）
```

### 方案 C：在 React 源码中加日志

在当前 React 源码的 `performUnitOfWork` 中添加日志：

```javascript
function performUnitOfWork(unitOfWork) {
  if (__DEV__) {
    console.log(`[Fiber] beginWork: ${getComponentName(unitOfWork)} tag=${unitOfWork.tag}`);
  }
  // ... 原始逻辑
}

function completeUnitOfWork(unitOfWork) {
  if (__DEV__) {
    console.log(`[Fiber] completeWork: ${getComponentName(unitOfWork)} flags=${unitOfWork.flags}`);
  }
  // ... 原始逻辑
}
```

## 3. 推荐实践

推荐先用方案 A（DevTools + Console 遍历）建立感性认识，然后尝试方案 C 在源码中加日志，观察真实的工作循环过程。

## 下一步

- [手写 mini-react](/practices/01-mini-react/) — 从零实现 React 核心
- [源码阅读实战](/practices/05-source-code-reading/) — 源码阅读实战
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — Fiber 节点数据结构

## 参考资料

- [React DevTools](https://react.dev/learn/react-developer-tools) — 浏览器扩展安装和调试
- [fiber-debugger (React fixtures)](https://github.com/facebook/react/tree/eafeac097b/fixtures/fiber-debugger) — 官方 Fiber 调试工具
- [D3.js](https://d3js.org/) — 数据可视化库
