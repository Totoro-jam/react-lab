---
title: "最小堆优先级队列"
---



> 对应源码：[`SchedulerMinHeap.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerMinHeap.js)

## 1. 为什么用最小堆

Scheduler 需要一个数据结构来管理任务队列，要求：

- 快速取出最高优先级（最快过期）的任务 → O(1)
- 快速插入新任务 → O(log n)
- 快速取出并移除最高优先级任务 → O(log n)

最小堆（[Binary Heap](https://en.wikipedia.org/wiki/Binary_heap)）完美满足这些要求。

## 2. 实现

```javascript
// [`SchedulerMinHeap.js`](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerMinHeap.js)（完整源码，仅 98 行）

type Heap<T: Node> = Array<T>;
type Node = { id: number, sortIndex: number, ... };

// 入堆
export function push(heap, node) {
  const index = heap.length;
  heap.push(node);
  siftUp(heap, node, index);
}

// 查看堆顶（最小元素）
export function peek(heap) {
  return heap.length === 0 ? null : heap[0];
}

// 出堆（取出并移除堆顶）
export function pop(heap) {
  if (heap.length === 0) return null;
  const first = heap[0];
  const last = heap.pop();
  if (last !== first) {
    heap[0] = last;
    siftDown(heap, last, 0);
  }
  return first;
}

// 上浮：新元素向上移动到正确位置
function siftUp(heap, node, i) {
  let index = i;
  while (index > 0) {
    const parentIndex = (index - 1) >>> 1;  // 无符号右移 = 除以 2 取整
    const parent = heap[parentIndex];
    if (compare(parent, node) > 0) {
      // 父节点更大 → 交换
      heap[parentIndex] = node;
      heap[index] = parent;
      index = parentIndex;
    } else {
      return; // 父节点更小 → 到位了
    }
  }
}

// 下沉：堆顶替换后，新堆顶向下移动到正确位置
function siftDown(heap, node, i) {
  let index = i;
  const length = heap.length;
  const halfLength = length >>> 1; // 只需遍历到倒数第二层

  while (index < halfLength) {
    const leftIndex = (index + 1) * 2 - 1;
    const left = heap[leftIndex];
    const rightIndex = leftIndex + 1;
    const right = heap[rightIndex];

    if (compare(left, node) < 0) {
      // 左子更小
      if (rightIndex < length && compare(right, left) < 0) {
        // 右子比左子还小 → 和右子交换
        heap[index] = right;
        heap[rightIndex] = node;
        index = rightIndex;
      } else {
        // 和左子交换
        heap[index] = left;
        heap[leftIndex] = node;
        index = leftIndex;
      }
    } else if (rightIndex < length && compare(right, node) < 0) {
      // 右子比当前节点小 → 和右子交换
      heap[index] = right;
      heap[rightIndex] = node;
      index = rightIndex;
    } else {
      return; // 两个子节点都更大 → 到位了
    }
  }
}

// 比较函数：先比 sortIndex（过期时间），再比 id（插入顺序）
function compare(a, b) {
  const diff = a.sortIndex - b.sortIndex;
  return diff !== 0 ? diff : a.id - b.id;
}
```

## 3. 堆操作图解

```
堆的数组表示（Eytzinger layout）：

  数组索引：
  [0] [1] [2] [3] [4] [5] [6]

  对应的树：
              [0]
           /      \
         [1]      [2]
        /  \     /  \
      [3]  [4] [5]  [6]

  父子关系：
  parent(i) = (i-1) >>> 1
  leftChild(i) = (i+1)*2 - 1 = 2*i + 1
  rightChild(i) = 2*i + 2
```

```
push 操作示例（已有 [10, 20, 30]，push 5）：

初始:  [10, 20, 30]
push 5: [10, 20, 30, 5]
  siftUp: index=3, parent=(3-1)>>>1=1, parent=20
  compare(20, 5) > 0 → 交换
  [10, 5, 30, 20]
  index=1, parent=0, parent=10
  compare(10, 5) > 0 → 交换
  [5, 10, 30, 20]
  index=0 → 结束

结果堆: [5, 10, 30, 20]  ← 5 在堆顶（最小）
```

```
pop 操作示例（[5, 10, 30, 20] pop）：

取出堆顶 5
将末尾 20 移到堆顶: [20, 10, 30]
  siftDown: index=0, left=1(10), right=2(30)
  compare(10, 20) < 0 → 左子更小
  compare(30, 10) > 0 → 不和右交换，和左交换
  [10, 20, 30]
  index=1, halfLength=1, 1 < 1 false → 结束

结果: 返回 5，堆变成 [10, 20, 30]
```

## 4. compare 的双重排序

```javascript
function compare(a, b) {
  const diff = a.sortIndex - b.sortIndex;
  return diff !== 0 ? diff : a.id - b.id;
}
```

先比 `sortIndex`（过期时间），如果相同再比 `id`（插入顺序）。这是 **FIFO tiebreaker**——当两个任务的过期时间相同时，先插入的先执行。

## 下一步

- [时间切片](/05-scheduler/03-time-slicing) — 时间切片细节
- [优先级体系](/05-scheduler/04-priority-levels) — 优先级体系

## 参考资料

- [Min Heap implementation in Scheduler (Reddit)](https://www.reddit.com/r/reactjs/comments/coiz7p/min_heap_implementation_in_shared_scheduler/)
- [React 源码 SchedulerMinHeap.js](https://github.com/facebook/react/blob/eafeac097b/packages/scheduler/src/SchedulerMinHeap.js)
- [Binary Heap (Wikipedia)](https://en.wikipedia.org/wiki/Binary_heap)
