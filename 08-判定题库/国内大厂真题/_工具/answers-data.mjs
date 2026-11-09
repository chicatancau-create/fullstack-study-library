export const ANSWERS = [
  {
    id: 'Q001',
    title: '3. 无重复字符的最长子串',
    question_url: 'https://leetcode.cn/problems/longest-substring-without-repeating-characters/',
    core_idea: '滑动窗口：右指针逐个扩张，遇到窗口内已出现的字符时，把左指针跳到该字符上次出现位置的下一位，保证窗口内始终无重复。',
    invariant: '任意时刻窗口 [left, right] 内没有重复字符；left 只增不减，因此每个字符最多被左右指针各访问一次。',
    complexity: { time: 'O(n)', space: 'O(min(n, 字符集大小))' },
    code_lang: 'javascript',
    code: `function solve(s) {
  const last = new Map();
  let left = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (last.has(ch) && last.get(ch) >= left) {
      left = last.get(ch) + 1;
    }
    last.set(ch, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}`,
    edge_cases: [
      { call: '"abcabcbb"', expected: 3, why: '窗口在第二个 a 处收缩为 bca' },
      { call: '"bbbbb"', expected: 1, why: '每次都把 left 推到当前字符之后' },
      { call: '""', expected: 0, why: '空串不能返回 1' },
    ],
    common_mistakes: [
      '只判断 last.has(ch) 而不判断 last.get(ch) >= left，会把窗口外旧位置误当重复',
      '把 left 设为 last.get(ch) 而不是 +1，窗口仍包含重复字符',
    ],
    followups: [
      '如果字符集是 Unicode 码点而不是 UTF-16 单元，如何按码点滑动？',
      '若要求返回具体子串而不是长度，left 更新时如何同步记录起点？',
    ],
    rubric: [
      { point: '能说出 left 必须跳到上次位置 +1，并解释旧位置在窗口外时不能跳', weight: 2 },
      { point: '代码里同时维护 last 与 best，边界为空串返回 0', weight: 1 },
      { point: '能分析每个字符最多进出窗口一次，复杂度 O(n)', weight: 1 },
    ],
  },
  {
    id: 'Q002',
    title: '146. LRU缓存机制',
    question_url: 'https://leetcode.cn/problems/lru-cache/',
    core_idea: '哈希表 + 双向链表：哈希表 O(1) 定位节点，双向链表维持访问顺序；get/put 命中后把节点移到表头，容量超限时删除表尾。',
    invariant: '链表头部是最近使用，尾部是最久未使用；哈希表中的每个 key 恰好对应链表中一个节点，节点删除时两者同步移除。',
    complexity: { time: 'get/put 均摊 O(1)', space: 'O(capacity)' },
    code_lang: 'javascript',
    code: `function solve(ops, args) {
  const cap = args[0][0];
  const map = new Map();
  const order = [];
  const out = [];
  const touch = (k) => {
    const i = order.indexOf(k);
    if (i >= 0) order.splice(i, 1);
    order.push(k);
  };
  for (let i = 1; i < ops.length; i++) {
    const op = ops[i];
    const a = args[i];
    if (op === 'put') {
      const [k, v] = a;
      map.set(k, v);
      touch(k);
      if (map.size > cap) {
        const oldest = order.shift();
        map.delete(oldest);
      }
      out.push(null);
    } else {
      const k = a[0];
      if (!map.has(k)) out.push(-1);
      else { touch(k); out.push(map.get(k)); }
    }
  }
  return out;
}`,
    edge_cases: [
      { call: '["LRUCache","put","put","get","put","get","put","get","get","get"],[[2],[1,1],[2,2],[1],[3,3],[2],[4,4],[1],[3],[4]]', expected: [null,null,1,null,-1,null,-1,3,4], why: '标准示例：容量 2 时淘汰最久未使用' },
      { call: '["LRUCache","put","get"],[[1],[1,1],[1]]', expected: [null,1], why: '容量 1 时 get 命中不淘汰' },
    ],
    common_mistakes: [
      'get 命中后忘记更新访问顺序，导致淘汰了刚访问的 key',
      '先删除再移动节点导致链表断链，或哈希表与链表不同步',
      '容量为 0 时未特殊处理（本题通常 capacity ≥ 1，但实现应有防御）',
    ],
    followups: [
      '为什么不能用数组 unshift 实现 O(1)？在 JS 中如何用 Map 的插入顺序模拟？',
      '如果要求支持过期时间（TTL），数据结构需要增加什么？',
    ],
    rubric: [
      { point: '能说明哈希表与双向链表各自职责，以及为什么是 O(1)', weight: 2 },
      { point: 'get 命中会改变淘汰顺序，代码体现 touch/移动到表头', weight: 1 },
      { point: '容量超限删除最久未使用而不是任意元素', weight: 1 },
    ],
  },
  {
    id: 'Q003',
    title: '25. K 个一组翻转链表',
    question_url: 'https://leetcode.cn/problems/reverse-nodes-in-k-group/',
    core_idea: '先数出剩余节点是否够 k 个；够则用头插法翻转这一段，接回前驱与后继；不足 k 个保持原序。',
    invariant: '已处理部分与未处理部分通过 prevGroupTail.next 连接；每组内部翻转后，原组头变成组尾，原组尾变成组头。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(values, k) {
  const dummy = { val: 0, next: null };
  let tail = dummy;
  for (const v of values) { tail.next = { val: v, next: null }; tail = tail.next; }
  let prevTail = dummy;
  let cur = dummy.next;
  while (cur) {
    let probe = cur;
    for (let i = 0; i < k; i++) {
      if (!probe) return toArray(dummy.next);
      probe = probe.next;
    }
    let prev = null;
    let node = cur;
    for (let i = 0; i < k; i++) {
      const next = node.next;
      node.next = prev;
      prev = node;
      node = next;
    }
    prevTail.next = prev;
    cur.next = node;
    prevTail = cur;
    cur = node;
  }
  return toArray(dummy.next);
}
function toArray(head) {
  const out = [];
  for (let p = head; p; p = p.next) out.push(p.val);
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3,4,5],2', expected: [2,1,4,3,5], why: '最后一组不足 2 个时保持原序' },
      { call: '[1,2,3,4,5],3', expected: [3,2,1,4,5], why: '第三组不足 3 个不翻转' },
      { call: '[1],2', expected: [1], why: '不足 k 个直接返回原链表' },
    ],
    common_mistakes: [
      '先翻转再判断剩余长度，导致不足 k 个也被翻转',
      '翻转后忘记把原组头（现组尾）接到下一段，造成丢链或环',
      'prevTail 更新错误，导致下一组接不回前驱',
    ],
    followups: [
      '如果要求从尾部开始每 k 个翻转，如何避免先求长度？',
      '如何用递归实现？递归深度与栈空间代价是什么？',
    ],
    rubric: [
      { point: '先探测剩余是否够 k 个，不足则原样保留', weight: 2 },
      { point: '组内翻转后正确接回前驱与后继，无断链/环', weight: 2 },
      { point: '能说明 O(n) 时间 O(1) 空间，不使用额外数组', weight: 1 },
    ],
  },
  {
    id: 'Q004',
    title: '206. 反转链表',
    question_url: 'https://leetcode.cn/problems/reverse-linked-list/',
    core_idea: '三指针迭代：prev 指向已反转部分，cur 为当前节点，next 暂存后继；每次把 cur.next 指向 prev 后整体前移。',
    invariant: 'prev 之前的节点已全部反转，cur 及其之后仍未处理；循环结束时 prev 是新头。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(values) {
  let head = null;
  for (let i = values.length - 1; i >= 0; i--) head = { val: values[i], next: head };
  let prev = null;
  let cur = head;
  while (cur) {
    const next = cur.next;
    cur.next = prev;
    prev = cur;
    cur = next;
  }
  const out = [];
  for (let p = prev; p; p = p.next) out.push(p.val);
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3,4,5]', expected: [5,4,3,2,1], why: '标准反转' },
      { call: '[]', expected: [], why: '空链表返回空' },
      { call: '[1]', expected: [1], why: '单节点不变' },
    ],
    common_mistakes: [
      '先 cur.next = prev 再保存 next，导致链断裂丢失后继',
      '返回 cur 而不是 prev，返回时 cur 已是 null',
    ],
    followups: [
      '递归版本如何写？返回值和栈深度是什么？',
      '反转区间 [m,n] 与整表反转的边界差异在哪？',
    ],
    rubric: [
      { point: '明确 prev/cur/next 三指针职责', weight: 1 },
      { point: '返回 prev 而不是 cur，空链表不崩', weight: 1 },
      { point: '能说明 O(1) 空间，并指出递归版 O(n) 栈', weight: 1 },
    ],
  },
  {
    id: 'Q005',
    title: '215. 数组中的第K个最大元素',
    question_url: 'https://leetcode.cn/problems/kth-largest-element-in-an-array/',
    core_idea: '快速选择：以基准分区，若基准最终下标等于 n-k 则返回；否则只递归包含目标下标的一侧，平均 O(n)。',
    invariant: '分区后基准左侧均不大于基准、右侧均不小于基准；目标下标 n-k 始终落在当前区间内。',
    complexity: { time: '平均 O(n)，最坏 O(n^2)', space: 'O(1)（迭代版）' },
    code_lang: 'javascript',
    code: `function solve(nums, k) {
  const target = nums.length - k;
  let lo = 0;
  let hi = nums.length - 1;
  const a = nums.slice();
  while (lo <= hi) {
    const pivot = a[hi];
    let store = lo;
    for (let i = lo; i < hi; i++) {
      if (a[i] < pivot) { [a[store], a[i]] = [a[i], a[store]]; store++; }
    }
    [a[store], a[hi]] = [a[hi], a[store]];
    if (store === target) return a[store];
    if (store < target) lo = store + 1;
    else hi = store - 1;
  }
  return -1;
}`,
    edge_cases: [
      { call: '[3,2,1,5,6,4],2', expected: 5, why: '第 2 大是 5' },
      { call: '[3,2,3,1,2,4,5,5,6],4', expected: 4, why: '含重复元素' },
      { call: '[1],1', expected: 1, why: '单元素边界' },
    ],
    common_mistakes: [
      '把第 k 大当成升序下标 k-1，正确目标是 n-k',
      '分区后仍递归两侧，退化为 O(n log n)',
      '基准选择不当（如总取首元素）在有序输入上退化为 O(n^2)',
    ],
    followups: [
      '如何在最坏 O(n) 内完成？简述 median-of-medians。',
      '数据流场景为什么改用大小为 k 的小顶堆？',
    ],
    rubric: [
      { point: '目标下标是 n-k，能解释为什么', weight: 2 },
      { point: '分区后只处理一侧，平均 O(n)', weight: 1 },
      { point: '能指出最坏 O(n^2) 与随机化/三数取中改进', weight: 1 },
    ],
  },
  {
    id: 'Q006',
    title: '200. 岛屿数量',
    question_url: 'https://leetcode.cn/problems/number-of-islands/',
    core_idea: '遍历网格，遇到未访问的陆地就计数 +1，并用 DFS/BFS 把同一连通块的陆地全部标记为已访问。',
    invariant: '每次进入 DFS 的格子一定是未访问陆地；标记后不会被重复计数。',
    complexity: { time: 'O(mn)', space: 'O(mn)（递归栈/队列）' },
    code_lang: 'javascript',
    code: `function solve(grid) {
  const g = grid.map((row) => row.slice());
  const m = g.length;
  if (!m) return 0;
  const n = g[0].length;
  let count = 0;
  const flood = (r, c) => {
    if (r < 0 || r >= m || c < 0 || c >= n || g[r][c] !== '1') return;
    g[r][c] = '0';
    flood(r + 1, c);
    flood(r - 1, c);
    flood(r, c + 1);
    flood(r, c - 1);
  };
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      if (g[r][c] === '1') {
        count++;
        flood(r, c);
      }
    }
  }
  return count;
}`,
    edge_cases: [
      { call: '[["1","1","0"],["1","0","0"],["0","0","1"]]', expected: 2, why: '两个不连通岛屿' },
      { call: '[["0"]]', expected: 0, why: '全水返回 0' },
      { call: '[["1","1","1"],["1","1","1"]]', expected: 1, why: '整块连通只算一个' },
    ],
    common_mistakes: [
      '只标记访问而忘记在四个方向递归，导致连通块被拆成多块',
      '把字符 "1" 与数字 1 混用，判断永远不成立',
      'DFS 深度过大时栈溢出（大网格应改 BFS/并查集）',
    ],
    followups: [
      '如何用并查集实现？合并条件与计数方式是什么？',
      '若允许把一格 0 改成 1，如何判断能否连通两岛？',
    ],
    rubric: [
      { point: '遇到未访问陆地才计数，DFS 淹没整块', weight: 2 },
      { point: '边界与字符类型判断正确', weight: 1 },
      { point: '能指出递归栈风险并给出 BFS/并查集替代', weight: 1 },
    ],
  },
  {
    id: 'Q007',
    title: '103. 二叉树的锯齿形层次遍历',
    question_url: 'https://leetcode.cn/problems/binary-tree-zigzag-level-order-traversal/',
    core_idea: 'BFS 逐层遍历，用层号奇偶决定本层结果是否反转；每层结束后换下一层队列。',
    invariant: '队列中始终只有当前层节点；层号从 0 开始，偶数层从左到右、奇数层从右到左。',
    complexity: { time: 'O(n)', space: 'O(w)，w 为最大层宽' },
    code_lang: 'javascript',
    code: `function solve(values) {
  if (!values.length || values[0] === null) return [];
  const nodes = values.map((v) => (v === null ? null : { val: v, left: null, right: null }));
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i]) continue;
    const li = 2 * i + 1;
    const ri = 2 * i + 2;
    if (li < nodes.length) nodes[i].left = nodes[li];
    if (ri < nodes.length) nodes[i].right = nodes[ri];
  }
  const out = [];
  let queue = [nodes[0]];
  let level = 0;
  while (queue.length) {
    const vals = queue.map((x) => x.val);
    out.push(level % 2 === 0 ? vals : vals.reverse());
    const next = [];
    for (const node of queue) {
      if (node.left) next.push(node.left);
      if (node.right) next.push(node.right);
    }
    queue = next;
    level++;
  }
  return out;
}`,
    edge_cases: [
      { call: '[3,9,20,null,null,15,7]', expected: [[3],[20,9],[15,7]], why: '第二层反向' },
      { call: '[1]', expected: [[1]], why: '单节点' },
      { call: '[]', expected: [], why: '空树' },
    ],
    common_mistakes: [
      '用全局栈做反转导致跨层顺序错乱',
      '反转队列本身而不是本层结果，影响下一层扩展顺序',
      '层号从 1 开始导致奇偶颠倒',
    ],
    followups: [
      '如果要求不使用 reverse，如何用双端队列实现？',
      '锯齿遍历与普通层序遍历的复杂度是否相同？',
    ],
    rubric: [
      { point: '按层处理，反转只作用于本层输出', weight: 2 },
      { point: '层号奇偶与起点方向正确', weight: 1 },
      { point: '空树/单节点边界正确', weight: 1 },
    ],
  },
  {
    id: 'Q008',
    title: '15. 三数之和',
    question_url: 'https://leetcode.cn/problems/3sum/',
    core_idea: '排序后固定第一个数，剩下两数用左右指针相向移动；遇到满足条件的三元组后同时跳过重复值。',
    invariant: '固定 i 后，[l, r] 覆盖所有可能的两数组合；排序保证指针移动方向可判定和的大小。',
    complexity: { time: 'O(n^2)', space: 'O(1)（不计排序与输出）' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < a.length - 2; i++) {
    if (i > 0 && a[i] === a[i - 1]) continue;
    if (a[i] > 0) break;
    let l = i + 1;
    let r = a.length - 1;
    while (l < r) {
      const sum = a[i] + a[l] + a[r];
      if (sum === 0) {
        out.push([a[i], a[l], a[r]]);
        while (l < r && a[l] === a[l + 1]) l++;
        while (l < r && a[r] === a[r - 1]) r--;
        l++;
        r--;
      } else if (sum < 0) l++;
      else r--;
    }
  }
  return out;
}`,
    edge_cases: [
      { call: '[-1,0,1,2,-1,-4]', expected: [[-1,-1,2],[-1,0,1]], why: '标准示例，结果不重复' },
      { call: '[0,0,0,0]', expected: [[0,0,0]], why: '重复零只输出一次' },
      { call: '[1,2,-2,-1]', expected: [], why: '无解返回空' },
    ],
    common_mistakes: [
      '找到解后不跳过重复元素，输出重复三元组',
      '外层去重写成 a[i] === a[i+1] 导致漏解',
      '对每个 i 都从 0 开始双指针，退化为 O(n^3)',
    ],
    followups: [
      '三数之和最接近目标值如何改？',
      '四数之和如何去重与剪枝？',
    ],
    rubric: [
      { point: '排序 + 固定 i + 双指针，复杂度 O(n^2)', weight: 2 },
      { point: '外层与内层都正确跳过重复值', weight: 2 },
      { point: 'a[i] > 0 提前退出等剪枝', weight: 1 },
    ],
  },
];
