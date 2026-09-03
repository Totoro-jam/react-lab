---
title: "React Compiler：自动 Memoization 的内部机制"
---


> 对应源码：[`compiler/`](https://github.com/facebook/react/tree/eafeac097b/compiler), [`compiler/packages/react-compiler-runtime/src/index.ts`](https://github.com/facebook/react/blob/eafeac097b/compiler/packages/react-compiler-runtime/src/index.ts)

## 从手动 memoization 的痛点说起

你写了 4 年 React，一定写过这种代码：

```jsx
function Parent({ data }) {
  const [isOpen, setIsOpen] = useState(false);
  
  // 手动 memoize
  const handleSubmit = useCallback(() => { ... }, [data]);
  const processedData = useMemo(() => expensiveProcess(data), [data]);
  
  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
      <Child data={processedData} onSubmit={handleSubmit} />
    </>
  );
}
```

`useMemo`、`useCallback`、`React.memo`——这些工具本身不难理解。难的是**知道什么时候该用，什么时候不该用，以及依赖数组有没有写对**。

一个 4 年经验的开发者仍然可能：

- 忘记把 `children` 用 `useMemo` 包裹（不是 `React.memo`！）
- 在依赖数组里漏了一个变量
- 过度 memoize 了本不需要 memoize 的值

React Compiler 的目标是：**让编译器帮你做这些**。

> **更新（2025-10）**：React Compiler 1.0 在 2025 年 10 月正式发布为稳定版本。[Meta 报告](https://www.infoq.com/news/2025/12/react-compiler-meta/) Quest Store 使用 Compiler 后获得了 12% 性能提升。截至 2026 年，Compiler 已在 Meta 内部数千个组件中投入生产使用。详见 **05-version-history.md** 和 [Scrimba 2026 状态表](https://scrimba.com/articles/react-19-whats-new-for-developers/)。

## 它是怎么做到的：编译时 + 运行时

React Compiler 分两部分：

```
编译时（Babel Plugin）                    运行时（react-compiler-runtime）
──────────────────────────────           ──────────────────────────────────
分析你的源码                              提供 useMemoCache 函数（c 函数）
识别哪些值需要 memoize                    存储缓存数组（通过 useState）
找出依赖关系                              比较新旧值决定是否更新
生成带 memoization 的代码                返回缓存的或新计算的值
```

编译前 vs 编译后示例：

```javascript
// ── 编译前 ──────────────────────────
function Component({ color }) {
  return <div style={{ color }}>hello</div>;
}

// ── 编译后 ──────────────────────────
function Component(t0) {
  const $ = _c(2);                  // ← 运行时缓存（2 个槽位）
  const { color } = t0;
  let t1;
  if ($[0] !== color) {             // ← 依赖检查
    t1 = <div style={{ color }}>hello</div>;
    $[0] = color;                  // 记录依赖
    $[1] = t1;                     // 记录结果
  } else {
    t1 = $[1];                     // ← 命中缓存
  }
  return t1;
}
```

## 编译时：Babel Plugin 的工作流程

### 入口：compileProgram

```javascript
// compiler/packages/babel-plugin-react-compiler/src/Babel/BabelPlugin.ts
export default function BabelPluginReactCompiler(_babel) {
  return {
    name: "react-forget",
    visitor: {
      Program(prog, pass) {
        compileProgram(prog, { opts, filename, comments, code });
      },
    },
  };
}
```

Babel 插件从顶层 `Program` 节点开始遍历，对每个文件执行编译。

### 遍历函数

```javascript
// compiler/packages/babel-plugin-react-compiler/src/Entrypoint/Program.ts（简化）

program.traverse({
  // 跳过类（this 引用不安全）
  ClassDeclaration(node) { node.skip(); },
  ClassExpression(node) { node.skip(); },
  
  // 编译函数
  FunctionDeclaration: traverseFunction,
  FunctionExpression: traverseFunction,
  ArrowFunctionExpression: traverseFunction,
});
```

React Compiler **只编译函数**——不编译类的内部。因为类方法的 `this` 引用难以静态分析。

### getReactFunctionType：识别哪些函数要编译

```javascript
// 简化：识别函数类型
const fnType = getReactFunctionType(fn, pass);
// 返回: "Component" | "Hook" | "Other" | null

// 识别逻辑（infer 模式，默认）：
// 1. 有 "use no forget" / "use no memo" 注释 → null（跳过）
// 2. 有 "use memo" / "use forget" 注释 → Component 或 Hook
// 3. 函数名以大写开头 → Component
// 4. 函数名以 "use" 开头 → Hook
// 5. 其他 → null 或 "Other"
```

### 替换并添加 import

编译完成后，用编译后的函数替换原始函数，并添加 `useMemoCache` 的 import：

```javascript
// 如果有 memoization 被使用
if (compiledFns.length > 0) {
  let needsMemoCacheImport = false;
  for (const fn of compiledFns) {
    if (fn.compiledFn.memoSlotsUsed > 0) {
      needsMemoCacheImport = true;
      break;
    }
  }
  if (needsMemoCacheImport) {
    // 添加 import { c as _c } from "react/compiler-runtime";
    updateMemoCacheFunctionImport(program, "react/compiler-runtime", "_c");
  }
}
```

## 运行时：useMemoCache（c 函数）

编译后的代码调用 `_c(size)` 来获取缓存数组。这个函数的实际实现：

```javascript
// compiler/packages/react-compiler-runtime/src/index.ts:17-40

const $empty = Symbol.for('react.memo_cache_sentinel');

// 优先使用 React 19 的内置实现
export const c =
  typeof React.__COMPILER_RUNTIME?.c === 'function'
    ? React.__COMPILER_RUNTIME.c
    : // 兼容 React 18 的 polyfill
      function c(size: number) {
        return React.useMemo<Array<unknown>>(() => {
          const $ = new Array(size);
          for (let ii = 0; ii < size; ii++) {
            $[ii] = $empty;  // 初始值：sentinel symbol
          }
          // 标记给 DevTools 识别
          $[$empty] = true;
          return $;
        }, []);
      };
```

**核心：`_c(size)` 本质上是一个 `useMemo` 创建的固定大小数组。** 数组的每个位置初始为 `$empty`（一个 sentinel Symbol），后续被编译后的代码用作缓存槽位。

React 19 内置了更高效的 `useMemoCache` 实现（直接在 Reconciler 中），React 18 需要 `react-compiler-runtime` polyfill。

## 编译后的代码长什么样

### 编译前

```jsx
function Component({ color }) {
  return <div style={{ color }}>hello world</div>;
}

export default function MyApp() {
  const color = "red";
  return <Component color={color} />;
}
```

### 编译后

```javascript
function Component(t0) {
  const $ = _c(2);           // 2 个缓存槽位

  const { color } = t0;
  let t1;

  if ($[0] !== color) {       // 槽位 0：缓存依赖（color）
    t1 = (                     // 槽位 1：缓存计算结果
      <div style={{ color }}>hello world</div>
    );
    $[0] = color;              // 记录依赖
    $[1] = t1;                 // 记录结果
  } else {
    t1 = $[1];                 // 命中缓存！
  }

  return t1;
}

function MyApp() {
  const $ = _c(1);

  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <Component color="red" />;
    $[0] = t0;
  } else {
    t0 = $[0];
  }

  return t0;
}
```

### 编译模式的规律

```
编译后的每个"需要 memoize 的值"都遵循这个模式：

const $ = _c(slotsCount);   // 获取缓存数组
let result;

if ($[ depKeySlot ] !== currentDepValue) {
  // 依赖变了 → 重新计算
  result = compute(...);
  $[ depKeySlot ] = currentDepValue;  // 更新依赖缓存
  $[ resultSlot ] = result;            // 更新结果缓存
} else {
  // 依赖没变 → 使用缓存
  result = $[ resultSlot ];
}
```

这是一种**朴素的值缓存**——不像 `useMemo` 有 deps 数组，而是直接用数组的固定位置。每个被 memoize 的值占两个槽位：一个存依赖键，一个存结果值。

## 它为什么不是银弹

### 实测结果

Nadia Makarevich 在 [I tried React Compiler today](https://www.developerway.com/posts/i-tried-react-compiler) 中做了详细实测：

```
3 个真实项目，总计 28 个不必要的重新渲染

App One (150k 行，旧项目)：
  97.7% 组件可编译，20 个 eslint 违规
  → 10 个问题中只修复了 2 个（20%）

App Two (30k 行，Next.js)：
  97.7% 组件可编译，1 个 eslint 违规
  → 10 个问题中只修复了 2 个（20%）

App Three (小项目，全新)：
  100% 组件可编译，0 个 eslint 违规
  → 8 个问题中只修复了 1 个（12.5%）
```

### 为什么效果不如预期

核心原因：**当整个表格的渲染内容依赖一个未 memoize 的外部数据源时，Compiler 无法帮你**。

```jsx
// 问题所在：
const { data: countries } = useQuery(...);  // react-query 返回的数据
const onDelete = (name) => deleteMutation.mutate(name);

// Compiler 会 memoize <TableRow> 元素，
// 但 memoize 的依赖是 [countries, onDelete]
// 如果 onDelete 每次渲染都是新函数引用 → 缓存永远不命中
// Compiler 能 memoize onDelete 吗？
// 能，但 onDelete 依赖 deleteMutation
// deleteMutation 来自 useMutation → 每次渲染可能是新对象
// → 链式失败
```

Compiler 能 memoize 组件内部的值，但**不能改变外部库的引用稳定性**。如果 `useMutation` 返回的对象每次都不同，Compiler 的缓存就永远不命中。

## $reset 和 $structuralCheck

### $reset：重置缓存

```javascript
// react-compiler-runtime/src/index.ts:186-190
export function $reset($: MemoCache) {
  for (let ii = 0; ii < $.length; ii++) {
    $[ii] = $empty;
  }
}
```

将所有缓存槽位重置为 sentinel。开发模式下用于 StrictMode 双重渲染后的重置。

### $structuralCheck：结构一致性检查

```javascript
// react-compiler-runtime/src/index.ts:252-260
export function $structuralCheck(oldValue, newValue, variableName, fnName, kind, loc) {
  // 深度比较两个值的结构
  // 如果结构不一致（比如 memoize 的值被外部 mutation 了）
  // 记录警告
  const depthLimit = 2;
  function recur(oldValue, newValue, path, depth) {
    // ... 递归比较结构
  }
  recur(oldValue, newValue, '', 0);
}
```

这是开发模式的安全网——检查被 memoize 的值没有被外部 mutating。如果 Compiler memoize 了一个数组，但外部代码 `array.push(...)` 修改了它，`$structuralCheck` 会发现"memoized 值的结构变了但不应该变"。

## React Compiler 与传统 memoization 的对比

```
传统手动 memoization                    React Compiler
─────────────────────────             ──────────────────
开发者手动判断                           编译器自动分析
哪些值需要 memo                          哪些值需要 memo

需要手写 deps 数组                       不需要 deps 数组
  useMemo(fn, [a, b, c])               编译器自动推断依赖
  漏写/多写 → bug                        自动正确

粒度 = Hook 调用                         粒度 = 每个"值"
  一个 useCallback 缓存一个函数          缓存 JSX、对象、函数、数组...
  不缓存不经过 Hook 的中间值             连 `const x = { a: 1 }` 都能缓存

开发者负担                               开发者负担
  必须理解 deps 语义                     不需要理解 memoization
  必须维护 deps 数组                     写普通代码即可

无法自动检测                             自动检测违规
  修改 props 不会报错                    ESLint 规则标记违规代码
  mutation 导致 memo 失效无感知          $structuralCheck 发现 mutation

运行时开销                               运行时开销
  每次 Hook 调用执行 deps 比较           数组位比较（可能更快）
  deps 数组分配                           零分配（缓存数组由 useMemoCache 管理）

局限性                                   局限性
  不用就不优化                           外部库引用不稳定时无效
  用多了也浪费                           bail out 时静默跳过
```

核心区别：传统 memoization 是**开发者负责**的 opt-in 工具，Compiler 是**编译器负责**的自动机制。开发者不再需要关心"该不该 memoize"和"deps 写对了没有"——把这些问题交给编译器。

## React Compiler 的架构在源码中的位置

```
compiler/
├── packages/
│   ├── babel-plugin-react-compiler/   ← Babel 插件（TypeScript 实现）
│   ├── react-compiler-runtime/         ← 运行时（useMemoCache / c 函数）
│   └── ...
├── crates/                             ← Rust 编译器实现（正在迁移中）
└── docs/rust-port/                     ← Rust 移植设计文档
```

当前版本以 Babel/TypeScript 实现为主。React 团队正在将编译器核心移植到 Rust（见 `CLAUDE.md` 中的 "Rust Compiler Port"），目标是用 `rust-research` 分支实现更高的编译速度。

## 下一步

- [useMemo / useCallback](/04-hooks-internals/06-memo-hooks) — 手动 memoization（useMemo/useCallback）的方式
- [叙事风格写作指南](/reference/writing-style-guide) — antfu 式叙事风格指南
- [React Compiler 官方文档](https://react.dev/learn/react-compiler) — 如何安装和使用

## 参考资料

- [React Compiler 官方文档](https://react.dev/learn/react-compiler) — 安装、使用、注意事项
- [I tried React Compiler today (Nadia Makarevich)](https://www.developerway.com/posts/i-tried-react-compiler) — ★ 最详细的实测分析，3 个真实项目的效果评估
- [React Compiler, How Does It Work? [1] (Yongseok)](https://yongseok.me/blog/en/react_compiler_1/) — ★ 从 Babel Plugin 入口到编译输出的完整源码分析
- [React Compiler: In-Depth Beyond React Conf 2024 (Jack Herrington)](https://www.youtube.com/watch?v=vyXuS740JgQ) — YouTube 视频讲解
- [React Compiler Deep Dive (Sathya Gunasekaran)](https://www.youtube.com/watch?v=O8Pv6Z1JgTM) — React 核心团队的深度讲解 + live coding
- [React Compiler Playground](https://playground.react.dev/) — 在线编译器，可直接看编译前后的代码对比
- [React 源码 compiler/packages/react-compiler-runtime (GitHub)](https://github.com/facebook/react/blob/eafeac097b/compiler/packages/react-compiler-runtime/src/index.ts) — 运行时实现源码
- [React 源码 compiler/packages/babel-plugin-react-compiler (GitHub)](https://github.com/facebook/react/tree/eafeac097b/compiler/packages/babel-plugin-react-compiler) — Babel 插件源码
- [With the new React Forget compiler (Reddit)](https://www.reddit.com/r/reactjs/comments/1rg7wqj/with_the_new_react_forget_compiler_handling/) — 社区讨论
- [React 19: What's New for Developers (Scrimba)](https://scrimba.com/articles/react-19-whats-new-for-developers/) — React 19 全新特性一览，包含 Compiler 1.0 发布信息
- [Claude Agent Skills: First Principles (Medium)](https://medium.com/aimonks/claude-agent-skills-a-first-principles-deep-dive-into-prompt-based-meta-tools-022de66fc721) — Progressive disclosure 设计详解
- [The mystery of React Element, children, parents and re-renders (Nadia Makarevich)](https://www.developerway.com/posts/the-mystery-of-react-element-children-parents-and-rerenders) — children memoization 的难点
