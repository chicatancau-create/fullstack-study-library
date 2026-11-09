export const ANSWERS2 = [
  {
    id: 'Q009',
    title: '33. 搜索旋转排序数组',
    question_url: 'https://leetcode.cn/problems/search-in-rotated-sorted-array/',
    core_idea: '二分时总有一半是有序的：判断 mid 落在左半有序段还是右半有序段，再看 target 是否落在该有序区间内，决定收缩哪一侧。',
    invariant: '每一步都把 target 可能存在的区间缩小一半；区间外的一定不含 target。',
    complexity: { time: 'O(log n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums, target) {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] === target) return mid;
    if (nums[lo] <= nums[mid]) {
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
      else lo = mid + 1;
    } else {
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}`,
    edge_cases: [
      { call: '[4,5,6,7,0,1,2],0', expected: 4, why: '旋转点在中间' },
      { call: '[4,5,6,7,0,1,2],3', expected: -1, why: '不存在返回 -1' },
      { call: '[1],0', expected: -1, why: '单元素不匹配' },
    ],
    common_mistakes: [
      '用 nums[lo] < nums[mid] 而不是 <=，单元素区间判断错',
      '只判断 target 与 nums[mid] 的大小，忽略旋转导致的分段有序',
      '收缩时漏掉等号，target 正好在边界时漏解',
    ],
    followups: [
      '数组含重复元素时（81 题）为什么最坏退化到 O(n)？',
      '如何先二分找旋转点再二分查找？',
    ],
    rubric: [
      { point: '能判断哪一半有序，并说明依据 nums[lo] 与 nums[mid] 的关系', weight: 2 },
      { point: 'target 落在有序半区才收缩该侧，否则收缩另一侧', weight: 2 },
      { point: '边界等号与单元素数组处理正确', weight: 1 },
    ],
  },
  {
    id: 'Q010',
    title: '121. 买卖股票的最佳时机',
    question_url: 'https://leetcode.cn/problems/best-time-to-buy-and-sell-stock/',
    core_idea: '一次遍历维护历史最低价，用当前价减最低价更新最大利润；卖出必须在买入之后，因此最低价只取当前之前的价格。',
    invariant: '遍历到第 i 天时，minPrice 是 [0, i] 的最低买入价，best 是以某天卖出的最大利润。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(prices) {
  let minPrice = Infinity;
  let best = 0;
  for (const p of prices) {
    if (p < minPrice) minPrice = p;
    else if (p - minPrice > best) best = p - minPrice;
  }
  return best;
}`,
    edge_cases: [
      { call: '[7,1,5,3,6,4]', expected: 5, why: '1 买入 6 卖出' },
      { call: '[7,6,4,3,1]', expected: 0, why: '单边下跌不交易' },
      { call: '[1]', expected: 0, why: '单日无法完成买卖' },
    ],
    common_mistakes: [
      '先更新 minPrice 再算利润，同一天买入卖出被允许',
      '初始 best 设为 -Infinity，单边下跌返回负数',
      '把它当成可多次交易（122 题）',
    ],
    followups: [
      '允许无限次交易时状态如何变化？',
      '含冷冻期（309 题）需要增加哪几个状态？',
    ],
    rubric: [
      { point: '维护历史最低价，且只与之前价格比较', weight: 2 },
      { point: '单边下跌返回 0 而不是负数', weight: 1 },
      { point: '能区分本题与多次交易/冷冻期变体', weight: 1 },
    ],
  },
  {
    id: 'Q011',
    title: '5. 最长回文子串',
    question_url: 'https://leetcode.cn/problems/longest-palindromic-substring/',
    core_idea: '中心扩展：以每个字符（奇数长度）和每对相邻字符（偶数长度）为中心向两侧扩展，记录最长回文区间。',
    invariant: '扩展时左右字符相等才继续，区间 [l+1, r-1] 始终是回文；越界或不等即停止。',
    complexity: { time: 'O(n^2)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(s) {
  if (!s) return '';
  let bestL = 0;
  let bestR = 0;
  const expand = (l, r) => {
    while (l >= 0 && r < s.length && s[l] === s[r]) { l--; r++; }
    return [l + 1, r - 1];
  };
  for (let i = 0; i < s.length; i++) {
    const [l1, r1] = expand(i, i);
    const [l2, r2] = expand(i, i + 1);
    if (r1 - l1 > bestR - bestL) { bestL = l1; bestR = r1; }
    if (r2 - l2 > bestR - bestL) { bestL = l2; bestR = r2; }
  }
  return s.slice(bestL, bestR + 1);
}`,
    edge_cases: [
      { call: '"babad"', expected: 'bab', why: '奇数长度；aba 同长时返回先找到的' },
      { call: '"cbbd"', expected: 'bb', why: '偶数长度中心在缝隙' },
      { call: '"a"', expected: 'a', why: '单字符' },
    ],
    common_mistakes: [
      '只处理奇数中心，漏掉 "cbbd" 这类偶数回文',
      '扩展返回 [l, r] 而不是 [l+1, r-1]，截取多一个字符',
      '比较长度时用 r-l 而不是 r-l+1 造成差一',
    ],
    followups: [
      'Manacher 如何做到 O(n)？',
      '如果要求返回所有最长回文，如何去重？',
    ],
    rubric: [
      { point: '同时枚举奇偶中心', weight: 2 },
      { point: '扩展停止后正确回退到有效区间', weight: 1 },
      { point: '能说明 O(n^2) 时间 O(1) 空间', weight: 1 },
    ],
  },
  {
    id: 'Q012',
    title: '54. 螺旋矩阵',
    question_url: 'https://leetcode.cn/problems/spiral-matrix/',
    core_idea: '维护上下左右四个边界，按右、下、左、上顺序遍历并收缩边界；每走完一条边就检查边界是否相交。',
    invariant: '边界内的格子恰好是尚未访问的部分；收缩后不会重复访问。',
    complexity: { time: 'O(mn)', space: 'O(1)（不计输出）' },
    code_lang: 'javascript',
    code: `function solve(matrix) {
  if (!matrix.length) return [];
  const out = [];
  let top = 0;
  let bottom = matrix.length - 1;
  let left = 0;
  let right = matrix[0].length - 1;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) out.push(matrix[top][c]);
    top++;
    for (let r = top; r <= bottom; r++) out.push(matrix[r][right]);
    right--;
    if (top <= bottom) {
      for (let c = right; c >= left; c--) out.push(matrix[bottom][c]);
      bottom--;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r--) out.push(matrix[r][left]);
      left++;
    }
  }
  return out;
}`,
    edge_cases: [
      { call: '[[1,2,3],[4,5,6],[7,8,9]]', expected: [1,2,3,6,9,8,7,4,5], why: '3x3 标准螺旋' },
      { call: '[[1,2,3,4]]', expected: [1,2,3,4], why: '单行不重复' },
      { call: '[[1],[2],[3]]', expected: [1,2,3], why: '单列不重复' },
    ],
    common_mistakes: [
      '最后两条边不检查边界，单行/单列会重复输出',
      '收缩顺序错误导致少一行或多一列',
      '空矩阵未提前返回',
    ],
    followups: [
      '如何生成螺旋矩阵 II（59 题）？',
      '若要求逆时针，只需改哪些遍历顺序？',
    ],
    rubric: [
      { point: '四条边遍历顺序正确且每次收缩边界', weight: 2 },
      { point: '单行/单列时用边界检查避免重复', weight: 2 },
      { point: '空矩阵与不规则输入处理', weight: 1 },
    ],
  },
  {
    id: 'Q013',
    title: '236. 二叉树的最近公共祖先',
    question_url: 'https://leetcode.cn/problems/lowest-common-ancestor-of-a-binary-tree/',
    core_idea: '后序遍历：若当前节点为空或等于 p/q 返回自身；左右子树分别找，若两侧都非空则当前节点是 LCA，否则返回非空的一侧。',
    invariant: '返回值表示该子树中是否找到 p 或 q（或它们的 LCA）；自底向上第一个两侧都命中的节点就是最近公共祖先。',
    complexity: { time: 'O(n)', space: 'O(h)' },
    code_lang: 'javascript',
    code: `function solve(values, p, q) {
  if (!values.length || values[0] === null) return null;
  const nodes = values.map((v) => (v === null ? null : { val: v, left: null, right: null }));
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i]) continue;
    if (2 * i + 1 < nodes.length) nodes[i].left = nodes[2 * i + 1];
    if (2 * i + 2 < nodes.length) nodes[i].right = nodes[2 * i + 2];
  }
  const dfs = (node) => {
    if (!node || node.val === p || node.val === q) return node;
    const l = dfs(node.left);
    const r = dfs(node.right);
    if (l && r) return node;
    return l || r;
  };
  const ans = dfs(nodes[0]);
  return ans ? ans.val : null;
}`,
    edge_cases: [
      { call: '[3,5,1,6,2,0,8,null,null,7,4],5,1', expected: 3, why: 'p/q 分居两侧' },
      { call: '[3,5,1,6,2,0,8,null,null,7,4],5,4', expected: 5, why: 'p 是 q 的祖先' },
      { call: '[1,2],1,2', expected: 1, why: '根是祖先' },
    ],
    common_mistakes: [
      '自顶向下比较路径，复杂且易错',
      '找到一侧非空就立即返回，未检查另一侧',
      'p 或 q 不在树中时仍返回节点（本题保证存在）',
    ],
    followups: [
      '如果是 BST（235 题），如何用值域剪枝？',
      '若需要支持多次查询，如何预处理？',
    ],
    rubric: [
      { point: '后序返回命中信息，两侧都命中才返回当前节点', weight: 2 },
      { point: 'p 为 q 祖先时正确返回 p', weight: 1 },
      { point: '能说明 O(n) 时间与递归栈 O(h)', weight: 1 },
    ],
  },
  {
    id: 'Q014',
    title: '42. 接雨水',
    question_url: 'https://leetcode.cn/problems/trapping-rain-water/',
    core_idea: '双指针：维护左右最大高度，每次移动较矮的一侧；该侧能接的水由该侧最大值决定，因为另一侧一定有更高的柱子兜底。',
    invariant: '位置 i 的水量为 min(leftMax, rightMax) - height[i]；移动较矮侧不会错过更高的一侧。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(height) {
  let l = 0;
  let r = height.length - 1;
  let leftMax = 0;
  let rightMax = 0;
  let water = 0;
  while (l < r) {
    if (height[l] < height[r]) {
      leftMax = Math.max(leftMax, height[l]);
      water += leftMax - height[l];
      l++;
    } else {
      rightMax = Math.max(rightMax, height[r]);
      water += rightMax - height[r];
      r--;
    }
  }
  return water;
}`,
    edge_cases: [
      { call: '[0,1,0,2,1,0,1,3,2,1,2,1]', expected: 6, why: '标准示例' },
      { call: '[4,2,0,3,2,5]', expected: 9, why: '低谷蓄水' },
      { call: '[]', expected: 0, why: '空数组' },
    ],
    common_mistakes: [
      '先更新最大值再加水导致同一根柱子被算成负贡献',
      '移动较高侧，错过矮侧的蓄水边界',
      '用单调栈时弹出条件写错，导致平台高度重复计算',
    ],
    followups: [
      '单调栈解法的复杂度与适用场景？',
      '二维接雨水（407 题）如何用小顶堆？',
    ],
    rubric: [
      { point: '双指针每次移动较矮侧，并说明原因', weight: 2 },
      { point: '水位按 min(左最大, 右最大) 计算', weight: 2 },
      { point: '能给出单调栈替代方案', weight: 1 },
    ],
  },
  {
    id: 'Q015',
    title: '1. 两数之和',
    question_url: 'https://leetcode.cn/problems/two-sum/',
    core_idea: '一次遍历用哈希表记录已见数值到下标；对当前值查 target - 当前值是否已出现，避免同一元素用两次。',
    invariant: '哈希表只包含当前下标之前的元素；因此找到的配对一定是一前一后。',
    complexity: { time: 'O(n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}`,
    edge_cases: [
      { call: '[2,7,11,15],9', expected: [0,1], why: '标准示例' },
      { call: '[3,3],6', expected: [0,1], why: '重复值但不同下标' },
      { call: '[1,2],7', expected: [], why: '无解' },
    ],
    common_mistakes: [
      '先把当前值写入哈希再查找，导致同一个下标被用两次',
      '返回值写反或返回数值而不是下标',
      '用对象存储时键被转成字符串，数值与字符串混淆',
    ],
    followups: [
      '数组已排序时如何用双指针做到 O(1) 额外空间？',
      '三数之和如何复用本题的去重思路？',
    ],
    rubric: [
      { point: '边查边存，先查后存避免自配', weight: 2 },
      { point: '返回下标而非数值，重复值用不同下标', weight: 1 },
      { point: '能说明 O(n) 时间与空间换时间', weight: 1 },
    ],
  },
  {
    id: 'Q016',
    title: '46. 全排列',
    question_url: 'https://leetcode.cn/problems/permutations/',
    core_idea: '回溯：用 used 标记已选元素，递归填满每个位置；到达叶子时复制路径，回溯时撤销选择。',
    invariant: 'path 中的元素互不重复且都属于原数组；used 与 path 一一对应。',
    complexity: { time: 'O(n·n!)', space: 'O(n)（不计输出）' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  const out = [];
  const path = [];
  const used = new Array(nums.length).fill(false);
  const dfs = () => {
    if (path.length === nums.length) { out.push(path.slice()); return; }
    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(nums[i]);
      dfs();
      path.pop();
      used[i] = false;
    }
  };
  dfs();
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3]', expected: [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]], why: '3 个元素 6 种排列' },
      { call: '[1]', expected: [[1]], why: '单元素' },
      { call: '[]', expected: [[]], why: '空数组有一种空排列' },
    ],
    common_mistakes: [
      'push path 而不是 path.slice()，后续回溯把已存结果改掉',
      '回溯时忘记 pop 或忘记复位 used',
      '含重复元素时未先去重/未用排序跳过同层重复（47 题）',
    ],
    followups: [
      '含重复元素时如何避免重复排列？',
      '如何用交换法原地生成排列？',
    ],
    rubric: [
      { point: '回溯路径、选择、撤销三件事完整', weight: 2 },
      { point: '叶子处复制 path，避免引用被修改', weight: 1 },
      { point: '复杂度 O(n·n!)，能解释输出规模', weight: 1 },
    ],
  },
];
