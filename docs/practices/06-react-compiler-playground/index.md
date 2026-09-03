---
title: "实践练习：React Compiler 体验"
description: 在实际项目中试用 React Compiler
---


> 对应章节：[10-react-compiler/01-compiler-internals.md](../../10-react-compiler/01-compiler-internals)

## 为什么推荐这个实践

React Compiler 是 React 19 最重要的新特性之一——它自动插入 memoization 逻辑，让你不再需要手动写 `useMemo`/`useCallback`。亲手体验它的编译产物和运行时行为，比读 10 篇文章都有效。

## 推荐资料

- [I tried React Compiler today (Nadia Makarevich)](https://www.developerway.com/posts/i-tried-react-compiler) — ★ 3 个实际项目的 Compiler 效果评测
- [React Compiler Deep Dive (Sathya Gunasekaran)](https://www.youtube.com/watch?v=O8Pv6Z1JgTM) — Compiler 核心成员的深度讲解
- [React Compiler: In-Depth (Jack Herrington)](https://www.youtube.com/watch?v=vyXuS740JgQ) — 编译产物对比分析
- [React 19 Blog (官方)](https://react.dev/blog/2024/12/05/react-19) — 官方发布说明

## 前置知识

- 完成 `10-react-compiler/01-compiler-internals.md`
- 了解 `useMemo`/`useCallback` 的使用和局限性
- 有一个可以实验的 React 项目（或创建新的 Vite 项目）

## 实践步骤

### 1. 安装 React Compiler

```bash
pnpm install babel-plugin-react-compiler
pnpm install eslint-plugin-react-hooks@latest --save-dev
```

### 2. 配置 Vite + Compiler

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
  ],
});
```

### 3. 观察编译产物

写一个有手动 `useMemo`/`useCallback` 的组件：

```jsx
function ProductList({ query }) {
  const filtered = useMemo(() => 
    products.filter(p => p.name.includes(query)), [query]
  );
  const handleClick = useCallback(() => 
    console.log(query), [query]
  );
  return <div onClick={handleClick}>{filtered.map(...)}</div>;
}
```

然后在浏览器 DevTools 的 Sources 中搜索 `useMemoCache`——你会看到 Compiler 自动插入的 memoization 逻辑。

### 4. 移除手动 memoization

逐步移除 `useMemo`/`useCallback`，测试是否仍然正常工作：

```jsx
// 移除 useMemo 和 useCallback 后
function ProductList({ query }) {
  const filtered = products.filter(p => p.name.includes(query));
  const handleClick = () => console.log(query);
  return <div onClick={handleClick}>{filtered.map(...)}</div>;
}
// Compiler 会自动 memoize filtered 和 handleClick
```

### 5. 检查 ESLint 规则

```bash
npx eslint src/ --ext .js,.jsx,.ts,.tsx
```

`eslint-plugin-react-hooks` 的最新版本会标记出 Compiler 不能自动优化的代码模式。

## 对照源码阅读

在 `react/compiler/packages/` 中：

- `babel-plugin-react-compiler/` — Babel 插件入口
- `react-compiler-runtime/src/index.ts` — `useMemoCache` 运行时实现
- 对照本仓库 `10-react-compiler/01-compiler-internals.md` 中的编译产物示例

## 下一步

- [React 19 特性实践](/practices/07-react19-features/) — React 19 特性实践
- [自动 Memoization 内部机制](/10-react-compiler/01-compiler-internals) — 编译时 + 运行时的整体架构
- [useMemo / useCallback](/04-hooks-internals/06-memo-hooks) — 手动 memoization 的方式

## 预期收获

- 理解 Compiler 的编译时和运行时行为
- 能判断哪些代码模式 Compiler 能/不能优化
- 在实际项目中减少手动 memoization 的负担
