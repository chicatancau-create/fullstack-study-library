# U09：数据结构与算法基础

> 前置：完成 U03；会写函数、循环与基本测试。
>
> 本单元用 Python 标准库实现二分查找、lower_bound、two sum、区间合并、最小栈、LRU 与环形缓冲；重点是不变量、边界和复杂度，不是刷题数量。

## 1. 目标 / 非目标 / 产出

**目标**

- 用不变量解释二分查找/区间合并/LRU 为什么正确。
- 覆盖空、单元素、首尾、重复、无解、容量 0 等边界。
- 解释 O(1)/O(log n)/O(n)/O(n log n) 的差异；用比较次数观察二分增长。
- 用哈希表 + 双向链表实现 O(1) LRU，并解释为什么需要双向链表。
- 用单元测试证明行为，不靠打印“看起来对”。

**非目标**

- 不覆盖图论、动态规划、线段树等竞赛专题。
- 不做限时套题/面试评分（G9 另行安排）。
- 不声称“做完这些就能通过大厂算法面”。

**产出**

- 运行 8 组算法/结构测试与演示。
- 完成练习、自测与 [盲测](blind/README.md)；答案在 [answers](answers/README.md)。

## 2. 心智模型

算法正确性靠**不变量**：二分查找维护“目标若存在，必在 `[low, high]` 内”；区间合并维护“`merged` 内区间已排序且互不重叠”；LRU 维护“链表头是最近使用，尾是最久未用”。

复杂度看增长，不看单次耗时：线性扫描 1024 个元素最多 1024 次比较，二分最多约 11 次（log2 1024 + 1）。O(1) 是均摊/期望时要说清前提：哈希表 O(1) 是平均，最坏可能退化；LRU 的 O(1) 依赖哈希表 + 双向链表。

边界是算法的一部分：空数组、单元素、重复值、首尾、容量 0、区间相接、环形回绕。测试这些比多刷十道同型题更有用。

## 3. 讲义

### 3.1 二分查找与 lower_bound

```python
low, high = 0, len(items) - 1
while low <= high:
    mid = (low + high) // 2
    if items[mid] == target: return mid
    if items[mid] < target: low = mid + 1
    else: high = mid - 1
return -1
```

`low <= high` 对应闭区间；写 `low < high` 时边界会变。`lower_bound` 找第一个 `>= target` 的位置，返回 `[0, len]`，适合插入/去重。

### 3.2 two sum 与区间合并

```python
seen = {}
for i, value in enumerate(items):
    if target - value in seen: return seen[target - value], i
    seen[value] = i
```

一次遍历 + 哈希表，O(n) 时间/O(n) 空间；返回下标而不是值。区间合并先按起点排序，再维护 `merged[-1]`；`start <= last_end` 表示重叠或相接。

### 3.3 最小栈与 LRU

- MinStack：辅助栈保存“到当前为止的最小值”，`push` 时压 `min(value, mins[-1])`；`pop` 两边一起弹。
- LRU：哈希表存 `key -> node`，双向链表维护使用顺序；`get/put` 命中时把节点移到头部；超容量删尾部。单链表无法 O(1) 删除任意节点，所以需要 `prev`。

### 3.4 环形缓冲

```python
index = (head + count) % capacity
if count < capacity: count += 1
else: head = (head + 1) % capacity
```

固定容量、覆盖最旧元素；`to_list` 从 `head` 开始按 `count` 取。注意“满”和“空”不能用 `head == tail` 区分，必须额外计数。

## 4. 最小可运行示例

```bash
cd 01-阶段课程/教学单元/U09-数据结构与算法
bash scripts/run_unit.sh
cat evidence/run.txt
```

预期输出（形状）：

```text
test exit=0
demo exit=0
test: Ran 8 tests in ...s / OK
demo: DEMO PASS
steps: binary_search: index=1023 steps=11
gate_failures: 0
```

实际输出见 `evidence/test.txt`、`demo.txt`、`run.txt`。

## 5. 常见错误

### 错误 1：二分边界写错

- 现象：死循环、漏掉首尾、空数组越界。
- 定位：用空/单元素/首/尾/不存在五组测试。
- 修复：明确闭区间/半开区间，配套 `low <= high` 与 `mid±1`。
- 回归：五组边界全过。

### 错误 2：重复值处理错

- 现象：`lower_bound` 返回任意一个重复位置，插入/去重错位。
- 定位：构造 `[1,2,2,2,3]` 测第一个 `>=2`。
- 修复：`items[mid] < target` 才右移，否则 `high=mid`。
- 回归：返回索引 1。

### 错误 3：LRU 用单链表

- 现象：删除中间节点需要 O(n) 查找前驱。
- 定位：看节点是否有 `prev`。
- 修复：双向链表 + 哈希表；命中移到头部，超容量删尾。
- 回归：`keys()` 顺序与淘汰正确。

### 错误 4：区间相接没合并

- 现象：`(1,4)` 与 `(4,5)` 被当成两段。
- 定位：条件用 `<` 还是 `<=`。
- 修复：按业务定义相接是否合并；本单元用 `start <= last_end` 合并。
- 回归：相接/嵌套用例。

### 错误 5：环形缓冲满/空混淆

- 现象：覆盖顺序错、`to_list` 少一项/多一项。
- 定位：`head == tail` 无法区分满空。
- 修复：额外 `count`；写入索引 `(head+count)%cap`。
- 回归：容量 3 写 4 个，输出 `[2,3,4]`。

## 6. 练习

### 基础

1. 给二分查找加“返回插入位置”的变体，并测空/首/尾。
2. 用双指针实现有序数组的 two sum，比较多解时的返回差异。
3. 给 LRU 加 `peek`（不改变顺序），写测试。

### 边界

4. 区间列表含完全嵌套、相接、乱序，验证合并结果。
5. 环形缓冲容量 1，连续写 3 个，验证只保留最后一个。
6. 构造 1024 个元素，比较二分与线性扫描的比较次数；说明这不是实际耗时基准。

## 7. 自测

1. 二分查找的不变量是什么？闭区间与半开区间如何影响循环条件？
2. `lower_bound` 与普通二分返回什么不同？重复值下返回哪个位置？
3. 为什么 LRU 需要双向链表？只用哈希表行不行？
4. 区间合并为什么先排序？相接算不算重叠由什么决定？
5. 环形缓冲为什么需要 `count`？`head == tail` 能区分满/空吗？

答案见 [answers/README.md](answers/README.md)。

## 8. 独立未见任务（盲测）

见 [blind/README.md](blind/README.md)。要求独立实现并覆盖边界；不附答案。

## 9. M / E / G 映射

| 项 | 映射 | 说明 |
| --- | --- | --- |
| M01 编程与算法 | 部分 | 不变量、边界、复杂度、结构实现 |
| E01 | 参考 | C 动态数组/哈希表的内存与边界见 E01；本单元用 Python |
| G2/G9 | 不覆盖 | 无限时套题/面试评分，不能据此宣称算法关通过 |

## 10. 官方资料与查阅日期

- [Python 文档](https://docs.python.org/3/)：2026-11-07 查阅；Python 3.14.2。
- [Python TimeComplexity](https://wiki.python.org/moin/TimeComplexity)：2026-11-07 查阅。
- 版本边界：复杂度是模型，不是本机耗时；Python 实现与 C/Java 常数不同。

## 11. 证据

- `evidence/test.txt`、`demo.txt`、`run.txt`
- `evidence/manifest.json`：提交、命令退出码、证据 SHA-256