---
title: "Compiler 限制与手动优化"
---


> React Compiler 1.0 于 2025 年 10 月稳定发布，但它不是万能的。本文基于 100+ 份调研资料，梳理 Compiler 的限制、bailout 场景和何时仍需要手动优化。

## Compiler 不是万能的：实际效果评估

> [Nadia Makarevich 的实测](https://www.developerway.com/posts/i-tried-react-compiler)是目前最诚实的 Compiler 效果评估——3 个真实项目，分别测试了 10/10/8 个已知的不必要重渲染场景。

### 实测结果

| 项目 | 代码量 | 可编译率 | ESLint 违规 | 不必要重渲染被修复 |
| ------ | -------- | --------- | ------------- | ------------------- |
| App One (React+Webpack) | ~150k 行 | 97.7% | 20 | 2/10 |
| App Two (React+Next.js) | ~30k 行 | 97.7% | 1 | 2/10 |
| App Three (个人项目) | 几个页面 | 100% | 0 | 1/8 |

这个结果可能令人失望。原因不在于 Compiler 不够好，而在于**真实应用中的重渲染大多由外部库的不稳定引用导致**，不是 Compiler 能解决的。

### 为什么 Compiler 修不了？

以 App Three 为例——一个简单的国家列表表格，用 react-query 管理数据：

```javascript
export const Countries = () => {
  const [value, setValue] = useState("");
  const { data: countries } = useQuery(...);
  const deleteCountryMutation = useMutation(...);

  const onDelete = (name) => deleteCountryMutation.mutate(name);

  return (
    <TableBody>
      {countries?.map(({ name }) => (
        <TableRow key={name}>
          <Button onClick={() => onDelete(name)}>Delete</Button>
        </TableRow>
      ))}
    </TableBody>
  );
};
```

Compiler 在 DevTools 中显示"已 memoized"，但所有组件仍在重渲染。原因：

```
countries?.map(...) 的内容被 Compiler 缓存
  缓存依赖：[countries, onDelete]

  countries ← 来自 react-query → 引用稳定（库内部做了缓存）✓
  onDelete  ← 每次渲染新创建 → 引用不稳定 ✗

  → onDelete 引用每次都变 → 缓存不命中 → 整个 map 重渲染
```

`onDelete` 依赖 `deleteCountryMutation`，后者每次渲染可能是新对象（取决于 react-query 版本的实现）。Compiler 只能看到代码中的引用——它无法知道外部库的返回值在渲染间是否稳定。

## Compiler 的 5 大限制

### 1. 外部库返回的不稳定引用

```
Compiler 能做：          Compiler 不能做：
  缓存组件内部的值         控制外部库返回的引用稳定性
  比较 props/state 变化    知道 useQuery().data 是否引用稳定
  自动 memoize JSX 元素    修改第三方库的内部实现
```

**解决**：检查外部库是否做了引用稳定化。如 react-query v5 对 `mutate` 函数做了稳定化，但旧版本没有。

### 2. 违反 React Rules 的代码

Compiler 要求代码遵守 React 的规则：

```javascript
// ❌ Compiler 会 bail out：
// 在渲染期间修改 props（违反规则）
function Bad({ items }) {
  items.push('new');  // 直接修改 props
  return <div>{items.length}</div>;
}

// ❌ 在 render 中调用非纯函数
function Bad({ data }) {
  Math.random();  // 副作用
  return <div>{data}</div>;
}

// ✅ 修正后 Compiler 可以优化
function Good({ items }) {
  const newItems = [...items, 'new'];
  return <div>{newItems.length}</div>;
}
```

### 3. `'use no memo'` 指令

开发者可以主动排除某些文件不被 Compiler 处理：

```javascript
'use no memo';

// 此文件中的组件不会被 Compiler 优化
// 用于：与 Compiler 不兼容的遗留代码
export function LegacyComponent() { ... }
```

### 4. Class 组件不支持

Compiler 只处理函数组件和自定义 Hook。Class 组件被完全跳过。

### 5. 动态代码

`eval()`、`new Function()` 等动态代码模式无法被静态分析，Compiler 会跳过包含这些模式的函数。

## 编译器的 Bailout 机制

> [Reddit 上的 6 个月生产使用报告](https://www.reddit.com/r/reactjs/comments/1po9t3c/running_react_compiler_in_production_for_6_months/)指出了一个重要行为：**Compiler 无法优化时静默回退到普通 React 行为，不报错不警告**。

```
Compiler 处理一个组件时：
  1. 尝试分析 → 成功 → 插入 memoization
  2. 尝试分析 → 遇到不支持的 pattern → bail out
     → 组件保持原始代码，不做任何修改
     → 不报错，不警告
     → 开发者不知道这个组件被跳过了
```

这意味着**"安装了 Compiler"不等于"所有组件都被优化了"**。需要用 ESLint 规则和 DevTools 验证。

## ESLint：Compiler 的配套工具

```bash
pnpm install eslint-plugin-react-hooks@latest
```

`react-compiler/react-compiler` 规则会标记 Compiler 不能优化的代码模式：

```javascript
// ❌ ESLint 会标记
function BadComponent({ items }) {
  const sorted = items.sort();  // 修改了原始数组！
  return sorted.map(item => <Item key={item.id} item={item} />);
}

// ✅ 修改后
function GoodComponent({ items }) {
  const sorted = [...items].sort();  // 创建新数组
  return sorted.map(item => <Item key={item.id} item={item} />);
}
```

## 什么时候仍需要手动优化？

### 场景 1：依赖外部库的不稳定引用

```javascript
// Compiler 不能保证 optimize 这里——取决于库的实现
const { mutate } = useMutation();
// 如果 mutate 每次渲染都是新引用 → Compiler 缓存不命中

// 手动修复：用 useRef 稳定化
const mutateRef = useRef(mutate);
mutateRef.current = mutate;
const stableMutate = mutateRef.current;
```

### 场景 2：Context 值未稳定

```javascript
// Provider 的 value 每次渲染都是新对象
<Context.Provider value={{ theme, locale }}>
  {/* Consumer 即使被 Compiler memoize，也因 value 变化而重渲染 */}
</Context.Provider>

// 手动修复
const value = useMemo(() => ({ theme, locale }), [theme, locale]);
```

### 场景 3：极度性能敏感的场景

Compiler 追求"合理优化"而非"完美优化"。在极端场景（如 60fps 动画中的每一帧渲染），手动 `React.memo` + 精确的 props 比较可能更优。

## 渐进式采纳策略

### 策略 1：按目录渐进

```javascript
// babel-plugin-react-compiler 配置
{
  sources: (filename) => {
    return filename.includes('src/components/dashboard');
  },
}
```

### 策略 2：按文件 opt-in

```javascript
'use memo';
// 此文件将被 Compiler 处理
export function HighPerformanceList({ items }) { ... }
```

### 策略 3：ESLint 先行

先用 ESLint 规则扫描整个代码库，修复所有违规模式，再启用 Compiler。

## 生产环境性能数据

| 应用 | 指标 | 改善 |
| ------ | ------ | ------ |
| Meta Quest Store | 初始加载 | 12% 更快 |
| Meta Quest Store | 交互速度 | 2.5x 更快 |
| Sanity Studio | 渲染时间 | 20-30% 降低 |
| Sanity Studio | 可编译组件 | 1231/1411 (87%) |
| Wakelet | LCP | 10% 改善 (2.6s → 2.4s) |
| Wakelet | INP | 15% 改善 (275ms → 240ms) |

## 下一步

- [自动 Memoization 内部机制](/10-react-compiler/01-compiler-internals) — 编译时 + 运行时整体架构
- [编译管线深度分析](/10-react-compiler/02-compiler-pipeline) — 9 步编译管线深度分析
- [useMemo / useCallback](/04-hooks-internals/06-memo-hooks) — 手动 useMemo/useCallback 的实现

## 参考资料

- [I tried React Compiler today (Nadia Makarevich)](https://www.developerway.com/posts/i-tried-react-compiler) — ★ 最诚实的实测，3 个真实项目效果评估
- [Running React Compiler in production for 6 months (Reddit)](https://www.reddit.com/r/reactjs/comments/1po9t3c/running_react_compiler_in_production_for_6_months/) — ★ 6 个月生产经验，含 bailout 行为说明
- [Meta's React Compiler 1.0 (InfoQ)](https://www.infoq.com/news/2025/12/react-compiler-meta/) — 1.0 发布报告，Meta/Sanity/Wakelet 性能数据
- [React Compiler Deep Dive (dev.to)](https://dev.to/pockit_tools/react-compiler-deep-dive-how-automatic-memoization-eliminates-90-of-performance-optimization-work-1351) — 渐进式采纳策略
- [React 19 Blog (官方)](https://react.dev/blog/2024/12/05/react-19) — React 19 + Compiler 稳定发布
- [React Compiler 官方文档](https://react.dev/learn/react-compiler) — 安装和使用指南
- [React 源码 eslint-plugin-react-hooks (GitHub)](https://github.com/facebook/react/tree/eafeac097b/packages/eslint-plugin-react-hooks) — ESLint 规则源码
- [Before You memo() (Dan Abramov)](https://overreacted.io/before-you-memo/) — 手动 memo 化的最佳实践
- [The mystery of React Element, children, parents and re-renders (Nadia Makarevich)](https://www.developerway.com/posts/the-mystery-of-react-element-children-parents-and-rerenders) — children memoization 陷阱
- [React Compiler: In-Depth (Jack Herrington, YouTube)](https://www.youtube.com/watch?v=vyXuS740JgQ) — 编译产物对比分析
