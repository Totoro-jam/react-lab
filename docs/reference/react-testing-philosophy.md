---
title: "React 测试哲学：从 act() 到 Testing Library"
---


> 对应源码：[`packages/react-dom/src/test-utils/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-dom/src/test-utils), [`packages/react-test-renderer/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-test-renderer), [`packages/react-noop-renderer/`](https://github.com/facebook/react/tree/eafeac097b/packages/react-noop-renderer), [`fixtures/`](https://github.com/facebook/react/tree/eafeac097b/fixtures)

## 1. React 的测试哲学

React 的测试哲学有一条核心原则：

> **"The more your tests resemble the way your software is used, the more confidence they can give you."**
> — [Kent C. Dodds, React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

这意味着：

- 测试应该**通过用户能看到的东西**（文字、角色、可访问性标记）来断言，而不是通过组件实例或内部 state
- 测试应该**模拟用户的行为**（点击、输入），而不是直接调用组件方法
- 测试**不应测试实现细节**——重构组件不应破坏测试

## 2. React 自身如何测试

React 仓库的测试基础设施分为三层：

```
React 仓库测试基础设施：

1. fixtures/（应用级测试夹具）
   - fixtures/concurrent/      并发特性调试
   - fixtures/fiber-debugger/   Fiber 树可视化
   - fixtures/fizz/             SSR 流式渲染
   - fixtures/flight/           RSC Flight 协议
   - fixtures/art/              React ART 渲染
   → 真实可运行的小应用，用于手动测试和集成验证

2. react-noop-renderer/（Reconciler 自测）
   - 不操作真实 DOM 的精简 Reconciler
   - 专门用于测试 Reconciler 逻辑
   → 验证 Fiber 内部行为（如 bailout、中断恢复、Suspense）

3. 内部 test-utils 包
   - jest-react             Jest 适配器
   - internal-test-utils     通用测试工具
   - dom-event-testing-library DOM 事件模拟
   - react-suspense-test-utils Suspense 测试工具
```

`react-noop-renderer` 是最独特的——它是一个**不输出任何内容的渲染器**，专门让 Reconciler 的测试可以独立于 DOM。源码中的 `ReactFiberConfigNoop.js` 实现了所有 HostConfig 接口，但 `createInstance` 返回的是纯 JS 对象。

## 3. act() — React 的测试原子

`act()` 是 React 内部测试的核心原语。它确保 React 的异步更新（state、effects）在断言前完成。

```javascript
// packages/react/src/ReactAct.js（简化）
function act(callback) {
  // ...
  ReactDOM.flushSync(() => {
    callback();  // 执行渲染或更新
  });
  flushPassiveEffects();  // 确保 useEffect 也执行完
  // ...
}
```

### 为什么需要 act()

React 18+ 的并发渲染中，状态更新是**异步调度**的——`setState` 不立即触发渲染。在测试中，如果你执行 `setState` 后立即读取 DOM，可能读到的是更新前的状态。`act()` 确保更新和 effects 在回调内同步完成。

```
没有 act():
  setState(newValue)           → React 只是调度了更新
  expect(screen.getByText())   → 可能拿到旧值！

有 act():
  act(() => {
    setState(newValue);        → React 同步执行更新 + effects
  })                           → 更新已完成
  expect(screen.getByText())   → 拿到新值 ✓
```

### React Testing Library 已内置 act()

[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) 的 `render()` 和 `fireEvent` **已经内置包装了 `act()`**。所以你通常不需要手动调用：

```javascript
// ✅ 不需要手动 wrap
render(<Component />);
fireEvent.click(screen.getByRole('button'));
// render 和 fireEvent 内部已经调用了 act()

// ❌ 不必要的 wrap
act(() => {
  render(<Component />);
});

// ✅ 只在需要等待异步操作完成时才需要
await act(async () => {
  await someAsyncOperation();
});
```

[Kent C. Dodds 在 "Common mistakes with React Testing Library"](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library) 中明确指出，最常见的错误之一就是"不必要地用 `act()` 包装"。

## 4. React Testing Library 的查询优先级

React Testing Library 推荐按以下优先级选择查询方式：

```
推荐优先级（从高到低）：

1. *ByRole           ← 最推荐！语义化、可访问性友好
   screen.getByRole('button', { name: /submit/i })

2. *ByLabelText       ← 表单元素
   screen.getByLabelText('Username')

3. *ByPlaceholderText ← 表单元素的 placeholder
   screen.getByPlaceholderText('Enter your name')

4. *ByText            ← 通用文本
   screen.getByText('Hello World')

5. *ByDisplayValue    ← 当前值
   screen.getByDisplayValue('current value')

6. *ByAltText         ← 图片 alt
   screen.getByAltText('A cute cat')

7. *ByTitle           ← SVG title 或 tooltip
   screen.getByTitle('Close')

8. *ByTestId          ← 最后手段
   screen.getByTestId('submit-button')
```

**为什么 `*ByRole` 是首选？**因为它直接映射 [WAI-ARIA 可访问性角色](https://www.w3.org/TR/wai-aria/#role_definitions)。用 `getByRole('button', { name: 'Submit' })` 既验证了元素是按钮（语义正确）又验证了可访问名称（label/text 正确）。如果找不到，错误消息会列出所有可用角色——帮助开发者学习 ARIA 概念。

## 5. react-test-renderer 的废弃

### React 19 中的变化

React 19 中的 `react-test-renderer` 已标记为**废弃**。[React 官方文档](https://react.dev/warnings/react-test-renderer) 明确说：

> "react-test-renderer is deprecated. The React team recommends @testing-library/react or @testing-library/react-native as a replacement."

原因：

1. `react-test-renderer` 创建了一个"artificial environment"（不依赖真实 DOM）
2. 它的 API 鼓励检查 React 内部实现细节
3. React 内部可能随时变化，导致基于实现细节的测试失效

`react-test-renderer` 仍保留在 npm 上，但不再维护，可能在未来的 React 版本中 break。

### 迁移指南

```
react-test-renderer → React Testing Library

// 原来的做法
const renderer = ReactTestRenderer.create(<MyComponent />);
expect(renderer.toJSON()).toMatchSnapshot();

// 推荐的做法
import { render, screen } from '@testing-library/react';
render(<MyComponent />);
expect(screen.getByRole('button')).toBeInTheDocument();
```

## 6. @testing-library/user-event

[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) 推荐使用 `@testing-library/user-event` 替代 `fireEvent`：

```javascript
// ❌ fireEvent 只触发单个事件
fireEvent.change(input, { target: { value: 'hello' } });

// ✅ userEvent 模拟完整用户交互序列
import userEvent from '@testing-library/user-event';
await userEvent.type(input, 'hello');
// → 触发 keyDown → keyPress → input → keyUp 等更多事件
// → 更接近真实用户行为
```

`user-event` 的 `type()` 会为每个字符触发完整的 keyboard event 序列，而不是只发一个 `change` 事件。这让依赖 keyboard event 的组件（如自动补全、快捷键）在测试中也能正常工作。

## 7. Mock Service Worker (MSW)

[MSW](https://mswjs.io/) 是推荐的 API mock 工具，替代传统的 `fetch` mock：

```javascript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.get('/api/users', () => {
    return HttpResponse.json([{ id: 1, name: 'Alice' }]);
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('displays users', async () => {
  render(<UserList />);
  const users = await screen.findAllByRole('listitem');
  expect(users[0]).toHaveTextContent('Alice');
});
```

MSW 的优势：

- 在 Service Worker 层拦截——测试行为更接近生产
- 不需要修改应用代码
- 同一套 mock 可用于浏览器开发（通过 Service Worker）和 Node 测试

## 8. 测试金字塔

```
        E2E
      /      \     ← 少量：Playwright/Cypress 端到端验证
     /          \
    Integration       ← 适量：React Testing Library 页面级
   /              \
  Unit                ← 大量：单个组件 / utility 函数
```

React 的推荐：

- **大部分测试**在 Integration 级别——用 React Testing Library 渲染整个组件树，使用真实的 DOM
- **少部分测试**在 Unit 级别——纯函数、reducer、custom hooks（react-hooks-testing-library）
- **最少测试**在 E2E 级别——关键用户流程的 smoke test

## 9. 源码文件索引

| 文件/目录 | 职责 |
| ---------- | ------ |
| `packages/react-dom/src/test-utils/` | React DOM 测试工具（含 act() 的 DOM 实现） |
| `packages/react-test-renderer/` | 已废弃的 React 渲染器（JSON 输出） |
| `packages/react-noop-renderer/` | 用于测试 Reconciler 内部逻辑 |
| `packages/jest-react/` | Jest 适配器 |
| `packages/internal-test-utils/` | 通用内部测试工具 |
| `packages/dom-event-testing-library/` | DOM 事件模拟 |
| `packages/react-suspense-test-utils/` | Suspense 专用测试工具 |
| `fixtures/` | 真实可运行的小应用，手动调试用 |

## 10. 常见误区与修正

| 误区 | 修正 |
| ------ | ------ |
| 用 `act()` 包装 `render` 和 `fireEvent` | 这两个函数内部已包装了 `act()` |
| 用 `queryBy*` 做正向断言 | `queryBy*` 只用于反向断言（`not.toBeInTheDocument`） |
| 用 `fireEvent` 而非 `userEvent` | `userEvent` 更接近真实行为 |
| 测试组件内部 state | 测试 DOM 输出而非实现细节 |
| 用 `getByTestId` 作为主查询 | `getByRole` 更好——验证可访问性 |
| 用 `waitFor(() => {})` 空回调 | 等待具体断言，不能等待空回调 |
| 需要手动 `cleanup()` | React Testing Library 自动清理 |

## 下一步

- [手写 mini-react](/practices/01-mini-react/) — 从零实现 React 核心
- [Bundler 集成](/reference/react-bundler-integration) — Babel/SWC/Vite 集成机制
- [术语表](/reference/glossary) — 核心术语速查

## 参考资料

- [React Testing Library 官方文档](https://testing-library.com/docs/react-testing-library/intro/) — ★ 核心哲学和 API
- [Common mistakes with React Testing Library (Kent C. Dodds)](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library) — ★ 15+ 常见错误和修正
- [Fix the "not wrapped in act(...)" warning (Kent C. Dodds)](https://kentcdodds.com/blog/fix-the-not-wrapped-in-act-warning) — act() 详解
- [react-test-renderer Deprecated (官方)](https://react.dev/warnings/react-test-renderer) — 迁移指引
- [Which query should I use? (Testing Library)](https://testing-library.com/docs/queries/about) — 查询优先级
- [user-event](https://testing-library.com/docs/user-event/intro/) — 用户交互模拟
- [MSW (Mock Service Worker)](https://mswjs.io/) — API mock 工具
- [React Source fixtures/ (GitHub)](https://github.com/facebook/react/tree/eafeac097b/fixtures) — 官方测试夹具
- [React Source react-noop-renderer (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-noop-renderer) — Reconciler 自测渲染器
- [React Source react-test-renderer (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/react-test-renderer) — 已废弃的测试渲染器
- [React Source dom-event-testing-library (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/dom-event-testing-library) — DOM 事件测试
- [Which query should I use? (Testing Library)](https://testing-library.com/docs/queries/about/#priority) — 查询优先级完整说明
- [React Testing: Understand and Choose the Right Tools (morintd)](https://morintd.hashnode.dev/react-testing-understand-and-chose-the-right-tools-858236d3c4e1) — 测试工具选型
- [Testing a simple component with React Testing Library (DEV)](https://dev.to/mbarzeev/testing-a-simple-component-with-react-testing-library-5bc6) — 实战示例
- [Experienced Devs: How should I be testing my components? (Reddit)](https://www.reddit.com/r/reactjs/comments/17cwtbr/experienced_devs_how_should_i_be_testing_my/) — 社区讨论
