# React 底层源码与架构学习

> 面向有前端开发经验、希望系统深入理解 React 底层设计原理和源码实现的工程师

[在线阅读](https://react-lab.totorojam.com/)

## 这是什么

你已经用 React 写了几年业务代码，熟练使用 Hooks、Context、Suspense，但你可能仍然对以下问题感到困惑：

- `setState` 之后，React 内部究竟发生了什么？
- Fiber 到底是什么？它和虚拟 DOM 是什么关系？
- `useEffect` 和 `useLayoutEffect` 在 Fiber 架构下如何被调度？
- React 如何在渲染过程中做到"可中断、可恢复"？
- Lane 模型和 Scheduler 优先级是什么关系？

本仓库基于 React 官方源码，结合 400+ 份社区高质量资料（Dan Abramov、Andrew Clark、Max Koretskyi、卡颂、JSer.dev 等），系统梳理 React 的架构设计与底层实现。

## 在线阅读

文档站已部署在 GitHub Pages，支持深色/浅色主题切换、全文搜索和评论讨论：

**[https://react-lab.totorojam.com/](https://react-lab.totorojam.com/)**

## 本地运行

### 克隆仓库

```bash
# 只克隆文档（不含 React 源码）
git clone https://github.com/Totoro-jam/react-lab.git

# 完整克隆（含 React 源码 submodule）
git clone --recursive https://github.com/Totoro-jam/react-lab.git

# 后续按需拉取 submodule
git submodule update --init
```

### 运行文档站

```bash
cd react-lab
pnpm install
pnpm dev
# 打开 http://localhost:5173/
```

### 构建静态站点

```bash
pnpm build      # 产物在 docs/.vitepress/dist/
pnpm preview    # 预览构建结果
```

## 仓库结构

```
react-lab/
├── react/                              ← git submodule（React 官方源码）
├── docs/
│   ├── .vitepress/
│   │   ├── config.mjs                  ← VitePress 配置（sidebar、搜索、主题、中文 UI）
│   │   └── theme/
│   │       ├── index.js                ← 自定义主题入口
│   │       └── custom.css              ← antfu 风格 CSS 变量覆盖
│   ├── index.md                        ← 首页（Hero + Features）
│   ├── 00-overview/                    ← 架构全景（6 篇）
│   ├── 01-react-core/                  ← React 核心 API（6 篇）
│   ├── 02-fiber-architecture/          ← Fiber 架构核心（5 篇）
│   ├── 03-work-loop/                   ← 工作循环（6 篇）
│   ├── 04-hooks-internals/             ← Hooks 底层机制（10 篇）
│   ├── 05-scheduler/                   ← 调度器（4 篇）
│   ├── 06-concurrent-features/         ← 并发特性（7 篇）
│   ├── 07-event-system/                ← 事件系统（3 篇）
│   ├── 08-renderer/                    ← 渲染器（5 篇）
│   ├── 09-react-server/                ← React Server Components（7 篇）
│   ├── 10-react-compiler/              ← React Compiler（3 篇）
│   ├── 11-devtools/                    ← React DevTools（3 篇）
│   ├── 12-internal-mechanisms/         ← 内部辅助机制（4 篇）
│   ├── practices/                      ← 实践练习推荐（7 篇）
│   └── reference/                      ← 参考资料（7 篇）
├── .github/workflows/deploy.yml        ← GitHub Pages 自动部署（pnpm）
├── .gitmodules                         ← React submodule 声明
├── .markdownlint-cli2.jsonc            ← Markdown 格式 lint 配置
├── CONTRIBUTING.md                     ← 贡献指南
├── LICENSE                             ← MIT
├── package.json                        ← 依赖 + lint 脚本（pnpm 管理）
├── pnpm-lock.yaml                      ← pnpm lockfile
└── README.md
```

## 文档内容

### 三条学习路径

**路径 A：自顶向下（推荐入门）**

```
00-overview → 01-react-core → 02-fiber-architecture → 03-work-loop
→ 04-hooks-internals → 05-scheduler → 06-concurrent-features
→ 07-event-system → 08-renderer → 09-react-server
```

**路径 B：自底向上**

```
05-scheduler → 02-fiber-architecture → 03-work-loop
→ 04-hooks-internals → 01-react-core → 06-concurrent-features
```

**路径 C：主题驱动**

```
渲染原理: 00 → 02 → 03 → 08
状态管理: 01 → 04 → 06
并发特性: 05 → 02(lanes) → 06 → 09
事件系统: 07 → 03(commit) → 08
```

### 内容统计

| 指标 | 值 |
| ------ | ----- |
| 文件总数 | 84 |
| 总行数 | 19,000+ |
| 内联链接 | 1,400+ |
| 唯一 URL | 400+ |
| 调研资料 | 400+ 份 |
| antfu 风格重写 | 13 篇 |

### 源码版本快照

本仓库中所有 GitHub 源码链接均指向**固定 commit**，而非 `main` 分支：

| 指标 | 值 |
| ------ | ----- |
| 快照 commit | `eafeac097b`（短）/ `eafeac097ba51e1eab809c07102126bd5f8e5425`（完整） |
| 对应版本 | React 19.3.0 开发分支（2026-08-25） |
| 链接总数 | 370 处（77 个文件） |

这意味着即使 React 源码后续发生文件重命名或删除，所有链接仍然有效。

详见 [源码文件索引](docs/reference/source-map.md)。

## 技术栈

- **文档站**：[VitePress](https://vitepress.dev/)
- **包管理**：[pnpm](https://pnpm.io/) v9
- **格式检查**：[markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2)（`pnpm lint` / `pnpm lint:fix`）
- **评论系统**：[Giscus](https://giscus.app/)（基于 GitHub Discussions）
- **部署**：GitHub Pages（GitHub Actions 自动构建部署，pnpm）
- **源码依赖**：git submodule 指向 [facebook/react](https://github.com/facebook/react) commit `eafeac097b`

## 贡献

欢迎提交 Issue 和 Pull Request！请先阅读 [贡献指南](CONTRIBUTING.md) 和 [源码阅读方法论](https://react-lab.totorojam.com/reference/reading-guide/)。

## 许可

MIT License — 本仓库的文档内容基于对 React 源码的分析和社区资料的整理，仅供学习目的使用。React 源码遵循 MIT 许可证。
