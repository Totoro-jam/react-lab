---
title: "React.Children"
---



> 对应源码：[`packages/react/src/ReactChildren.js`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactChildren.js)

## 1. React.Children 的作用

[`React.Children`](https://react.dev/reference/react/Children) 提供工具方法来操作 `props.children`——因为 children 可能是单个元素、数组、字符串或 null，直接操作很麻烦。

## 2. 核心方法

```javascript
// packages/react/src/ReactChildren.js（简化）

// map：遍历每个子元素，返回新数组
React.Children.map(children, (child, index) => { ... });

// forEach：遍历但不返回新数组
React.Children.forEach(children, (child, index) => { ... });

// count：计算子元素数量
React.Children.count(children);

// only：确保只有一个子元素
React.Children.only(children);

// toArray：转为扁平数组
React.Children.toArray(children);
```

## 3. 实现原理

`map` 和 `forEach` 内部都使用 [`mapIntoArray`](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactChildren.js) 遍历子元素：

```javascript
// mapChildren 内部：
const result = [];
let count = 0;
mapIntoArray(children, result, '', '', function(child) {
  // 注意：mapIntoArray 只传 child，count 索引在外部管理
  return func.call(context, child, count++);
});

// mapIntoArray 递归处理各类型的 children：
function mapIntoArray(children, array, prefix, prefixSoFar, callback) {
  const type = typeof children;
  // 注意：undefined 和 boolean 不直接忽略——
  // 源码将它们转为 null 后**仍会调用 callback**（callback 收到 null）
  // ReactChildren.js:164-172
  if (type === 'undefined' || type === 'boolean') {
    children = null;
  }

  if (children === null || type === 'string' || type === 'number') {
    // 叶子节点：调用 callback 处理（只传 child，不传 key）
    const mappedChild = callback(children);
    array.push(mappedChild);
    return 1;
  }

  if (isArray(children)) {
    // 数组：递归调用 mapIntoArray
    let count = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const childKey = prefix + '.' + escapeUserProvidedKey('') + i;
      count += mapIntoArray(child, array, childKey, prefixSoFar + '.' + i, callback);
    }
    return count;
  }

  // 单个 React Element：callback 只接收 child
  callback(children);
  return 1;
}
```

关键点：children 可能是嵌套数组（如 `[[a, b], c]`），`mapIntoArray` 会递归扁平化。

## 4. key 的处理

`toArray` 会给没有 key 的子元素生成基于位置的 key（如 `.0`, `.1`, `.0.0`），确保 [Diff 算法](https://github.com/facebook/react/blob/eafeac097b/packages/react-reconciler/src/ReactFiberBeginWork.js)能正确匹配。

## 下一步

- [JSX Transform](/01-react-core/06-jsx-transform) — JSX 编译机制
- [Diff 算法](/03-work-loop/04-reconcile-children) — 子元素的 Diff 匹配
- [Fiber 节点数据结构](/02-fiber-architecture/01-fiber-node-structure) — Fiber 如何组织子节点

## 参考资料

- [React 官方文档 - Children](https://react.dev/reference/react/Children)
- [React 源码 ReactChildren.js](https://github.com/facebook/react/blob/eafeac097b/packages/react/src/ReactChildren.js)
