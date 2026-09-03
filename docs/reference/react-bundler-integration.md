---
title: "Babel / SWC / Vite 与 React 的集成机制"
---


> 对应源码：[`packages/react/src/jsx/`](https://github.com/facebook/react/tree/eafeac097b/packages/react/src/jsx), [`packages/react-server-dom-webpack/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-webpack), [`packages/react-server-dom-turbopack/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-turbopack), [`packages/react-server-dom-parcel/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-parcel)

## 1. JSX Transform：从 createElement 到 jsx-runtime

### 1.1 两种 runtime

React 的 JSX 编译有两种"runtime"：

```
Classic Runtime（React 16 及之前）：
  JSX → React.createElement(type, props, children)
  → 每个文件需要 import React
  → 性能优化空间有限

Automatic Runtime（React 17+ 引入）：
  JSX → import { jsx as _jsx } from 'react/jsx-runtime'
     → _jsx(type, props, key?)
  → 自动 import，不需要手动 import React
  → 编译产物更小（少了 React.createElement 开销）
  → 允许开发模式返回额外信息（如 jsxDEV 用于 dev 警告）
```

[React 17 的 JSX Transform 官方博客](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html) 和 [Babel `@babel/plugin-transform-react-jsx` 文档](https://babeljs.io/docs/babel-plugin-transform-react-jsx) 详细解释了这一变化。

### 1.2 配置方式

```json
// Babel 配置
{
  "plugins": [
    ["@babel/plugin-transform-react-jsx", {
      "runtime": "automatic",   // "classic" 或 "automatic"（React 17+ 默认）
      "importSource": "react"    // 可改为其他 JSX 库（如 Preact）
    }]
  ]
}
```

TypeScript 4.1+:

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx"  // "react"=classic, "react-jsx"=automatic
  }
}
```

### 1.3 jsx-runtime 内部结构

源码中的 jsx 实现在 `packages/react/src/jsx/ReactJSX.js`：

```javascript
// packages/react/src/jsx/ReactJSX.js（简化）
// 生产环境：
const jsx = __DEV__ ? jsxProdSignatureRunningInDevWithDynamicChildren : jsxProd;
const jsxs = __DEV__ ? jsxProdSignatureRunningInDevWithStaticChildren : jsxProd;
const jsxDEV = __DEV__ ? _jsxDEV : undefined;

export { Fragment, jsx, jsxs, jsxDEV };
```

- `jsx`: 结论输出（处理后 children 是动态的）
- `jsxs`: 静态 children（fast path）
- `jsxDEV`: 开发模式（含调试参数 `isStaticChildren`）

## 2. Babel vs SWC：编译器的选择

### 2.1 差异

```
Babel:
  → 用 JavaScript 编写
  → 插件生态最丰富（React Compiler、styled-components 等 Babel plugins）
  → 速度中等（JS → AST → plugin transforms → code generation）

SWC (Speedy Web Compiler):
  → 用 Rust 编写（Next.js 内置）
  → 速度比 Babel 快 20x+（Rust native）
  → 插件生态较少（但快速成长）
  → JSX Transform 性能等同 Babel，但 React Fast Refresh 由 SWC 实现

esbuild / OXC:
  → 比 Babel 更快（Go/Rust 编写）
  → 但 JSX 选项有限（不支持高阶 Babel plugins）
  → Vite 在某些场景使用 esbuild 处理 .jsx/.tsx
```

### 2.2 性能权衡

| 选择 | 编译速度 | 插件灵活性 | 适用场景 |
| ------ | --------- | --------- | --------- |
| `@vitejs/plugin-react`（Babel） | 中 | 高 | 需要 React Compiler 或 Babel plugins 时 |
| `@vitejs/plugin-react-swc`（SWC） | 快 | 低 | 仅需 JSX + Fast Refresh 的大项目 |
| Next.js 默认 | SWC | 中 | 内置 SWC + 编译器插件 |

## 3. Vite + React 配置

### 3.1 两种插件

#### Babel 版

```javascript
// vite.config.js using Babel
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', {}],  // React Compiler
        ],
      },
    }),
  ],
});
```

#### SWC 版

```javascript
// vite.config.js using SWC
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [
    react({
      jsxImportSource: 'react',   // JSX 引入源
      plugins: [
        ['@swc/plugin-styled-components', {}],
      ],
    }),
  ],
});
```

### 3.2 SWC 版的限制

[`@vitejs/plugin-react-swc` 官方文档](https://www.npmjs.com/package/@vitejs/plugin-react-swc) 说明的限制：

- `useDefineForClassFields` 始终启用
- JSX runtime 始终 `automatic`
- 开发模式下 esbuild 被禁用
- target 默认 es2020
- 不解析 tsconfig

### 3.3 React Fast Refresh 的集成

React Fast Refresh（HMR）在每个工具链中的实现方式：

```
Fast Refresh 运行时文件：
  → @vitejs/plugin-react 通过 Babel 注入 ReactRefresh Babel plugin
  → @vitejs/plugin-react-swc 通过 SWC 注入 refresh 注册代码
  → Next.js 通过 SWC 内置刷新支持

Server URL 改动（Module Federation 需求）：
  react({
    reactRefreshHost: 'http://localhost:3000',
    // → 让远程模块使用 host 的 refresh 运行时
  })
```

## 4. RSC 捆绑器集成模式

### 4.1 三种打包器的特征

| Package | 实现 | 主要框架使用 |
| --------- | ------ | --------- |
| `react-server-dom-webpack` | Webpack 插件 | Next.js |
| `react-server-dom-turbopack` | Turbopack 插件 | Next.js（Turbopack 模式） |
| `react-server-dom-parcel` | Parcel 集成 | Parcel v2.14+ |
| `react-server-dom-esm` | 纯 ESM | 实验/Minimal setup |
| `react-server-dom-fb` | Meta 内部 | Facebook 内部 |
| `react-server-dom-unbundled` | 无打包器 | 极简运行时 |

源码中的 `react-server-dom-webpack/`、`react-server-dom-turbopack/` 等都在 `packages/` 中。每个包实现了 React Server Components 的**传输协议封装**——把 Flight 格式转换为特定打包器能理解的模块边界。

### 4.2 `'use client'` 和 `'use server'` 如何被处理

```
'use client'  → 标记 Client Component
  → 打包器把这个文件（和它依赖的代码）放入客户端 bundle
  → Server Components 可以 import 该组件，但只在客户端运行

'use server'  → 标记 Server Actions
  → 打包器把这个文件的 async 函数导出转为远程调用 stub
  → 客户端导入这些函数时实际拿到的是 "调用远程" 的代理函数
  → 代理函数发送一个 POST 请求到服务端，服务端执行原函数
```

### 4.3 Parcel 的 RSC 集成示例

[Parcel RSC 文档](https://parceljs.org/recipes/rsc/) 提供了完整的集成指南：

```json
// package.json targets（两个目标）
{
  "targets": {
    "client": { "source": "src/index.html", "context": "react-client" },
    "server": { "source": "server/server.js", "context": "react-server" }
  }
}
```

```javascript
// Server entry (使用 Parcel 特有指令 "use server-entry")
// server/Comments.js
"use server-entry";

import { LikeButton } from './LikeButton';  // Client Component 会自动 code split

export async function Comments() {
  const comments = await db.getComments();
  return comments.map(comment => (
    <article key={comment.id}>
      {renderMarkdown(comment.body)}
      <LikeButton likes={comment.likes} />
    </article>
  ));
}
```

Parcel 特有：

- `"use server-entry"` — Parcel 专有指令，标记 Server Component 作为 page/route 入口
- `"use client-entry"` — Parcel 专有，标记客户端入口（hydration）
- `"use client"` / `"use server"` — React 标准 React 指令

### 4.4 Webpack RSC 集成

`react-server-dom-webpack` 实现：

- Webpack Plugin 处理 `'use client'` 和 `'use server'`
- 为每个 Client Component 生成 ID（manifest）
- 服务端渲染时使用 Server Manifest 查找哪些组件要发送到客户端
- 客户端渲染时使用 Client Manifest 知道需要加载哪些 chunk

## 5. React Compiler 与打包器

React Compiler 同时作为 Babel 插件运行。集成方式：

```json
{
  "plugins": [
    ["babel-plugin-react-compiler", {}]
  ]
}
```

- Next.js 16+ 默认内置 React Compiler 插件
- Vite + `@vitejs/plugin-react` 通过 `babel.plugins` 配置
- Webpack + Babel 在 `babel-loader` 配置中添加

值得注意的是：React Compiler 是**乐观分析的**——它分析不了的组件直接跳过（不输出转换后代码）。这保证了渐进式应用：不是所有组件都需要同时准备好"符合 Rules of React"。

`eslint-plugin-react-hooks` v6+ 新增了 Compiler 诊断规则（如 `set-state-in-effect`、`purity`等）——在启用 Compiler 之前先用这些规则统一代码质量。

## 6. Build Pipeline 完整图谱

```
开发代码 (.jsx/.tsx)
    │
    ▼
打包器（Babel/SWC）
    │
    ├── JSX Transform → react/jsx-runtime (automatic) 或 React.createElement (classic)
    ├── React Compiler（如果启用）→ 插入 _c() useMemoCache
    ├── React Fast Refresh 注入（dev only）
    └── 根据指令处理模块边界
        → 'use client' → 入客户端 bundle
        → 'use server' → 生成远程调用 stub
        → 无指令 → 默认入客户端（React 19 以上 Server Component 是默认）
    │
    ▼
Client Bundle + Server Bundle + RSC Manifest
    │
    ▼
运行时
  ├── 客户端：加载 Client Components，按需 fetch RSC Payload
  └── 服务端：渲染 Server Components → Flight 格式 → 客户端解析
```

## 源码文件索引

| 文件/目录 | 职责 |
| --------- | ------ |
| `packages/react/src/jsx/ReactJSX.js` | Babel 引入的 jsx / jsxs / jsxDEV |
| `packages/react/src/jsx/ReactJSXElement.js` | createElement 和 jsxProd 实现 |
| `packages/react-server-dom-webpack/src/` | Webpack 专用的 RSC 序列化/反序列化 |
| `packages/react-server-dom-turbopack/src/` | Turbopack 专用 |
| `packages/react-server-dom-parcel/src/` | Parcel 专用 |
| `packages/react-server-dom-esm/src/` | 纯 ESM 版本（无需打包器） |
| `packages/react-refresh/` | Fast Refresh 运行时 |
| `compiler/packages/babel-plugin-react-compiler/` | React Compiler 的 Babel 插件 |

## 下一步

- [术语表](/reference/glossary) — 核心术语速查
- [源码文件索引](/reference/source-map) — 按知识点映射到源码文件
- [社区资料索引](/reference/resources) — 调研依赖的完整资料

## 参考资料

- [Introducing the New JSX Transform (React 官方博客)](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html) — ★ JSX Transform 变更官方公告
- [@babel/plugin-transform-react-jsx (Babel 文档)](https://babeljs.io/docs/babel-plugin-transform-react-jsx) — ★ Babel JSX 插件完整文档
- [@vitejs/plugin-react-swc (npm)](https://www.npmjs.com/package/@vitejs/plugin-react-swc) — ★ Vite SWC 插件
- [@vitejs/plugin-react (npm)](https://www.npmjs.com/package/@vitejs/plugin-react) — Vite Babel 插件
- [React Server Components on Parcel (官方文档)](https://parceljs.org/recipes/rsc/) — ★ Parcel RSC 集成完整指南
- [Why Does RSC Integrate with a Bundler? (Dan Abramov)](https://overreacted.io/why-does-rsc-integrate-with-a-bundler/) — RSC 与打包器集成的"为什么"
- [How Imports Work in RSC (Dan Abramov)](https://overreacted.io/how-imports-work-in-rsc/) — ★ RSC 模块加载机制
- [react-server-dom-webpack (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-webpack) — Webpack RSC 实现
- [react-server-dom-turbopack (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-turbopack) — Turbopack RSC 实现
- [react-server-dom-parcel (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-server-dom-parcel) — Parcel RSC 实现
- [React Compiler Docs (React 官方)](https://react.dev/learn/react-compiler) — Compiler 安装和使用
- [eslint-plugin-react-hooks changelog (GitHub)](https://github.com/facebook/react/blob/eafeac097b/packages/eslint-plugin-react-hooks/CHANGELOG.md) — ESLint v6 v6/v7 变更
- [React Server Components RFC 0188 (GitHub)](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md) — ★ RSC RFC 原文
- [Vite React Plugin Babel config (GitHub)](https://github.com/vitejs/vite-plugin-react) — Vite 内部配置惯例
- [RSC and Server Action bundle practice (web-infra-dev discussion)](https://github.com/orgs/web-infra-dev/discussions/23) — 打包器集成实践讨论
