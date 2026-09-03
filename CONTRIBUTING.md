# 贡献指南

感谢你对本项目的关注！欢迎提交 Issue 和 Pull Request。

## 如何贡献

### 报告问题

如果你发现内容错误、链接失效或描述不准确，请[提交 Issue](https://github.com/Totoro-jam/react-lab/issues)，包含：

1. 问题描述
2. 涉及的文档页面（URL 或文件路径）
3. 预期行为与实际行为

### 提交内容改进

如果你希望补充或修正文档内容：

1. Fork 本仓库
2. 创建分支：`git checkout -b fix/your-topic`
3. 修改 `docs/` 目录下的 Markdown 文件
4. 本地验证：`pnpm install && pnpm dev`
5. 提交 Pull Request

### 内容质量要求

- **源码引用准确**：所有函数名、行号、文件路径需从 [React 源码](https://github.com/facebook/react/tree/eafeac097b/) commit `eafeac097b` 验证
- **参考资料可靠**：新增内容需有可靠的出处（官方文档、核心成员文章、源码分析）
- **链接有效**：内联链接需可访问，内部交叉引用不含 `.md` 后缀（使用 `cleanUrls`）
- **格式规范**：提交前运行 `pnpm lint:fix` 确保通过 markdownlint 检查
- **不重复 H1**：frontmatter `title` 已作为页面标题，正文不再写 `# 同标题`

### 本地开发

```bash
# 克隆仓库（含 React 源码 submodule）
git clone --recursive https://github.com/Totoro-jam/react-lab.git
cd react-lab

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
# 打开 http://localhost:5173/react-lab/

# 构建验证
pnpm build
```

### 项目结构

```
docs/
├── .vitepress/
│   ├── config.mjs          ← VitePress 配置（sidebar、搜索、主题）
│   └── theme/
│       ├── index.js        ← 自定义主题入口
│       └── custom.css      ← antfu 风格 CSS 变量覆盖
├── 00-overview/            ← 架构全景
├── 01-react-core/          ← React 核心 API
├── ...
├── practices/              ← 实践练习推荐
└── reference/              ← 参考资料
```

### 评论与讨论

每篇文档底部有 Giscus 评论区域（基于 GitHub Discussions）。你也可以在 [GitHub Discussions](https://github.com/Totoro-jam/react-lab/discussions) 中发起讨论。

## 许可

本仓库的文档内容遵循 MIT 许可证。React 源码（submodule）遵循其自身的 MIT 许可证。
