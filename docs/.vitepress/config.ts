import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'React 底层源码与架构学习',
  description: '系统深入理解 React 底层设计原理和源码实现',
  base: '/',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#3aa676' }],
  ],

  markdown: {
    container: {
      tipLabel: '提示',
      warningLabel: '警告',
      dangerLabel: '危险',
      infoLabel: '信息',
      detailsLabel: '详细信息',
    },
    codeCopyButton: {
      tooltipText: '复制代码',
      copiedText: '已复制',
    },
  },

  themeConfig: {
    outline: {
      label: '本页目录',
      level: [2, 3],
    },

    docFooter: {
      prev: '上一篇',
      next: '下一篇',
    },

    lastUpdated: {
      text: '最后更新于',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Totoro-jam',
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色主题',
    darkModeSwitchTitle: '切换到深色主题',

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Totoro-jam/react-lab' },
    ],

    editLink: {
      pattern: 'https://github.com/Totoro-jam/react-lab/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索',
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
            },
          },
        },
      },
    },

    sidebar: [
      {
        text: '架构全景',
        collapsed: false,
        items: [
          { text: 'React 架构演进', link: '/00-overview/01-architecture-evolution' },
          { text: 'Monorepo 包结构', link: '/00-overview/02-package-map' },
          { text: '核心理念心智模型', link: '/00-overview/03-mental-model' },
          { text: '设计哲学', link: '/00-overview/04-design-philosophy' },
          { text: '版本演进历史', link: '/00-overview/05-version-history' },
          { text: '关键设计决策', link: '/00-overview/06-design-decisions' },
        ],
      },
      {
        text: 'React 核心 API',
        collapsed: false,
        items: [
          { text: 'Component / PureComponent', link: '/01-react-core/01-component-lifecycle' },
          { text: 'Hooks API 全景', link: '/01-react-core/02-hooks-api-overview' },
          { text: 'Context', link: '/01-react-core/03-context' },
          { text: 'memo / lazy / forwardRef', link: '/01-react-core/04-memo-lazy-forwardref' },
          { text: 'React.Children', link: '/01-react-core/05-children' },
          { text: 'JSX Transform', link: '/01-react-core/06-jsx-transform' },
        ],
      },
      {
        text: 'Fiber 架构',
        collapsed: false,
        items: [
          { text: 'Fiber 节点数据结构', link: '/02-fiber-architecture/01-fiber-node-structure' },
          { text: 'WorkTag 类型体系', link: '/02-fiber-architecture/02-work-tags' },
          { text: '副作用标记 Flags', link: '/02-fiber-architecture/03-flags-effects' },
          { text: 'Lane 优先级模型', link: '/02-fiber-architecture/04-lanes-priorities' },
          { text: '双缓冲机制', link: '/02-fiber-architecture/05-double-buffering' },
        ],
      },
      {
        text: '工作循环',
        collapsed: false,
        items: [
          { text: '工作循环全景', link: '/03-work-loop/01-work-loop-overview' },
          { text: 'beginWork 详解', link: '/03-work-loop/02-begin-work' },
          { text: 'completeWork 详解', link: '/03-work-loop/03-complete-work' },
          { text: 'Diff 算法', link: '/03-work-loop/04-reconcile-children' },
          { text: 'Commit 阶段', link: '/03-work-loop/05-commit-phase' },
          { text: '错误边界与恢复', link: '/03-work-loop/06-error-handling' },
        ],
      },
      {
        text: 'Hooks 底层机制',
        collapsed: false,
        items: [
          { text: 'Mount 与 Update 机制', link: '/04-hooks-internals/01-hooks-mount-update' },
          { text: 'useState / useReducer', link: '/04-hooks-internals/02-state-hooks' },
          { text: 'useEffect / useLayoutEffect', link: '/04-hooks-internals/03-effect-hooks' },
          { text: 'useRef / useImperativeHandle', link: '/04-hooks-internals/04-ref-hooks' },
          { text: 'useContext', link: '/04-hooks-internals/05-context-hooks' },
          { text: 'useMemo / useCallback', link: '/04-hooks-internals/06-memo-hooks' },
          { text: 'useTransition / useDeferredValue', link: '/04-hooks-internals/07-concurrent-hooks' },
          { text: 'React 19 新 Hooks', link: '/04-hooks-internals/08-react19-hooks' },
          { text: '工具型 Hooks', link: '/04-hooks-internals/09-utility-hooks' },
          { text: 'useSyncExternalStore', link: '/04-hooks-internals/10-external-store' },
        ],
      },
      {
        text: '调度器',
        collapsed: true,
        items: [
          { text: 'Scheduler 设计哲学', link: '/05-scheduler/01-scheduler-design' },
          { text: '最小堆优先级队列', link: '/05-scheduler/02-min-heap' },
          { text: '时间切片', link: '/05-scheduler/03-time-slicing' },
          { text: '优先级体系', link: '/05-scheduler/04-priority-levels' },
        ],
      },
      {
        text: '并发特性',
        collapsed: true,
        items: [
          { text: '并发渲染原理', link: '/06-concurrent-features/01-concurrent-rendering' },
          { text: 'Suspense 机制', link: '/06-concurrent-features/02-suspense' },
          { text: '过渡更新 Transitions', link: '/06-concurrent-features/03-transitions' },
          { text: '自动批量更新', link: '/06-concurrent-features/04-batching' },
          { text: 'Offscreen / Activity', link: '/06-concurrent-features/05-offscreen' },
          { text: 'View Transitions', link: '/06-concurrent-features/06-view-transitions' },
          { text: 'Gesture Transitions', link: '/06-concurrent-features/07-gesture-transitions' },
        ],
      },
      {
        text: '事件系统',
        collapsed: true,
        items: [
          { text: '合成事件系统', link: '/07-event-system/01-synthetic-events' },
          { text: '事件优先级', link: '/07-event-system/02-event-priorities' },
          { text: '事件派发', link: '/07-event-system/03-event-dispatch' },
        ],
      },
      {
        text: '渲染器',
        collapsed: true,
        items: [
          { text: 'ReactDOM 渲染流程', link: '/08-renderer/01-dom-renderer' },
          { text: 'SSR 渲染（Fizz）', link: '/08-renderer/02-ssr-fizz' },
          { text: '自定义渲染器', link: '/08-renderer/03-custom-renderer' },
          { text: '选择性水合', link: '/08-renderer/04-selective-hydration' },
          { text: '完整水合生命周期', link: '/08-renderer/05-hydration-complete' },
        ],
      },
      {
        text: 'React Server Components',
        collapsed: true,
        items: [
          { text: 'RSC 架构原理', link: '/09-react-server/01-rsc-architecture' },
          { text: 'Flight 协议', link: '/09-react-server/02-flight-protocol' },
          { text: 'Server Actions', link: '/09-react-server/03-server-actions' },
          { text: 'RSC 缓存与流式渲染', link: '/09-react-server/04-rsc-caching-streaming' },
          { text: 'Partial Pre-rendering', link: '/09-react-server/05-partial-prerendering' },
          { text: 'cache() 与 cacheSignal', link: '/09-react-server/06-cache-signal' },
          { text: 'RSC 中的 Suspense 边界', link: '/09-react-server/07-rsc-suspense-boundaries' },
        ],
      },
      {
        text: 'React Compiler',
        collapsed: true,
        items: [
          { text: '自动 Memoization 内部机制', link: '/10-react-compiler/01-compiler-internals' },
          { text: '编译管线深度分析', link: '/10-react-compiler/02-compiler-pipeline' },
          { text: 'Compiler 限制与手动优化', link: '/10-react-compiler/03-compiler-limitations' },
        ],
      },
      {
        text: 'React DevTools',
        collapsed: true,
        items: [
          { text: 'DevTools 桥梁原理', link: '/11-devtools/01-devtools-bridge' },
          { text: 'Components 面板', link: '/11-devtools/02-devtools-components-panel' },
          { text: 'Profiler 与 Performance Tracks', link: '/11-devtools/03-devtools-profiler-panel' },
        ],
      },
      {
        text: '内部辅助机制',
        collapsed: true,
        items: [
          { text: 'Fast Refresh', link: '/12-internal-mechanisms/01-fast-refresh' },
          { text: 'Profiler 计时器', link: '/12-internal-mechanisms/02-profiler-timer' },
          { text: 'StrictMode', link: '/12-internal-mechanisms/03-strict-mode' },
          { text: 'Fragment 与 Portal', link: '/12-internal-mechanisms/04-fragment-portal' },
        ],
      },
      {
        text: '实践练习',
        collapsed: true,
        items: [
          { text: '手写 mini-react', link: '/practices/01-mini-react/' },
          { text: '手写 Hooks 实现', link: '/practices/02-hooks-from-scratch/' },
          { text: '手写时间切片调度器', link: '/practices/03-scheduler-demo/' },
          { text: 'Fiber 树可视化', link: '/practices/04-fiber-visualizer/' },
          { text: '源码阅读实战', link: '/practices/05-source-code-reading/' },
          { text: 'React Compiler 体验', link: '/practices/06-react-compiler-playground/' },
          { text: 'React 19 特性实践', link: '/practices/07-react19-features/' },
        ],
      },
      {
        text: '参考资料',
        collapsed: true,
        items: [
          { text: '术语表', link: '/reference/glossary' },
          { text: '源码文件索引', link: '/reference/source-map' },
          { text: '社区资料索引', link: '/reference/resources' },
          { text: '源码阅读方法论', link: '/reference/reading-guide' },
          { text: '叙事风格写作指南', link: '/reference/writing-style-guide' },
          { text: '测试哲学', link: '/reference/react-testing-philosophy' },
          { text: 'Bundler 集成', link: '/reference/react-bundler-integration' },
        ],
      },
    ],
  },
})
