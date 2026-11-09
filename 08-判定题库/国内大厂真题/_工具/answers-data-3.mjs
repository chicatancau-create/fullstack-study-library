export const ANSWERS3 = [
  {
    id: 'Q017', title: '53. 最大子数组和', question_url: 'https://leetcode.cn/problems/maximum-subarray/',
    core_idea: 'Kadane：以当前元素结尾的最大和要么接上前一段（cur+nums[i]），要么从当前元素重开；全局取最大。',
    invariant: 'cur 始终是以 i 结尾的最大子数组和；best 是 [0,i] 内的最大子数组和。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  let best = nums[0];
  let cur = nums[0];
  for (let i = 1; i < nums.length; i++) {
    cur = Math.max(nums[i], cur + nums[i]);
    best = Math.max(best, cur);
  }
  return best;
}`,
    edge_cases: [
      { call: '[-2,1,-3,4,-1,2,1,-5,4]', expected: 6, why: '最大段 4,-1,2,1' },
      { call: '[-1]', expected: -1, why: '全负时答案是最大单元素' },
      { call: '[-3,-2,-5]', expected: -2, why: '不能返回 0' },
    ],
    common_mistakes: ['把 best 初始化为 0，全负返回 0', '写成 cur = max(0, cur)+x，改变题意', '忘记 cur 可以从当前元素重开'],
    followups: ['如何返回最大子数组的起止下标？', '分治解法如何合并左右跨中点的最大和？'],
    rubric: [
      { point: 'cur 状态定义是“以 i 结尾”，允许重开', weight: 2 },
      { point: '全负数组返回最大单元素而不是 0', weight: 1 },
      { point: 'O(n) 时间 O(1) 空间', weight: 1 },
    ],
  },
  {
    id: 'Q018', title: '160. 相交链表', question_url: 'https://leetcode.cn/problems/intersection-of-two-linked-lists/',
    core_idea: '双指针走完各自链表后跳到对方头部，两指针走过的总长度相同，第一次相遇即交点；无交点则同时为 null。',
    invariant: '两指针位移总和相同，若存在交点必然同时到达。',
    complexity: { time: 'O(m+n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(a, b, skipA, skipB) {
  const build = (vals, tail) => {
    let head = tail;
    for (let i = vals.length - 1; i >= 0; i--) head = { val: vals[i], next: head };
    return head;
  };
  const common = build(b.slice(skipB), null);
  const headA = build(a.slice(0, skipA), common);
  const headB = build(b.slice(0, skipB), common);
  let p = headA;
  let q = headB;
  while (p !== q) {
    p = p ? p.next : headB;
    q = q ? q.next : headA;
  }
  return p ? p.val : null;
}`,
    edge_cases: [
      { call: '[4,1,8,4,5],[5,6,1,8,4,5],2,3', expected: 8, why: '交点值为 8' },
      { call: '[2,6,4],[1,5],3,2', expected: null, why: '无交点返回 null' },
    ],
    common_mistakes: ['只比较值不比较节点引用', '切换头部的条件写错导致死循环', '无交点时没有同时到达 null'],
    followups: ['如何用哈希集合做？空间代价是什么？', '若链表可能有环，如何先判环再找交点？'],
    rubric: [
      { point: '走完自身后跳到对方头部，总步数相等', weight: 2 },
      { point: '比较节点引用而非值', weight: 1 },
      { point: '无交点时两指针同时为 null 终止', weight: 1 },
    ],
  },
  {
    id: 'Q019', title: '23. 合并K个排序链表', question_url: 'https://leetcode.cn/problems/merge-k-sorted-lists/',
    core_idea: '两两归并或小顶堆：每次取 k 个链表头的最小值接到结果尾部；本实现用 K 个头指针线性扫描，便于理解。',
    invariant: '结果链表始终有序；每次只从各链表当前头中取最小，未取的头部仍保持有序。',
    complexity: { time: 'O(N·k)，N 为总节点数', space: 'O(1)（不计输出）' },
    code_lang: 'javascript',
    code: `function solve(lists) {
  const heads = lists.map((vals) => {
    let head = null;
    for (let i = vals.length - 1; i >= 0; i--) head = { val: vals[i], next: head };
    return head;
  });
  const dummy = { val: 0, next: null };
  let tail = dummy;
  while (true) {
    let pick = -1;
    for (let i = 0; i < heads.length; i++) {
      if (!heads[i]) continue;
      if (pick === -1 || heads[i].val < heads[pick].val) pick = i;
    }
    if (pick === -1) break;
    tail.next = heads[pick];
    heads[pick] = heads[pick].next;
    tail = tail.next;
  }
  const out = [];
  for (let p = dummy.next; p; p = p.next) out.push(p.val);
  return out;
}`,
    edge_cases: [
      { call: '[[1,4,5],[1,3,4],[2,6]]', expected: [1,1,2,3,4,4,5,6], why: '标准三链表' },
      { call: '[]', expected: [], why: '空列表' },
    ],
    common_mistakes: ['每次比较后没有推进被选中链表', 'dummy 尾指针没有随结果前移', '空链表未跳过'],
    followups: ['小顶堆实现的复杂度是多少？', '两两归并与堆的取舍？'],
    rubric: [
      { point: '每轮只取各链表头的最小值', weight: 2 },
      { point: '正确处理空链表与全空输入', weight: 1 },
      { point: '能说明 O(Nk) 与堆优化到 O(N log k)', weight: 1 },
    ],
  },
  {
    id: 'Q020', title: '300. 最长上升子序列', question_url: 'https://leetcode.cn/problems/longest-increasing-subsequence/',
    core_idea: '维护 tails：tails[i] 是长度为 i+1 的上升子序列的最小结尾；对每个数二分替换第一个 >= 它的位置。',
    invariant: 'tails 严格递增；其长度等于当前已见元素的最长上升子序列长度。',
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  const tails = [];
  for (const x of nums) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}`,
    edge_cases: [
      { call: '[10,9,2,5,3,7,101,18]', expected: 4, why: '2,3,7,101' },
      { call: '[7,7,7,7]', expected: 1, why: '严格递增，不能合并相等元素' },
      { call: '[]', expected: 0, why: '空数组' },
    ],
    common_mistakes: ['二分用 <= 导致相等元素替换，严格递增变非递减', '把 tails 当成真实子序列返回', '用 O(n^2) DP 却声称 O(n log n)'],
    followups: ['如何还原具体子序列？', '俄罗斯套娃信封（354）如何转化为本题？'],
    rubric: [
      { point: 'tails 定义与二分替换规则正确', weight: 2 },
      { point: '严格递增用 lower_bound', weight: 1 },
      { point: '能说明 tails 不是答案子序列本身', weight: 1 },
    ],
  },
  {
    id: 'Q021', title: '31. 下一个排列', question_url: 'https://leetcode.cn/problems/next-permutation/',
    core_idea: '从右找第一个下降点 i（nums[i] < nums[i+1]），再从右找第一个大于 nums[i] 的 j 交换，最后反转 i+1 之后的后缀。',
    invariant: 'i 之后是降序；交换后后缀仍降序，反转后变升序，得到恰好比原排列大的最小排列。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  const a = nums.slice();
  let i = a.length - 2;
  while (i >= 0 && a[i] >= a[i + 1]) i--;
  if (i >= 0) {
    let j = a.length - 1;
    while (a[j] <= a[i]) j--;
    [a[i], a[j]] = [a[j], a[i]];
  }
  let l = i + 1;
  let r = a.length - 1;
  while (l < r) { [a[l], a[r]] = [a[r], a[l]]; l++; r--; }
  return a;
}`,
    edge_cases: [
      { call: '[1,2,3]', expected: [1,3,2], why: '标准下一个排列' },
      { call: '[3,2,1]', expected: [1,2,3], why: '最大排列回绕到最小' },
      { call: '[1,1,5]', expected: [1,5,1], why: '含重复元素' },
    ],
    common_mistakes: ['找 i 时用 > 而不是 >=，重复元素判断错', '交换后忘记反转后缀', 'j 从左侧找导致换到更大的元素'],
    followups: ['如何求上一个排列？', '如何直接求第 k 个排列？'],
    rubric: [
      { point: '先找最右下降点，再从右找刚好更大的元素', weight: 2 },
      { point: '交换后反转后缀', weight: 1 },
      { point: '降序数组正确回绕', weight: 1 },
    ],
  },
  {
    id: 'Q022', title: '88. 合并两个有序数组', question_url: 'https://leetcode.cn/problems/merge-sorted-array/',
    core_idea: '从后往前填：比较 nums1 有效尾部与 nums2 尾部，把较大者放到 nums1 的写指针处，避免覆盖未处理元素。',
    invariant: '写指针右侧已合并有序；i、j 左侧仍是未处理元素。',
    complexity: { time: 'O(m+n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums1, m, nums2, n) {
  const a = nums1.slice();
  let i = m - 1;
  let j = n - 1;
  let k = m + n - 1;
  while (j >= 0) {
    if (i >= 0 && a[i] > nums2[j]) a[k--] = a[i--];
    else a[k--] = nums2[j--];
  }
  return a;
}`,
    edge_cases: [
      { call: '[1,2,3,0,0,0],3,[2,5,6],3', expected: [1,2,2,3,5,6], why: '标准示例' },
      { call: '[1],1,[],0', expected: [1], why: 'nums2 为空' },
      { call: '[0],0,[1],1', expected: [1], why: 'nums1 无有效元素' },
    ],
    common_mistakes: ['从前往后写覆盖 nums1 未处理元素', '循环条件用 i>=0，nums2 剩余未拷贝', '相等时选错分支导致不稳定但结果仍错'],
    followups: ['如果从前往后必须怎么做？', '合并 k 个有序数组如何推广？'],
    rubric: [
      { point: '从后往前写，避免覆盖', weight: 2 },
      { point: '循环以 nums2 用尽为终止', weight: 1 },
      { point: '空数组边界正确', weight: 1 },
    ],
  },
  {
    id: 'Q023', title: '20. 有效的括号', question_url: 'https://leetcode.cn/problems/valid-parentheses/',
    core_idea: '栈：左括号入栈；右括号必须与栈顶匹配并弹出；结束时栈必须为空。',
    invariant: '栈中只保存尚未闭合的左括号，且自底向上是嵌套顺序。',
    complexity: { time: 'O(n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(s) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of s) {
    if (!pairs[ch]) stack.push(ch);
    else if (stack.pop() !== pairs[ch]) return false;
  }
  return stack.length === 0;
}`,
    edge_cases: [
      { call: '"()[]{}"', expected: true, why: '三种括号' },
      { call: '"(]"', expected: false, why: '类型不匹配' },
      { call: '"("', expected: false, why: '未闭合' },
      { call: '")"', expected: false, why: '右括号无对应左括号' },
    ],
    common_mistakes: ['只统计数量不检查嵌套顺序', '右括号时栈空仍 pop，得到 undefined 比较', '忘记最后检查栈空'],
    followups: ['如果只有一种括号，能否用计数器？', '如何求最长有效括号子串（32）？'],
    rubric: [
      { point: '右括号必须与栈顶匹配', weight: 2 },
      { point: '结束后栈为空', weight: 1 },
      { point: '栈空 pop 与多余右括号处理', weight: 1 },
    ],
  },
  {
    id: 'Q024', title: '143. 重排链表', question_url: 'https://leetcode.cn/problems/reorder-list/',
    core_idea: '找中点、反转后半、交替合并；本实现用数组重排，逻辑等价但空间 O(n)。',
    invariant: '结果顺序为 L0,Ln,L1,Ln-1,…；前半与反转后的后半交替取。',
    complexity: { time: 'O(n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(values) {
  const out = [];
  let l = 0;
  let r = values.length - 1;
  let takeLeft = true;
  while (l <= r) {
    out.push(takeLeft ? values[l++] : values[r--]);
    takeLeft = !takeLeft;
  }
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3,4]', expected: [1,4,2,3], why: '偶数长度' },
      { call: '[1,2,3,4,5]', expected: [1,5,2,4,3], why: '奇数长度中点最后' },
      { call: '[1]', expected: [1], why: '单节点' },
    ],
    common_mistakes: ['奇数长度时中点被跳过或重复', '交替标志未翻转', '原地链表实现未断开中点导致环'],
    followups: ['原地 O(1) 空间的三步法？', '如何避免反转后丢失后半头？'],
    rubric: [
      { point: '左右交替取数的顺序正确', weight: 2 },
      { point: '奇偶长度都能终止', weight: 1 },
      { point: '能说明原地版找中点+反转+合并', weight: 1 },
    ],
  },
  {
    id: 'Q025', title: '199. 二叉树的右视图', question_url: 'https://leetcode.cn/problems/binary-tree-right-side-view/',
    core_idea: 'BFS 逐层遍历，取每层最后一个节点值；层数即结果下标。',
    invariant: '队列只含当前层；每层最后一个节点就是从右侧能看到的节点。',
    complexity: { time: 'O(n)', space: 'O(w)' },
    code_lang: 'javascript',
    code: `function solve(values) {
  if (!values.length || values[0] === null) return [];
  const nodes = values.map((v) => (v === null ? null : { val: v, left: null, right: null }));
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i]) continue;
    if (2 * i + 1 < nodes.length) nodes[i].left = nodes[2 * i + 1];
    if (2 * i + 2 < nodes.length) nodes[i].right = nodes[2 * i + 2];
  }
  const out = [];
  let queue = [nodes[0]];
  while (queue.length) {
    out.push(queue[queue.length - 1].val);
    const next = [];
    for (const n of queue) { if (n.left) next.push(n.left); if (n.right) next.push(n.right); }
    queue = next;
  }
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3,null,5,null,4]', expected: [1,3,4], why: '标准示例' },
      { call: '[]', expected: [], why: '空树' },
      { call: '[1,null,3]', expected: [1,3], why: '只有右链' },
    ],
    common_mistakes: ['取每层第一个而不是最后一个', '用 DFS 深度覆盖而非层序', '空数组未判断'],
    followups: ['DFS 先右后左如何记录首次到达深度？', '左视图只需改哪一行？'],
    rubric: [
      { point: '逐层 BFS，取每层末元素', weight: 2 },
      { point: '空树与单链边界', weight: 1 },
      { point: '能给出 DFS 深度首次到达方案', weight: 1 },
    ],
  },
  {
    id: 'Q026', title: '102. 二叉树的层序遍历', question_url: 'https://leetcode.cn/problems/binary-tree-level-order-traversal/',
    core_idea: 'BFS：循环处理当前队列长度，收集本层值，同时把子节点放入下一层队列。',
    invariant: '每次 while 开始时队列恰好包含一层节点。',
    complexity: { time: 'O(n)', space: 'O(w)' },
    code_lang: 'javascript',
    code: `function solve(values) {
  if (!values.length || values[0] === null) return [];
  const nodes = values.map((v) => (v === null ? null : { val: v, left: null, right: null }));
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i]) continue;
    if (2 * i + 1 < nodes.length) nodes[i].left = nodes[2 * i + 1];
    if (2 * i + 2 < nodes.length) nodes[i].right = nodes[2 * i + 2];
  }
  const out = [];
  let queue = [nodes[0]];
  while (queue.length) {
    out.push(queue.map((n) => n.val));
    const next = [];
    for (const n of queue) { if (n.left) next.push(n.left); if (n.right) next.push(n.right); }
    queue = next;
  }
  return out;
}`,
    edge_cases: [
      { call: '[3,9,20,null,null,15,7]', expected: [[3],[9,20],[15,7]], why: '标准三层' },
      { call: '[1]', expected: [[1]], why: '单节点' },
      { call: '[]', expected: [], why: '空树' },
    ],
    common_mistakes: ['不按层切分，输出一维数组', '边遍历边 push 导致层边界丢失', 'null 子节点被加入队列'],
    followups: ['锯齿遍历（103）如何改？', '如何自底向上层序（107）？'],
    rubric: [
      { point: '按当前队列长度切分层', weight: 2 },
      { point: '子节点只入下一层', weight: 1 },
      { point: '空树处理', weight: 1 },
    ],
  },
  {
    id: 'Q027', title: '72. 编辑距离', question_url: 'https://leetcode.cn/problems/edit-distance/',
    core_idea: '二维 DP：dp[i][j] 为 word1 前 i 个字符变到 word2 前 j 个字符的最少操作数；相等取左上，否则取增删改三者最小 +1。',
    invariant: 'dp[i][j] 只依赖左、上、左上三个已计算状态。',
    complexity: { time: 'O(mn)', space: 'O(mn)（可滚动到 O(n)）' },
    code_lang: 'javascript',
    code: `function solve(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}`,
    edge_cases: [
      { call: '"horse","ros"', expected: 3, why: '标准示例' },
      { call: '"","abc"', expected: 3, why: '全插入' },
      { call: '"abc","abc"', expected: 0, why: '完全相同' },
    ],
    common_mistakes: ['字符相等时仍加 1', '初始化第一行/列遗漏', '下标与字符位置差一'],
    followups: ['如何只保留两行？', '若操作代价不同（增删改不同价）如何改转移？'],
    rubric: [
      { point: '状态定义与三种操作对应正确', weight: 2 },
      { point: '边界初始化 i/j', weight: 1 },
      { point: '相等时直接继承左上', weight: 1 },
    ],
  },
  {
    id: 'Q028', title: '415. 字符串相加', question_url: 'https://leetcode.cn/problems/add-strings/',
    core_idea: '双指针从末尾逐位相加，处理进位，最后反转结果；不允许转整数。',
    invariant: 'carry 只可能是 0 或 1；每位结果由两数字与 carry 相加取模。',
    complexity: { time: 'O(max(m,n))', space: 'O(max(m,n))' },
    code_lang: 'javascript',
    code: `function solve(num1, num2) {
  let i = num1.length - 1;
  let j = num2.length - 1;
  let carry = 0;
  const out = [];
  while (i >= 0 || j >= 0 || carry) {
    const a = i >= 0 ? num1.charCodeAt(i--) - 48 : 0;
    const b = j >= 0 ? num2.charCodeAt(j--) - 48 : 0;
    const sum = a + b + carry;
    out.push(String(sum % 10));
    carry = Math.floor(sum / 10);
  }
  return out.reverse().join('');
}`,
    edge_cases: [
      { call: '"11","123"', expected: '134', why: '标准示例' },
      { call: '"0","0"', expected: '0', why: '零' },
      { call: '"999","1"', expected: '1000', why: '连续进位' },
    ],
    common_mistakes: ['转 Number 失去精度', '忘记最后 carry', '结果未反转'],
    followups: ['如何做字符串相减/相乘（43）？', '含负号如何处理？'],
    rubric: [
      { point: '逐位相加并处理进位', weight: 2 },
      { point: '不转整数，支持超长数字', weight: 1 },
      { point: '最终 carry 与反转正确', weight: 1 },
    ],
  },
  {
    id: 'Q029', title: '21. 合并两个有序链表', question_url: 'https://leetcode.cn/problems/merge-two-sorted-lists/',
    core_idea: '哑节点 + 尾指针：每次接上较小头节点并推进对应链表，最后接剩余部分。',
    invariant: '尾指针之前已合并有序；两个当前头是各自剩余部分的最小值。',
    complexity: { time: 'O(m+n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(a, b) {
  const build = (vals) => { let h = null; for (let i = vals.length - 1; i >= 0; i--) h = { val: vals[i], next: h }; return h; };
  let p = build(a);
  let q = build(b);
  const dummy = { val: 0, next: null };
  let tail = dummy;
  while (p && q) {
    if (p.val <= q.val) { tail.next = p; p = p.next; }
    else { tail.next = q; q = q.next; }
    tail = tail.next;
  }
  tail.next = p || q;
  const out = [];
  for (let n = dummy.next; n; n = n.next) out.push(n.val);
  return out;
}`,
    edge_cases: [
      { call: '[1,2,4],[1,3,4]', expected: [1,1,2,3,4,4], why: '标准示例' },
      { call: '[],[0]', expected: [0], why: '一侧为空' },
      { call: '[],[ ]', expected: [], why: '两侧为空' },
    ],
    common_mistakes: ['相等时没有稳定选择导致丢节点', '忘记接剩余部分', 'tail 没有随结果前移'],
    followups: ['递归版如何写？栈深度？', '合并 k 个链表如何复用？'],
    rubric: [
      { point: '哑节点与尾指针维护结果链', weight: 2 },
      { point: '循环后接剩余部分', weight: 1 },
      { point: '空链表边界', weight: 1 },
    ],
  },
  {
    id: 'Q030', title: '141. 环形链表', question_url: 'https://leetcode.cn/problems/linked-list-cycle/',
    core_idea: '快慢指针：慢走一步、快走两步；有环必相遇，无环快指针先到 null。',
    invariant: '若存在环，快指针相对慢指针每轮靠近一步，必然相遇。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(values, pos) {
  const nodes = values.map((v) => ({ val: v, next: null }));
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].next = nodes[i + 1];
  if (pos >= 0 && nodes.length) nodes[nodes.length - 1].next = nodes[pos];
  let slow = nodes[0] || null;
  let fast = nodes[0] || null;
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}`,
    edge_cases: [
      { call: '[3,2,0,-4],1', expected: true, why: '尾节点回到下标 1' },
      { call: '[1,2],-1', expected: false, why: '无环' },
      { call: '[1],0', expected: true, why: '单节点自环' },
    ],
    common_mistakes: ['循环条件只判断 fast', '比较值而不是节点引用', '空链表未处理'],
    followups: ['如何找环入口（142）？', '为什么快指针步长必须是 2？'],
    rubric: [
      { point: '快慢指针相遇判环', weight: 2 },
      { point: 'fast 与 fast.next 双重判空', weight: 1 },
      { point: '比较引用而非值', weight: 1 },
    ],
  },
  {
    id: 'Q031', title: '56. 合并区间', question_url: 'https://leetcode.cn/problems/merge-intervals/',
    core_idea: '按起点排序，顺序扫描；若当前区间起点 <= 上一区间终点则合并（终点取最大），否则开启新区间。',
    invariant: '结果中相邻区间互不重叠且按起点有序。',
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(intervals) {
  const a = intervals.map((x) => x.slice()).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [s, e] of a) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}`,
    edge_cases: [
      { call: '[[1,3],[2,6],[8,10],[15,18]]', expected: [[1,6],[8,10],[15,18]], why: '标准示例' },
      { call: '[[1,4],[4,5]]', expected: [[1,5]], why: '端点相接也算重叠' },
      { call: '[[1,4],[0,4]]', expected: [[0,4]], why: '包含关系取最大终点' },
    ],
    common_mistakes: ['不排序直接扫描', '条件写成 s < last[1]，漏掉端点相接', '合并时直接替换终点而不是取 max'],
    followups: ['插入区间（57）如何一次完成？', '会议室 II 用什么数据结构？'],
    rubric: [
      { point: '按起点排序后线性合并', weight: 2 },
      { point: '重叠条件含等号，终点取 max', weight: 1 },
      { point: '复杂度 O(n log n)', weight: 1 },
    ],
  },
  {
    id: 'Q032', title: '92. 反转链表 II', question_url: 'https://leetcode.cn/problems/reverse-linked-list-ii/',
    core_idea: '哑节点定位 left 前驱，区间内头插法反转 right-left+1 个节点，再把区间尾接回后继。',
    invariant: '区间外节点顺序不变；区间内反转后 prev 是新区间头，原区间头是新区间尾。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(values, left, right) {
  const dummy = { val: 0, next: null };
  let t = dummy;
  for (const v of values) { t.next = { val: v, next: null }; t = t.next; }
  let prev = dummy;
  for (let i = 1; i < left; i++) prev = prev.next;
  let cur = prev.next;
  for (let i = 0; i < right - left; i++) {
    const next = cur.next;
    cur.next = next.next;
    next.next = prev.next;
    prev.next = next;
  }
  const out = [];
  for (let p = dummy.next; p; p = p.next) out.push(p.val);
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3,4,5],2,4', expected: [1,4,3,2,5], why: '标准示例' },
      { call: '[5],1,1', expected: [5], why: '单节点区间' },
      { call: '[1,2,3],1,3', expected: [3,2,1], why: '整表反转' },
    ],
    common_mistakes: ['头插后 prev 被错误前移', 'left=1 时没有哑节点导致丢头', '区间长度算成 right-left+1'],
    followups: ['与 K 个一组反转的区别？', '如何用一次遍历完成？'],
    rubric: [
      { point: '哑节点定位前驱，left=1 也正确', weight: 2 },
      { point: '头插法保持区间外顺序', weight: 1 },
      { point: '区间长度与接回后继正确', weight: 1 },
    ],
  },
];
