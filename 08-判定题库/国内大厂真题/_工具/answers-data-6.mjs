export const ANSWERS6 = [
  {
    id: 'Q065', title: '470. 用 Rand7() 实现 Rand10()', question_url: 'https://leetcode.cn/problems/implement-rand10-using-rand7/',
    core_idea: '两次 Rand7 组合出 1–49 的均匀分布：(a-1)*7+b；只接受 1–40，映射为 (idx-1)%10+1，拒绝 41–49 后重新采样。',
    invariant: '接受域的 40 个结果等概率，因此映射后 1–10 各出现 4 次，分布均匀。',
    complexity: { time: '期望 O(1)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(seq) {
  let i = 0;
  while (i + 1 < seq.length) {
    const idx = (seq[i] - 1) * 7 + seq[i + 1];
    i += 2;
    if (idx <= 40) return ((idx - 1) % 10) + 1;
  }
  return 0;
}`,
    edge_cases: [
      { call: '[1,1]', expected: 1, why: '组合值 1 映射到 1' },
      { call: '[2,3]', expected: 10, why: '组合值 10 映射到 10' },
      { call: '[7,7,2,2]', expected: 9, why: '49 被拒绝后重新采样到 9' },
    ],
    common_mistakes: ['直接用 (rand7()+rand7())%10+1，分布不均', '接受 1–49 后用 idx%10，导致 10 出现次数偏多', '拒绝 41–49 时忘记重新采样'],
    followups: ['期望采样次数是多少？', '如何用 Rand5 实现 Rand7？'],
    rubric: [
      { point: '组合公式 (a-1)*7+b 得到 1–49 均匀值', weight: 2 },
      { point: '只接受 ≤40 并重新采样', weight: 1 },
      { point: '映射 (idx-1)%10+1 不偏向任何数字', weight: 1 },
    ],
  },
  {
    id: 'Q066', title: '239. 滑动窗口最大值', question_url: 'https://leetcode.cn/problems/sliding-window-maximum/',
    core_idea: '单调递减双端队列存下标：入队前弹出所有更小元素，窗口左边界越界时弹出队首，队首即当前窗口最大值。',
    invariant: '队列内下标递增且对应值递减，因此队首始终是窗口内最大值的下标。',
    complexity: { time: 'O(n)', space: 'O(k)' },
    code_lang: 'javascript',
    code: `function solve(nums, k) {
  const dq = [], out = [];
  for (let i = 0; i < nums.length; i++) {
    while (dq.length && nums[dq[dq.length - 1]] <= nums[i]) dq.pop();
    dq.push(i);
    if (dq[0] <= i - k) dq.shift();
    if (i >= k - 1) out.push(nums[dq[0]]);
  }
  return out;
}`,
    edge_cases: [
      { call: '[1,3,-1,-3,5,3,6,7], 3', expected: [3,3,5,5,6,7], why: '标准示例' },
      { call: '[1], 1', expected: [1], why: '窗口等于数组长度' },
      { call: '[9,8,7], 2', expected: [9,8], why: '单调递减时队首逐个过期' },
    ],
    common_mistakes: ['用大顶堆但无法高效删除过期元素', '先弹队首再入队导致新元素被误删', '存值不存下标，无法判断窗口过期'],
    followups: ['为什么每个元素最多入队出队一次？', '若要求窗口最小值如何改？'],
    rubric: [
      { point: '队列存下标且值单调递减', weight: 2 },
      { point: '入队前弹出不大于当前值的元素', weight: 1 },
      { point: '按 i-k 判断队首过期并输出', weight: 1 },
    ],
  },
  {
    id: 'Q067', title: '112. 路径总和', question_url: 'https://leetcode.cn/problems/path-sum/',
    core_idea: '前序递归：每层从目标和中减去当前值，到叶子时判断剩余是否为 0。',
    invariant: 'remain 是目标值减去从根到当前节点路径上所有值后的剩余量。',
    complexity: { time: 'O(n)', space: 'O(h)' },
    code_lang: 'javascript',
    code: `function solve(a, target) {
  function build(arr) {
    if (!arr.length || arr[0] === null) return null;
    const root = { val: arr[0], left: null, right: null };
    const q = [root];
    let i = 1;
    while (i < arr.length && q.length) {
      const n = q.shift();
      if (i < arr.length) { if (arr[i] !== null) { n.left = { val: arr[i], left: null, right: null }; q.push(n.left); } i++; }
      if (i < arr.length) { if (arr[i] !== null) { n.right = { val: arr[i], left: null, right: null }; q.push(n.right); } i++; }
    }
    return root;
  }
  function dfs(n, remain) {
    if (!n) return false;
    if (!n.left && !n.right) return remain === n.val;
    return dfs(n.left, remain - n.val) || dfs(n.right, remain - n.val);
  }
  return dfs(build(a), target);
}`,
    edge_cases: [
      { call: '[5,4,8,11,null,13,4,7,2,null,null,null,1], 22', expected: true, why: '5+4+11+2=22' },
      { call: '[1,2], 1', expected: false, why: '必须在叶子结束，不能停在中途' },
      { call: '[], 0', expected: false, why: '空树没有路径' },
    ],
    common_mistakes: ['在任意节点判断相等，而不是叶子', '空树返回 true（0 等于目标）', '递归时不递减 remain'],
    followups: ['若允许路径不经过根呢（437）？', '如何同时返回该路径？'],
    rubric: [
      { point: '只在叶子节点判断剩余和', weight: 2 },
      { point: 'remain 逐层递减当前值', weight: 1 },
      { point: '空树返回 false', weight: 1 },
    ],
  },
  {
    id: 'Q068', title: '补充题1. 排序奇升偶降链表', question_url: 'https://leetcode.cn/problems/sort-odd-even-linked-list/',
    core_idea: '按值奇偶拆成两条链表：奇数段本身升序、偶数段本身降序；把偶数段反转后与奇数段归并。',
    invariant: '拆分保持原相对顺序，反转后偶数段升序，归并两条升序链表得到整体升序。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(arr) {
  const dOdd = { next: null }, dEven = { next: null };
  let o = dOdd, e = dEven;
  for (const v of arr) {
    const node = { val: v, next: null };
    if (v % 2 === 1) { o.next = node; o = node; }
    else { e.next = node; e = node; }
  }
  let prev = null, cur = dEven.next;
  while (cur) { const nxt = cur.next; cur.next = prev; prev = cur; cur = nxt; }
  const d = { next: null };
  let t = d, a = dOdd.next, b = prev;
  while (a && b) {
    if (a.val <= b.val) { t.next = a; a = a.next; }
    else { t.next = b; b = b.next; }
    t = t.next;
  }
  t.next = a || b;
  const out = [];
  for (let p = d.next; p; p = p.next) out.push(p.val);
  return out;
}`,
    edge_cases: [
      { call: '[1,8,3,6,5,4,7,2]', expected: [1,2,3,4,5,6,7,8], why: '奇升偶降交错' },
      { call: '[2,1]', expected: [1,2], why: '偶段单个值在前' },
      { call: '[1,2,3]', expected: [1,2,3], why: '已交错但仍需归并' },
    ],
    common_mistakes: ['对整条链表排序，忽略奇偶两段已各自有序的前提', '反转偶数段时丢失后继', '归并后忘记接上剩余段'],
    followups: ['如果题目不保证奇升偶降，还能 O(n) 吗？', '如何原地完成反转与归并？'],
    rubric: [
      { point: '按奇偶拆分为两条链表', weight: 1 },
      { point: '反转降序的偶数段', weight: 2 },
      { point: '归并两段并接上剩余部分', weight: 1 },
    ],
  },
  {
    id: 'Q069', title: '98. 验证二叉搜索树', question_url: 'https://leetcode.cn/problems/validate-binary-search-tree/',
    core_idea: '递归携带上下界：左子树上界为当前值，右子树下界为当前值，且必须严格大于/小于；或中序遍历严格递增。',
    invariant: '每个节点值都落在其祖先约束的开区间 (low, high) 内。',
    complexity: { time: 'O(n)', space: 'O(h)' },
    code_lang: 'javascript',
    code: `function solve(a) {
  function build(arr) {
    if (!arr.length || arr[0] === null) return null;
    const root = { val: arr[0], left: null, right: null };
    const q = [root];
    let i = 1;
    while (i < arr.length && q.length) {
      const n = q.shift();
      if (i < arr.length) { if (arr[i] !== null) { n.left = { val: arr[i], left: null, right: null }; q.push(n.left); } i++; }
      if (i < arr.length) { if (arr[i] !== null) { n.right = { val: arr[i], left: null, right: null }; q.push(n.right); } i++; }
    }
    return root;
  }
  function check(n, low, high) {
    if (!n) return true;
    if (n.val <= low || n.val >= high) return false;
    return check(n.left, low, n.val) && check(n.right, n.val, high);
  }
  return check(build(a), -Infinity, Infinity);
}`,
    edge_cases: [
      { call: '[2,1,3]', expected: true, why: '标准 BST' },
      { call: '[5,1,4,null,null,3,6]', expected: false, why: '3 在 5 的右子树却小于 5' },
      { call: '[1,1]', expected: false, why: 'BST 不允许重复值' },
    ],
    common_mistakes: ['只比较父子节点，漏掉祖先约束', '用 <=/>= 允许重复值', '依赖 Infinity 边界时未考虑节点值范围'],
    followups: ['中序遍历写法如何保证严格递增？', '若允许重复值，校验条件怎么改？'],
    rubric: [
      { point: '递归携带开区间上下界', weight: 2 },
      { point: '比较使用严格不等', weight: 1 },
      { point: '空节点视为合法', weight: 1 },
    ],
  },
  {
    id: 'Q070', title: '94. 二叉树的中序遍历', question_url: 'https://leetcode.cn/problems/binary-tree-inorder-traversal/',
    core_idea: '显式栈迭代：一路向左压栈，弹出即访问，再转向右子树；避免递归深度限制。',
    invariant: '栈中保存的是尚未访问的祖先链，弹出顺序保证左-根-右。',
    complexity: { time: 'O(n)', space: 'O(h)' },
    code_lang: 'javascript',
    code: `function solve(a) {
  function build(arr) {
    if (!arr.length || arr[0] === null) return null;
    const root = { val: arr[0], left: null, right: null };
    const q = [root];
    let i = 1;
    while (i < arr.length && q.length) {
      const n = q.shift();
      if (i < arr.length) { if (arr[i] !== null) { n.left = { val: arr[i], left: null, right: null }; q.push(n.left); } i++; }
      if (i < arr.length) { if (arr[i] !== null) { n.right = { val: arr[i], left: null, right: null }; q.push(n.right); } i++; }
    }
    return root;
  }
  const out = [], st = [];
  let cur = build(a);
  while (cur || st.length) {
    while (cur) { st.push(cur); cur = cur.left; }
    cur = st.pop();
    out.push(cur.val);
    cur = cur.right;
  }
  return out;
}`,
    edge_cases: [
      { call: '[1,null,2,3]', expected: [1,3,2], why: '标准示例' },
      { call: '[]', expected: [], why: '空树' },
      { call: '[1]', expected: [1], why: '单节点' },
    ],
    common_mistakes: ['先访问再压左孩子导致顺序错', '只压右孩子不压祖先链', '空树时仍尝试访问 root.val'],
    followups: ['Morris 遍历如何做到 O(1) 空间？', '前序与后序的迭代写法差在哪？'],
    rubric: [
      { point: '沿左链压栈直到空', weight: 2 },
      { point: '弹出即访问并转向右子树', weight: 1 },
      { point: '空树返回空数组', weight: 1 },
    ],
  },
  {
    id: 'Q071', title: '139. 单词拆分', question_url: 'https://leetcode.cn/problems/word-break/',
    core_idea: 'DP：dp[i] 表示前 i 个字符可被拆分；枚举切点 j，若 dp[j] 为真且 s[j..i) 在词典中则 dp[i] 为真。',
    invariant: 'dp[i] 只依赖更小的下标，因此按长度递增计算即可。',
    complexity: { time: 'O(n²)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(s, dict) {
  const set = new Set(dict);
  const dp = new Array(s.length + 1).fill(false);
  dp[0] = true;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 0; j < i; j++) {
      if (dp[j] && set.has(s.slice(j, i))) { dp[i] = true; break; }
    }
  }
  return dp[s.length];
}`,
    edge_cases: [
      { call: '"leetcode", ["leet","code"]', expected: true, why: '恰好两段' },
      { call: '"applepenapple", ["apple","pen"]', expected: true, why: '单词可重复使用' },
      { call: '"catsandog", ["cats","dog","sand","and","cat"]', expected: false, why: '存在无法覆盖的字符' },
    ],
    common_mistakes: ['用贪心匹配最长单词，遇到死路不回溯', 'dp 只记录起点而忽略终点', '词典允许复用却按 0/1 处理后失效'],
    followups: ['如何输出一种拆分方案？', 'Trie 优化能改善什么？'],
    rubric: [
      { point: 'dp[0] 为真并按下标递增计算', weight: 2 },
      { point: '枚举切点要求 dp[j] 与子串同时在词典', weight: 1 },
      { point: '单词可重复使用', weight: 1 },
    ],
  },
  {
    id: 'Q072', title: '240. 搜索二维矩阵 II', question_url: 'https://leetcode.cn/problems/search-a-2d-matrix-ii/',
    core_idea: '从右上角出发：当前值大于目标则左移，小于目标则下移；每步排除一行或一列。',
    invariant: '搜索区域始终保持左上角为当前元素，目标若存在必在该区域内。',
    complexity: { time: 'O(m+n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(matrix, target) {
  if (!matrix.length || !matrix[0].length) return false;
  let i = 0, j = matrix[0].length - 1;
  while (i < matrix.length && j >= 0) {
    if (matrix[i][j] === target) return true;
    if (matrix[i][j] > target) j--;
    else i++;
  }
  return false;
}`,
    edge_cases: [
      { call: '[[1,4,7],[2,5,8],[3,6,9]], 5', expected: true, why: '中间值' },
      { call: '[[1,4,7],[2,5,8],[3,6,9]], 10', expected: false, why: '越界后退出' },
      { call: '[[-5]], -5', expected: true, why: '单元素负数' },
    ],
    common_mistakes: ['从左上角出发，两个方向都变大无法决策', '只比较一处就返回', '行列长度取错导致越界'],
    followups: ['与 74 题（整体有序）的差别？', '如何用二分每行做到 O(m log n) 并比较复杂度？'],
    rubric: [
      { point: '从右上角开始搜索', weight: 2 },
      { point: '大于目标左移、小于目标下移', weight: 1 },
      { point: '空矩阵返回 false', weight: 1 },
    ],
  },
  {
    id: 'Q073', title: '128. 最长连续序列', question_url: 'https://leetcode.cn/problems/longest-consecutive-sequence/',
    core_idea: '哈希集合去重；只从“没有前驱”的数开始向后数连续长度，避免重复扫描。',
    invariant: '每个连续段只在其最小元素处被完整遍历一次，总复杂度线性。',
    complexity: { time: 'O(n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  const set = new Set(nums);
  let best = 0;
  for (const v of set) {
    if (set.has(v - 1)) continue;
    let cur = v, len = 1;
    while (set.has(cur + 1)) { cur++; len++; }
    best = Math.max(best, len);
  }
  return best;
}`,
    edge_cases: [
      { call: '[100,4,200,1,3,2]', expected: 4, why: '1,2,3,4' },
      { call: '[0,3,7,2,5,8,4,6,0,1]', expected: 9, why: '0 到 8，含重复 0' },
      { call: '[]', expected: 0, why: '空数组' },
    ],
    common_mistakes: ['对每个数都向后数，退化成 O(n²)', '用排序做到 O(n log n) 不符合要求', '忽略重复值导致长度虚高'],
    followups: ['如果要求返回序列本身？', '集合迭代时增删元素有什么风险？'],
    rubric: [
      { point: '只从无前驱的元素起算', weight: 2 },
      { point: '集合去重避免重复计数', weight: 1 },
      { point: '空数组返回 0', weight: 1 },
    ],
  },
  {
    id: 'Q074', title: '64. 最小路径和', question_url: 'https://leetcode.cn/problems/minimum-path-sum/',
    core_idea: 'DP：dp[i][j]=grid[i][j]+min(上,左)；第一行只能从左来，第一列只能从上来，可滚动成一维。',
    invariant: '计算到 (i,j) 时，其上方与左方的 dp 已是最小路径和。',
    complexity: { time: 'O(mn)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(grid) {
  const rows = grid.length;
  if (!rows) return 0;
  const cols = grid[0].length;
  const dp = new Array(cols).fill(0);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (i === 0 && j === 0) dp[j] = grid[i][j];
      else if (i === 0) dp[j] = dp[j - 1] + grid[i][j];
      else if (j === 0) dp[j] = dp[j] + grid[i][j];
      else dp[j] = Math.min(dp[j], dp[j - 1]) + grid[i][j];
    }
  }
  return dp[cols - 1];
}`,
    edge_cases: [
      { call: '[[1,3,1],[1,5,1],[4,2,1]]', expected: 7, why: '1→3→1→1→1' },
      { call: '[[1,2,3]]', expected: 6, why: '只有一行只能一路向右' },
      { call: '[[5]]', expected: 5, why: '单格' },
    ],
    common_mistakes: ['第一行/列也套用 min 导致依赖未初始化的 0', '滚动数组没有正确处理 j=0', '把路径数当路径和'],
    followups: ['若允许上下左右移动（不是仅右下）如何做？', '如何回溯输出路径？'],
    rubric: [
      { point: '第一行与第一列的边界单独处理', weight: 2 },
      { point: '其余格取上/左较小值加当前值', weight: 1 },
      { point: '一维滚动方向从左到右', weight: 1 },
    ],
  },
  {
    id: 'Q075', title: '113. 路径总和 II', question_url: 'https://leetcode.cn/problems/path-sum-ii/',
    core_idea: '回溯收集路径：进入节点时累加并压栈，叶子且剩余为 0 时拷贝路径，离开节点时弹出。',
    invariant: 'path 始终等于从根到当前节点的值序列，remain 等于目标减去该序列之和。',
    complexity: { time: 'O(n²)', space: 'O(h)' },
    code_lang: 'javascript',
    code: `function solve(a, target) {
  function build(arr) {
    if (!arr.length || arr[0] === null) return null;
    const root = { val: arr[0], left: null, right: null };
    const q = [root];
    let i = 1;
    while (i < arr.length && q.length) {
      const n = q.shift();
      if (i < arr.length) { if (arr[i] !== null) { n.left = { val: arr[i], left: null, right: null }; q.push(n.left); } i++; }
      if (i < arr.length) { if (arr[i] !== null) { n.right = { val: arr[i], left: null, right: null }; q.push(n.right); } i++; }
    }
    return root;
  }
  const out = [];
  function dfs(n, remain, path) {
    if (!n) return;
    path.push(n.val);
    if (!n.left && !n.right && remain === n.val) out.push(path.slice());
    dfs(n.left, remain - n.val, path);
    dfs(n.right, remain - n.val, path);
    path.pop();
  }
  dfs(build(a), target, []);
  return out;
}`,
    edge_cases: [
      { call: '[5,4,8,11,null,13,4,7,2,null,null,5,1], 22', expected: [[5,4,11,2],[5,8,4,5]], why: '两条满足的路径' },
      { call: '[1,2], 3', expected: [[1,2]], why: '单条路径' },
      { call: '[1,2,3], 5', expected: [], why: '没有路径满足' },
    ],
    common_mistakes: ['收集时直接 push path 引用，后续回溯修改了结果', '非叶子节点也判定成功', '回溯时忘记 pop'],
    followups: ['与 112 的返回值差别？', '若允许负数，能否剪枝？'],
    rubric: [
      { point: '进入压栈、离开弹栈', weight: 2 },
      { point: '叶子且剩余为目标时拷贝路径', weight: 1 },
      { point: '结果使用 path.slice() 隔离引用', weight: 1 },
    ],
  },
  {
    id: 'Q076', title: '155. 最小栈', question_url: 'https://leetcode.cn/problems/min-stack/',
    core_idea: '辅助栈与数据栈同步：每次 push 都把当前最小值压入辅助栈，pop 时两栈同时弹出，getMin 取辅助栈顶。',
    invariant: '辅助栈顶始终等于数据栈当前所有元素的最小值。',
    complexity: { time: 'O(1) 每操作', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(ops, args) {
  const data = [], mins = [];
  const out = [];
  for (let i = 0; i < ops.length; i++) {
    const a = args[i] || [];
    if (ops[i] === 'MinStack') out.push(null);
    else if (ops[i] === 'push') { data.push(a[0]); mins.push(mins.length ? Math.min(mins[mins.length - 1], a[0]) : a[0]); out.push(null); }
    else if (ops[i] === 'pop') { data.pop(); mins.pop(); out.push(null); }
    else if (ops[i] === 'top') out.push(data[data.length - 1]);
    else if (ops[i] === 'getMin') out.push(mins[mins.length - 1]);
  }
  return out;
}`,
    edge_cases: [
      { call: '["MinStack","push","push","push","getMin","pop","top","getMin"], [[],[-2],[0],[-3],[],[],[],[]]', expected: [null,null,null,null,-3,null,0,-2], why: '标准示例' },
      { call: '["MinStack","push","getMin","push","getMin"], [[],[5],[],[3],[]]', expected: [null,null,5,null,3], why: '更小值刷新最小值' },
    ],
    common_mistakes: ['getMin 每次遍历数据栈，变成 O(n)', '辅助栈只在更小值时入栈导致 pop 不同步', 'push 相等值时不更新辅助栈'],
    followups: ['如何把辅助栈压缩为单栈存差值？', '若要求 O(1) 空间且支持 getMin 该怎么做？'],
    rubric: [
      { point: '辅助栈与数据栈同步入出', weight: 2 },
      { point: 'push 时压入当前最小值', weight: 1 },
      { point: 'top/getMin 直接取栈顶 O(1)', weight: 1 },
    ],
  },
  {
    id: 'Q077', title: '79. 单词搜索', question_url: 'https://leetcode.cn/problems/word-search/',
    core_idea: '网格 DFS 回溯：从每个格子出发匹配首字符，向四邻扩展并临时标记已访问，失败时恢复。',
    invariant: '递归深度 k 表示已匹配 word 的前 k 个字符，且路径不重复经过同一格。',
    complexity: { time: 'O(mn·4^L)', space: 'O(L)' },
    code_lang: 'javascript',
    code: `function solve(board, word) {
  const m = board.length, n = board[0].length;
  function dfs(i, j, k) {
    if (i < 0 || j < 0 || i >= m || j >= n || board[i][j] !== word[k]) return false;
    if (k === word.length - 1) return true;
    const ch = board[i][j];
    board[i][j] = '#';
    const found = dfs(i + 1, j, k + 1) || dfs(i - 1, j, k + 1) || dfs(i, j + 1, k + 1) || dfs(i, j - 1, k + 1);
    board[i][j] = ch;
    return found;
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (dfs(i, j, 0)) return true;
  return false;
}`,
    edge_cases: [
      { call: '[["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], "ABCCED"', expected: true, why: '标准示例' },
      { call: '[["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], "SEE"', expected: true, why: '右下角 S-E-E' },
      { call: '[["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], "ABCB"', expected: false, why: '不能复用 B' },
    ],
    common_mistakes: ['不标记访问导致同一格被重复使用', '匹配失败时不恢复标记，影响其他路径', '只搜索第一个字符的所有位置之外的起点'],
    followups: ['如何用 Trie 一次搜索多个单词（212）？', '字符集很大时如何优化空间？'],
    rubric: [
      { point: '递归前标记、失败后恢复', weight: 2 },
      { point: '四邻扩展且越界检查', weight: 1 },
      { point: '从每个格子尝试起点', weight: 1 },
    ],
  },
  {
    id: 'Q078', title: '440. 字典序的第K小数字', question_url: 'https://leetcode.cn/problems/k-th-smallest-in-lexicographical-order/',
    core_idea: '把 1..n 视作十叉树：先计算以 cur 为前缀的子树节点数 count，若 count ≤ k 则跳到下一个兄弟，否则下沉到 cur*10。',
    invariant: '每步都能整段跳过不超过 k 的子树，剩余 k 始终指向当前范围内的目标序号。',
    complexity: { time: 'O((log n)²)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(n, k) {
  function countPrefix(prefix, n) {
    let total = 0, first = prefix, last = prefix;
    while (first <= n) {
      total += Math.min(n, last) - first + 1;
      first *= 10;
      last = last * 10 + 9;
    }
    return total;
  }
  let cur = 1;
  k--;
  while (k > 0) {
    const cnt = countPrefix(cur, n);
    if (cnt <= k) { k -= cnt; cur++; }
    else { k--; cur *= 10; }
  }
  return cur;
}`,
    edge_cases: [
      { call: '13, 1', expected: 1, why: '字典序第一个是 1' },
      { call: '13, 2', expected: 10, why: '1 的子树之后是 10' },
      { call: '13, 13', expected: 9, why: '最后一个是 9' },
    ],
    common_mistakes: ['逐个数转字符串排序，O(n log n) 超时', 'count 用前缀区间长度但忘记截断到 n', 'k 未先减 1 导致偏移一位'],
    followups: ['为什么 count 循环最多 log10(n) 层？', '若要求第 k 大如何调整？'],
    rubric: [
      { point: '按十叉树前缀计数整段跳过', weight: 2 },
      { point: 'count 用 min(n,last)-first+1 并逐层 ×10', weight: 1 },
      { point: 'cnt≤k 走兄弟，否则下沉', weight: 1 },
    ],
  },
  {
    id: 'Q079', title: '152. 乘积最大子数组', question_url: 'https://leetcode.cn/problems/maximum-product-subarray/',
    core_idea: '同时维护以 i 结尾的最大乘积与最小乘积：负数会让最小变最大，因此两个状态都要保留。',
    invariant: 'maxHere/minHere 分别是以 i 结尾的子数组乘积的最大值与最小值。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  let maxHere = nums[0], minHere = nums[0], best = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const x = nums[i];
    const a = maxHere * x, b = minHere * x;
    maxHere = Math.max(x, a, b);
    minHere = Math.min(x, a, b);
    best = Math.max(best, maxHere);
  }
  return best;
}`,
    edge_cases: [
      { call: '[2,3,-2,4]', expected: 6, why: '2×3' },
      { call: '[-2,0,-1]', expected: 0, why: '0 截断，最大为 0' },
      { call: '[-2,3,-4]', expected: 24, why: '两负数相乘转正' },
    ],
    common_mistakes: ['只维护最大值，遇到负数乘积变正时错过', '更新 maxHere 后用它算 minHere', '全负数组返回 0'],
    followups: ['若要求乘积最大的子数组长度？', '为什么这与 Kadane 求和不同？'],
    rubric: [
      { point: '同时维护最大与最小乘积', weight: 2 },
      { point: '用旧值同时计算 a、b 再更新', weight: 1 },
      { point: '单元素与含 0 情形正确', weight: 1 },
    ],
  },
  {
    id: 'Q080', title: '70. 爬楼梯', question_url: 'https://leetcode.cn/problems/climbing-stairs/',
    core_idea: 'dp[n]=dp[n-1]+dp[n-2]：最后一步要么跨 1 阶要么跨 2 阶；用两个变量滚动。',
    invariant: 'peek 始终是 dp[n-1]、cur 是 dp[n]，只保留最近两项。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(n) {
  if (n <= 1) return 1;
  let a = 1, b = 1;
  for (let i = 2; i <= n; i++) {
    const c = a + b;
    a = b;
    b = c;
  }
  return b;
}`,
    edge_cases: [
      { call: '1', expected: 1, why: '一阶只有一种走法' },
      { call: '2', expected: 2, why: '1+1 或 2' },
      { call: '5', expected: 8, why: '斐波那契第 6 项' },
    ],
    common_mistakes: ['dp[0] 设为 0 导致递推全错', 'n=1 时返回 0', '用递归不记忆化导致指数复杂度'],
    followups: ['若一次可跨 1..k 阶如何推广？', '矩阵快速幂如何做到 O(log n)？'],
    rubric: [
      { point: '初始 a=b=1 对应 dp[0]=dp[1]=1', weight: 2 },
      { point: '逐级滚动两项', weight: 1 },
      { point: 'n=1 与 n=2 边界正确', weight: 1 },
    ],
  },
];
