---
title: "从 O(n³) 到 O(n)：React 的妥协之旅"
---



> 对应源码：[`packages/react-reconciler/src/ReactChildFiber.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactChildFiber.js)

## 一个不可能的问题

比较两棵树，找出最少操作把一棵变成另一棵——这是计算机科学中的经典问题。[React 官方文档](https://legacy.reactjs.org/docs/reconciliation.html) 在 Reconciliation 一节解释了为什么需要这些假设。最优解的时间复杂度是 **O(n³)**。

一棵 1000 个节点的树，需要 10 亿次比较。

React 的组件树动辄上千节点。10 亿次比较在主线程上跑完，用户早就等不及了。

React 的回答很直接：**不找最优解，找一个"够好的"解。**

他们用两个假设，把 O(n³) 砍到了 O(n)。1000 倍的性能提升。

代价是什么？**React 有时会做多余的操作**——本可以复用的节点被销毁重建了。但实践中，这个代价可以接受。

## 两个"妥协"

```
妥协 1：不同类型的元素 → 直接销毁重建，不尝试 Diff
  <div> → <span>   销毁 div 子树，创建 span 子树
  <Counter /> → <Button />   销毁 Counter，创建 Button

  理由：不同类型的组件几乎一定产生不同的树，
        Diff 它们大概率是浪费时间。

妥协 2：用 key 标识"同一个"子元素
  旧：[<li key="A"/>, <li key="B"/>]
  新：[<li key="B"/>, <li key="A"/>]
  
  React 知道 A 和 B 只是位置变了，不需要销毁重建。
```

没有这两个假设，O(n³) 不可避。有了它们，O(n) 就够了。

## 单节点 Diff：最简单的情况

组件返回一个单独的子元素（不是数组）时：

```jsx
// 旧
<div className="old">Hello</div>

// 新
<div className="new">World</div>
```

React 的处理很简单——看 type 和 key：

```
旧 Fiber          新 Element
type: 'div'       type: 'div'      → 相同？
key: null         key: null         → 相同？
                                    → 都相同 → 复用！更新 props

旧 Fiber          新 Element
type: 'div'       type: 'span'      → 不同！
key: null         key: null
                                    → 销毁 div，创建 span
```

```javascript
// ReactChildFiber.js（简化）
function reconcileSingleElement(returnFiber, currentFirstChild, element) {
  let child = currentFirstChild;
  while (child !== null) {
    if (child.key === element.key) {
      if (child.elementType === element.type) {
        // key 和 type 都相同 → 复用
        deleteRemainingChildren(returnFiber, child.sibling);
        const existing = useFiber(child, element.props);
        existing.return = returnFiber;
        return existing;
      }
      // key 相同但 type 不同 → 删除旧子树
      deleteRemainingChildren(returnFiber, child);
      break;
    }
    // key 不同 → 删除这个 child，继续看 sibling
    deleteChild(returnFiber, child);
    child = child.sibling;
  }
  // 都不匹配 → 创建新 Fiber
  const created = createFiberFromElement(element, returnFiber.mode, lanes);
  created.return = returnFiber;
  return created;
}
```

## 多节点 Diff：两轮扫描

组件返回数组（多个子元素）时，事情变复杂了。React 用**两轮扫描**：

```
旧：[A, B, C, D]
新：[A, B', E, F, C]
```

```
第一轮：从头向后逐个比较
  旧 A vs 新 A → key 相同，type 相同 → 复用 ✓
  旧 B vs 新 B' → key 相同，type 相同 → 复用，更新 ✓
  旧 C vs 新 E → key 不同 → break，第一轮结束

第二轮：处理剩余
  旧剩余 [C, D] → 放入 Map（按 key 索引）
  新剩余 [E, F, C]

  遍历新剩余：
    E → Map 里没有 → 新建
    F → Map 里没有 → 新建
    C → Map 里有 → 复用！标记移动
    从 Map 删除 C

  Map 剩余 [D] → 删除
```

为什么分两轮？因为第一轮处理"位置没变"的情况（快路径），第二轮处理"位置变了或新增/删除"的情况（慢路径）。大多数更新只有前几个元素变了，第一轮就能覆盖。

## lastPlacedIndex：判断"要不要移动"

多节点 Diff 中有个精巧的机制叫 `lastPlacedIndex`——一个"高水位线"：

```javascript
function placeChild(newFiber, lastPlacedIndex, newIndex) {
  newFiber.index = newIndex;
  if (!shouldTrackSideEffects) {
    // mount 时不追踪副作用 → 只标记 Forked（useId 算法需要）
    newFiber.flags |= Forked;
    return lastPlacedIndex;
  }
  const current = newFiber.alternate;
  if (current !== null) {
    // 复用：判断是否需要移动
    const oldIndex = current.index;
    if (oldIndex < lastPlacedIndex) {
      // 旧位置 < 水位线 → 需要移动
      newFiber.flags |= Placement;
      return lastPlacedIndex;
    } else {
      // 不需要移动
      return oldIndex;
    }
  } else {
    // 新节点 → 标记 Placement
    newFiber.flags |= Placement | PlacementDEV;
    return lastPlacedIndex;
  }
}
```

逻辑是：如果一个复用节点的旧位置在前一个复用节点的旧位置**之前**，说明它需要前移。

```
旧：[A(0), B(1), C(2), D(3)]
新：[A, C, E, B]

第一轮：
  A vs A → key 相同 → 复用，oldIndex=0, lastPlacedIndex=0
  C vs B → key 不同 → break

第二轮（Map: {B:1, C:2, D:3}）：
  C → Map 找到，oldIndex=2 ≥ 0 → 不移动，lastPlacedIndex=2
  E → 新建 → Placement
  B → Map 找到，oldIndex=1 < 2 → 需要移动！Placement

Map 剩余 [D] → 删除

结果：A 不动，C 不动，E 新建，B 移动，D 删除
```

## key 到底做了什么

现在你理解了 key 的作用了吧？

**没有 key（React 用 index 当 key）**：

```
旧：[A(index=0), B(index=1), C(index=2)]
新：[D(index=0), A(index=1), B(index=2), C(index=3)]

第一轮：
  新[0] vs 旧[0] → index 匹配但 type 不同(A vs D) → 删 A 建 D
  新[1] vs 旧[1] → index 匹配但 type 不同(B vs A) → 删 B 建 A
  新[2] vs 旧[2] → index 匹配但 type 不同(C vs B) → 删 C 建 B
  新[3] → 新建 C

  → 4 个全部销毁重建！
```

**有 key**：

```
旧：[A(key="a"), B(key="b"), C(key="c")]
新：[D(key="d"), A(key="a"), B(key="b"), C(key="c")]

第一轮：
  新[0](key="d") vs 旧[0](key="a") → key 不匹配 → break

第二轮（Map: {a:A, b:B, c:C}）：
  D → Map 没有 → 新建
  A → Map 有 → 复用，oldIndex=0，不移动
  B → Map 有 → 复用，oldIndex=1，不移动
  C → Map 有 → 复用，oldIndex=2，不移动

  → 只新建 1 个（D），复用 3 个！
```

这就是为什么 React 文档说"不要用 index 作为 key"——不是建议，是性能问题。用了 index，当列表头部插入元素时，每个元素都会因为 type 对不上而被销毁重建（虽然 Diff 仍然是 O(n)，但实际工作量远大于用 key 时的"一个新建 + 三个复用"）。[React 技术揭秘 - Diff 算法](https://react.iamkasong.com/diff/index.html) 用动画演示了这个过程。

## mount vs update：副作用追踪

```javascript
// ReactChildFiber.js
function reconcileChildren(current, workInProgress, nextChildren, renderLanes) {
  if (current === null) {
    // mount：首次渲染，不标记 Placement
    // （整棵树都是新的，统一在 completeWork/commit 处理）
    workInProgress.child = mountChildFibers(workInProgress, null, nextChildren, renderLanes);
  } else {
    // update：标记 Placement/Update/ChildDeletion
    workInProgress.child = reconcileChildFibers(workInProgress, current.child, nextChildren, renderLanes);
  }
}
```

`mountChildFibers` 和 `reconcileChildFibers` 是同一个函数的两个实例，区别只在 `shouldTrackSideEffects`：

- mount 时 `false`：不标记副作用（省内存，整棵树一起处理）
- update 时 `true`：精确标记每个变化

## 回头看

从 O(n³) 到 O(n) 的代价是两个假设：

1. 不同类型 = 不同树（放弃跨类型复用）
2. key 标识同一性（依赖开发者提供正确 key）

这两个假设在实践中几乎总是成立。当它们不成立时（比如用 index 当 key），性能会退化——但结果仍然正确。

React 选择了"够好"而非"最优"。在 UI 场景中，这是正确的权衡。

## 下一步

- [beginWork 详解](/03-work-loop/02-begin-work) — beginWork 中如何调用 reconcileChildren
- [Commit 阶段](/03-work-loop/05-commit-phase) — Diff 产出的 flags 如何在 Commit 阶段变成 DOM 操作
- [手写 mini-react](/practices/01-mini-react/) — 手写一个简化版 Diff 算法

## 参考资料

- [Reconciliation (React 官方文档)](https://legacy.reactjs.org/docs/reconciliation.html) — 官方 Diff 算法说明，包含两个启发式假设的原始描述。
- [React 技术揭秘 - Diff 算法 (卡颂)](https://react.iamkasong.com/diff/index.html) — 中文 Diff 分析，包含单节点和多节点的详细源码解读。
- [Inside Fiber (Max Koretskyi) - ChildReconciler](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — 最详细的 Diff 源码分析。
- [Build your own React - Reconciliation (Rodrigo Pombo)](https://pomb.us/build-your-own-react/) — 从零实现 Diff 算法，渐进式叙事的典范。
- [How Does setState Know What to Do? (Dan Abramov)](https://overreacted.io/how-does-setstate-know-what-to-do/) — Dan Abramov 的"从一个简单问题深入到底层"的叙事风格示例。
