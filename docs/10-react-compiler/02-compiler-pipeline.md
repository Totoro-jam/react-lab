---
title: "编译管线深度分析"
---


> 对应源码：[`compiler/packages/babel-plugin-react-compiler/`](https://github.com/facebook/react/tree/eafeac097b/compiler/packages/babel-plugin-react-compiler), [React Compiler Playground](https://playground.react.dev/)

## 一句话概括

React Compiler 做的事情可以用一句话概括：**"自动插入判断'这个值是否和上次渲染相同'的代码"**。

但如果拆开编译管线的 9 个步骤，每一步都有精确的设计意图。本文基于 [yceffort 的 Compiler Deep Dive](https://yceffort.kr/en/2026/02/react-compiler-deep-dive) 和 [React Compiler Playground](https://playground.react.dev/) 的 `Show Internals` 功能逐步拆解。

## 9 步编译管线概览

```
源代码 (JS/TSX)
    │
    ├─ Step 1: AST 解析 + 编译目标识别
    │   Babel 解析 → AST → 找出函数组件和自定义 Hook
    │
    ├─ Step 2: Lowering — AST → HIR
    │   高级 AST 转为高级中间表示 (HIR)
    │   HIR 是控制流图：基本块 + 指令序列
    │
    ├─ Step 3: SSA 转换
    │   每个变量只赋值一次 → φ 节点处理分支合并
    │   揭示数据依赖链
    │
    ├─ Step 4: 验证 + 基础优化
    │   移除手动 useMemo/useCallback、常量传播、死代码消除
    │
    ├─ Step 5: 类型推断 (InferTypes)
    │   推断每个值的类型：TPrimitive, TObject, THook...
    │
    ├─ Step 6: 效果分析 (InferMutationAliasingEffects)
    │   追踪 Read/Store/Capture/Mutate/Freeze 五种效果
    │   确定"缓存这个值是否安全？"
    │
    ├─ Step 7: 反应性分析 (InferReactivePlaces)
    │   判断每个值"在渲染间是否可能变化"
    │   Reactive vs Non-reactive
    │
    ├─ Step 8: 缓存单元划分 (BuildReactiveFunction)
    │   将相关值分组为 scope → 每个 scope = 一个 if 块
    │
    └─ Step 9: 代码生成 (Codegen)
        输出含 _c() 和依赖比较的最终代码
```

## Step 1-4：将代码转为可分析的形式

### Step 1: AST 解析

Babel 将源码解析为 AST（抽象语法树）。Compiler 从 AST 中识别：

- **函数组件**：返回 JSX 的函数
- **自定义 Hook**：以 `use` 开头的函数
- **排除项**：含 `'use no memo'` 指令的函数被跳过

### Step 2: AST → HIR (Lowering)

AST 展示代码结构，但不方便分析"代码以什么顺序执行"。Lowering 将 AST 转为 **HIR (High-level Intermediate Representation)**——一种保留高级结构（JSX、逻辑运算）但以控制流图组织的中间表示。

```javascript
// 源代码
function List({ items }) {
  const [selItem, setSelItem] = useState(null);
  const pItems = processItems(items);
  return <ul>{pItems.map(item => <li>{item}</li>)}</ul>;
}

// HIR（概念性）
function List bb0 (block):
  [1] $0 = Destructure items from params
  [2] $1 = Call useState(null)       // selItem, setSelItem
  [3] $2 = Call processItems($0)     // pItems
  [4] $3 = Function (item) => JSX <li>{item}</li>
  [5] $4 = MethodCall $2.map($4)     // listItems
  [6] $5 = JSX <ul>{$5}</ul>
  [7] Return $6
```

每个指令生成一个带唯一标识符的值（`$0`, `$1`, ...）。`bb0` 是基本块（basic block）——一组顺序执行的指令。条件分支会创建多个基本块。

关键设计决策：HIR **保留 JSX 和逻辑运算**，不转为低级表示。这让调试更容易——编译产物中仍然能看到原始的 JSX 结构。

### Step 3: SSA 转换

HIR 捕获了执行流，但当同一变量在多处赋值时，难以追踪"此刻 x 的值来自哪里"。**SSA (Static Single Assignment)** 解决这个问题——每个变量只赋值一次。

```javascript
// 普通代码
let x = 1;
if (cond) { x = 2; }
use(x);

// SSA 形式
x_0 = 1;
if (cond) { x_1 = 2; }
x_2 = φ(x_0, x_1);  // φ 节点：在分支合并处选择版本
use(x_2);
```

SSA 清晰地揭示了数据依赖链：`items` → `processItems(items)` → `pItems.map(...)`。每个值只定义一次，追踪"这个值从哪来"变得直接。

### Step 4: 验证和基础优化

SSA 完成后，执行几个验证和优化 pass：

- **PruneMaybeThrows**：异常可能性分析
- **DropManualMemoization**：分析现有的 `useMemo`/`useCallback`，将它们与编译器优化集成
- **EliminateRedundantPhi**：移除不必要的 φ 节点
- **ConstantPropagation**：常量传播
- **DeadCodeElimination**：移除未使用的代码

## Step 5-7：识别值的特征

### Step 5: 类型推断 (InferTypes)

推断每个值的编译器内部类型（不同于 TypeScript 类型）：

| 类型 | 含义 | 对 memo 策略的影响 |
| ------ | ------ | ------------------- |
| `TPrimitive` | 原始值（字符串、数字、布尔） | 比较成本低，适合做依赖 |
| `TObject<BuiltInJsx>` | JSX 元素 | 传递给子组件时需要引用稳定 |
| `THook` | Hook 返回值 | 反应性——可能每次渲染变化 |
| `TObject` | 普通对象/数组 | 引用比较——需要依赖检查 |

### Step 6: 效果分析 (InferMutationAliasingEffects)

这是 Compiler 最精密的部分之一。它分析每个操作对数据的效果，为"缓存这个值是否安全"和"分组到什么程度"提供依据。

五种效果：

```
Read    — 只读取值             → 作为依赖追踪
Store   — 存储值               → 标记新值的创建
Capture — 闭包捕获值引用         → 捕获的值可能变化
Mutate  — 修改值               → 延展 scope 直到 mutation 完成
Freeze  — 值变为不可变          → 从此刻起可以安全缓存
```

#### Capture vs Freeze 的关键差异

```javascript
function CaptureExample({ onClick, label }) {
  const data = { count: 0 };
  const handler = () => { onClick(data) };  // handler 捕获了 data
  return <button onClick={handler}>{label}</button>;
}
```

Compiler 的效果分析：

```
data = { count: 0 }     → Create data = mutable（新对象，可变）
handler = () => { ... } → Capture onClick, data（捕获了引用）
<button onClick={...}>  → Freeze handler, label（传入 JSX 后不可变）
```

`Capture` 意味着 handler 持有 data 的引用，data 仍可能变化。`Freeze` 意味着值传入 JSX 后不再变化——React 不会修改 props，因此从这一刻起可以安全缓存。

#### Mutate 如何延展 Scope

```javascript
function MutateExample({ items, title }) {
  const result = [];
  for (const item of items) {
    result.push(<li key={item.id}>{item.name}</li>);  // 持续 mutate
  }
  return <ul title={title}>{result}</ul>;
}
```

`result = []` 后在 for 循环中持续 `push`。Compiler 必须把"创建 + 所有 mutation"放在同一个 scope 中——如果在中间切分 scope，会缓存到不完整的值。

### Step 7: 反应性分析 (InferReactivePlaces)

回答最关键的问题：**"哪些值在渲染间可能变化？"**

```
Reactive（每次渲染可能变化）:
  items    ← props
  selItem  ← useState 返回值
  pItems   ← 由 items 派生（反应性）

Non-reactive（渲染间不变）:
  null     ← 字面量
  0        ← 字面量
  (item) => <li>{item}</li>  ← 无外部依赖的函数（提升到模块级）
```

这个区分是 memo 策略的核心：

- Non-reactive 值用 **sentinel 模式**——只创建一次，后续命中缓存
- Reactive 值用 **依赖比较模式**——只有依赖变化时才重新计算

## Step 8-9：输出最终代码

### Step 8: 缓存单元划分

基于 Step 5-7 的分析结果，决定"把哪些值分到同一个缓存组"。相关值被分组为 **scope**，一个 scope 对应最终输出中的一个 `if` 块。

```
CaptureExample 的 scope 划分:

scope @1  dependencies=[]      declarations=[data]
  data = { count: 0 }          ← non-reactive，sentinel 模式

scope @2  dependencies=[onClick] declarations=[handler]
  handler = () => { onClick(data) }  ← 捕获了 reactive 的 onClick

scope @3  dependencies=[handler, label] declarations=[jsx]
  <button onClick={handler}>{label}</button>  ← 依赖 handler 和 label
```

### Step 9: 代码生成 (Codegen)

最终输出含 `_c()`（`useMemoCache`）和依赖比较的代码：

```javascript
function CaptureExample(t0) {
  const $ = _c(6);  // 6 个缓存槽
  const { onClick, label } = t0;

  // scope @1: data 是字面量 → sentinel 模式（只创建一次）
  let t1;
  if ($[0] === Symbol.for('react.memo_cache_sentinel')) {
    t1 = { count: 0 };
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  const data = t1;

  // scope @2: handler 捕获了 onClick → 依赖比较模式
  let t2;
  if ($[1] !== onClick) {       // ← 比较依赖
    t2 = () => { onClick(data) };
    $[1] = onClick;             // ← 记录依赖
    $[2] = t2;                  // ← 记录结果
  } else {
    t2 = $[2];                  // ← 命中缓存
  }
  const handler = t2;

  // scope @3: JSX 依赖 handler 和 label
  let t3;
  if ($[3] !== handler || $[4] !== label) {
    t3 = <button onClick={handler}>{label}</button>;
    $[3] = handler;
    $[4] = label;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  return t3;
}
```

## 两种缓存模式总结

```
Sentinel 模式（non-reactive 值）:
  if ($[slot] === Symbol.for('react.memo_cache_sentinel')) {
    // 首次创建
    $[slot] = value;
  } else {
    // 后续直接取
  }
  → 只创建一次，永远命中

依赖比较模式（reactive 值）:
  if ($[depSlot] !== depValue) {
    // 依赖变了 → 重新计算
    $[depSlot] = depValue;
    $[resultSlot] = newValue;
  } else {
    // 依赖没变 → 命中缓存
  }
  → 只有依赖变化时才重算
```

## 下一步

- [自动 Memoization 内部机制](/10-react-compiler/01-compiler-internals) — 编译时 + 运行时的整体架构和 `useMemoCache` 运行时
- [Compiler 限制与手动优化](/10-react-compiler/03-compiler-limitations) — Compiler 不能优化的场景和手动优化的补充

## 参考资料

- [React Compiler Deep Dive: From Principles to Output (yceffort)](https://yceffort.kr/en/2026/02/react-compiler-deep-dive) — ★ 24 分钟深度分析，9 步管线逐行拆解
- [React Compiler Deep Dive: How Automatic Memoization Eliminates 90% of Work (dev.to)](https://dev.to/pockit_tools/react-compiler-deep-dive-how-automatic-memoization-eliminates-90-of-performance-optimization-work-1351) — ★ 从原理到编译产物的完整指南
- [React Compiler Playground](https://playground.react.dev/) — ★ 在线编译器，Show Internals 可查看每步输出
- [React Compiler, How Does It Work? [1] (Yongseok)](https://yongseok.me/blog/en/react_compiler_1/) — Babel Plugin 入口到编译输出的源码分析
- [Meta's React Compiler 1.0 (InfoQ)](https://www.infoq.com/news/2025/12/react-compiler-meta/) — 1.0 发布报告，含 Meta Quest Store 12% 性能提升
- [React Compiler Deep Dive (Sathya Gunasekaran, YouTube)](https://www.youtube.com/watch?v=O8Pv6Z1JgTM) — React 核心团队的深度讲解 + live coding
- [React 19 Blog (官方)](https://react.dev/blog/2024/12/05/react-19) — React 19 官方发布说明
- [React 源码 compiler/packages/babel-plugin-react-compiler (GitHub)](https://github.com/facebook/react/tree/eafeac097b/compiler/packages/babel-plugin-react-compiler) — Babel 插件源码
- [Running React Compiler in production for 6 months (Reddit)](https://www.reddit.com/r/reactjs/comments/1po9t3c/running_react_compiler_in_production_for_6_months/) — 6 个月生产环境经验
- [Lydia Hallie React Summit 2025 (YouTube)](https://www.youtube.com/watch?v=LGTwZBDIbbQ) — SSA 和数据流分析的视觉化讲解
