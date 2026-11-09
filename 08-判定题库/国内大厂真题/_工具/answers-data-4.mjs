export const ANSWERS4 = [
  {
    id: 'Q033', title: '124. 二叉树中的最大路径和', question_url: 'https://leetcode.cn/problems/binary-tree-maximum-path-sum/',
    core_idea: '后序递归：每个节点向父节点返回“以该节点为端点的最大向下路径和”，同时在节点处用 左增益+节点值+右增益 更新全局最大值。负增益截断为 0。',
    invariant: 'gain(n) 返回从 n 向下走且不折返的最大路径和；best 是已处理子树内任意路径的最大和。',
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
  const root = build(a);
  let best = -Infinity;
  function gain(n) {
    if (!n) return 0;
    const l = Math.max(0, gain(n.left));
    const r = Math.max(0, gain(n.right));
    best = Math.max(best, n.val + l + r);
    return n.val + Math.max(l, r);
  }
  gain(root);
  return best;
}`,
    edge_cases: [
      { call: '[1,2,3]', expected: 6, why: '2-1-3 走遍全树' },
      { call: '[-10,9,20,null,null,15,7]', expected: 42, why: '15-20-7，负根不参与' },
      { call: '[-3]', expected: -3, why: '全负时至少取一个节点' },
    ],
    common_mistakes: ['把 best 初始化为 0，全负树返回 0', '向父节点返回时返回了左右都取的折返和', '忘记对负增益截断为 0'],
    followups: ['如何同时返回最大路径的节点列表？', '如果路径必须经过根节点，怎么改？'],
    rubric: [
      { point: 'gain 的语义是单边向下且负增益截断为 0', weight: 2 },
      { point: '在节点处用左+中+右更新 best', weight: 1 },
      { point: '全负树返回最大单节点值', weight: 1 },
    ],
  },
  {
    id: 'Q034', title: '41. 缺失的第一个正数', question_url: 'https://leetcode.cn/problems/first-missing-positive/',
    core_idea: '原地哈希：把值 v∈[1,n] 放到下标 v-1，使 nums[i]=i+1；最后第一个不满足的位置即答案，否则答案是 n+1。',
    invariant: '扫描结束后 [0,i) 区间内 nums[j]=j+1；交换只发生在值域内且目标位置尚未正确时。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  const n = nums.length;
  for (let i = 0; i < n; i++) {
    while (nums[i] > 0 && nums[i] <= n && nums[nums[i] - 1] !== nums[i]) {
      const j = nums[i] - 1;
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
  }
  for (let i = 0; i < n; i++) if (nums[i] !== i + 1) return i + 1;
  return n + 1;
}`,
    edge_cases: [
      { call: '[1,2,0]', expected: 3, why: '1..n 都在位，答案 n+1' },
      { call: '[3,4,-1,1]', expected: 2, why: '2 缺失' },
      { call: '[7,8,9,11,12]', expected: 1, why: '1 缺失，越界值不参与' },
    ],
    common_mistakes: ['用排序 O(n log n) 冒充 O(n)', 'while 条件写成 if，漏掉被换来的值仍需归位', '把 0 和负数也放进桶'],
    followups: ['为什么交换次数总计是 O(n)？', '若允许修改输入数组，如何用符号标记法？'],
    rubric: [
      { point: '值 v 映射到下标 v-1 且只处理 1..n', weight: 2 },
      { point: '用 while 处理换入的未归位值', weight: 1 },
      { point: '全都在位时返回 n+1', weight: 1 },
    ],
  },
  {
    id: 'Q035', title: '165. 比较版本号', question_url: 'https://leetcode.cn/problems/compare-version-numbers/',
    core_idea: '按点切分，逐段转数字比较；缺失段视为 0，因此 1.0 与 1.0.0 相等，前导零无意义。',
    invariant: '每轮比较第 i 段时，两版本的前 i-1 段已判定相等。',
    complexity: { time: 'O(m+n)', space: 'O(m+n)' },
    code_lang: 'javascript',
    code: `function solve(a, b) {
  const x = a.split('.'), y = b.split('.');
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = Number(x[i] || 0), q = Number(y[i] || 0);
    if (p > q) return 1;
    if (p < q) return -1;
  }
  return 0;
}`,
    edge_cases: [
      { call: '"1.01", "1.001"', expected: 0, why: '前导零不影响数值' },
      { call: '"1.0", "1.0.0"', expected: 0, why: '缺失段补 0' },
      { call: '"1.2", "1.10"', expected: -1, why: '按数值而不是字典序比较' },
    ],
    common_mistakes: ['按字符串字典序比较，得到 1.10 < 1.2 的错误结论', '只比较到较短长度', '用 parseInt 处理超长版本号导致精度丢失'],
    followups: ['版本号段可能超过 Number 安全整数时怎么办？', '如何支持 pre-release 后缀（1.0.0-beta）？'],
    rubric: [
      { point: '逐段按数值比较而非字典序', weight: 2 },
      { point: '缺失段补 0，长度不同也能正确判等', weight: 1 },
      { point: '前导零不影响结果', weight: 1 },
    ],
  },
  {
    id: 'Q036', title: '221. 最大正方形', question_url: 'https://leetcode.cn/problems/maximal-square/',
    core_idea: 'DP：dp[i][j] 表示以 (i,j) 为右下角的最大全 1 正方形边长，等于 左、上、左上 三者最小值 +1。',
    invariant: 'dp[i][j] 只依赖上一行与当前行左侧，可用一维滚动；答案取最大边长的平方。',
    complexity: { time: 'O(mn)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(matrix) {
  const rows = matrix.length;
  if (!rows) return 0;
  const cols = matrix[0].length;
  const dp = new Array(cols + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= rows; i++) {
    let prev = 0;
    for (let j = 1; j <= cols; j++) {
      const cur = dp[j];
      if (matrix[i - 1][j - 1] === '1') {
        dp[j] = Math.min(dp[j], dp[j - 1], prev) + 1;
        best = Math.max(best, dp[j]);
      } else {
        dp[j] = 0;
      }
      prev = cur;
    }
  }
  return best * best;
}`,
    edge_cases: [
      { call: '[["1","1"],["1","1"]]', expected: 4, why: '2×2 全 1' },
      { call: '[["1","0","1"],["1","1","1"]]', expected: 1, why: '无法构成 2×2' },
      { call: '[["0"]]', expected: 0, why: '无 1' },
    ],
    common_mistakes: ['返回边长而不是面积', '一维滚动时 prev 保存的是已更新的 dp[j-1]', '只检查左和上，漏掉左上'],
    followups: ['如何输出最大正方形的左上角坐标？', '若允许任意矩形，最大全 1 矩形怎么求？'],
    rubric: [
      { point: 'dp 定义以当前格为右下角', weight: 2 },
      { point: '转移取左/上/左上最小值 +1', weight: 1 },
      { point: '返回面积而不是边长', weight: 1 },
    ],
  },
  {
    id: 'Q037', title: '148. 排序链表', question_url: 'https://leetcode.cn/problems/sort-list/',
    core_idea: '自顶向下归并：快慢指针找中点并断开，递归排序两半，再合并两个有序链表。',
    invariant: '每次递归处理的链表区间相互不重叠，合并后整体有序。',
    complexity: { time: 'O(n log n)', space: 'O(log n)' },
    code_lang: 'javascript',
    code: `function solve(arr) {
  function build(a) {
    let head = null;
    for (let i = a.length - 1; i >= 0; i--) head = { val: a[i], next: head };
    return head;
  }
  function sortList(h) {
    if (!h || !h.next) return h;
    let slow = h, fast = h.next;
    while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }
    const mid = slow.next;
    slow.next = null;
    const merge = (x, y) => {
      const d = { next: null };
      let t = d;
      while (x && y) {
        if (x.val <= y.val) { t.next = x; x = x.next; }
        else { t.next = y; y = y.next; }
        t = t.next;
      }
      t.next = x || y;
      return d.next;
    };
    return merge(sortList(h), sortList(mid));
  }
  let p = sortList(build(arr));
  const out = [];
  while (p) { out.push(p.val); p = p.next; }
  return out;
}`,
    edge_cases: [
      { call: '[4,2,1,3]', expected: [1,2,3,4], why: '常规乱序' },
      { call: '[]', expected: [], why: '空链表' },
      { call: '[5,5,-1,0]', expected: [-1,0,5,5], why: '含负数与重复值，稳定性不影响值序列' },
    ],
    common_mistakes: ['找中点后忘记 slow.next=null 导致无限递归', '快指针从 head 起步导致中点偏左', '合并时没有接上剩余链表'],
    followups: ['自底向上归并如何做到 O(1) 空间？', '为什么链表排序通常选归并而不是快排？'],
    rubric: [
      { point: '快慢指针找中点并断开', weight: 2 },
      { point: '合并两个有序链表并接上剩余部分', weight: 1 },
      { point: '边界（空/单节点）直接返回', weight: 1 },
    ],
  },
  {
    id: 'Q038', title: '32. 最长有效括号', question_url: 'https://leetcode.cn/problems/longest-valid-parentheses/',
    core_idea: '栈存下标，栈底始终是“最后一个未匹配的右括号位置”；遇到右括号弹栈后栈非空则用当前下标减栈顶更新答案。',
    invariant: '栈内自底向上下标递增；栈底元素的右侧到当前下标的区间是潜在有效区间。',
    complexity: { time: 'O(n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(s) {
  const st = [-1];
  let best = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') st.push(i);
    else {
      st.pop();
      if (!st.length) st.push(i);
      else best = Math.max(best, i - st[st.length - 1]);
    }
  }
  return best;
}`,
    edge_cases: [
      { call: '"(()"', expected: 2, why: '末尾右括号无处匹配' },
      { call: '")()())"', expected: 4, why: '中间 4 个字符有效' },
      { call: '""', expected: 0, why: '空串' },
    ],
    common_mistakes: ['栈为空时仍计算长度导致越界或错值', '把栈底哨兵也弹出', '只统计括号数量不看位置'],
    followups: ['DP 解法如何定义状态？', '如何同时返回最长有效子串内容？'],
    rubric: [
      { point: '栈底哨兵表示最后一个未匹配右括号', weight: 2 },
      { point: '弹栈后按栈是否为空分支处理', weight: 1 },
      { point: '空串返回 0', weight: 1 },
    ],
  },
  {
    id: 'Q039', title: '69. x 的平方根', question_url: 'https://leetcode.cn/problems/sqrtx/',
    core_idea: '在 [0,x] 上二分找最大的 mid 使 mid*mid ≤ x；用除法 mid ≤ x/mid 避免乘法溢出。',
    invariant: '答案始终在 [lo,hi] 内；循环结束时 lo 越过 hi，hi 即下取整平方根。',
    complexity: { time: 'O(log x)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(x) {
  let lo = 0, hi = x, ans = 0;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (mid === 0 || mid <= Math.floor(x / mid)) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}`,
    edge_cases: [
      { call: '4', expected: 2, why: '完全平方数' },
      { call: '8', expected: 2, why: '下取整而不是四舍五入' },
      { call: '0', expected: 0, why: '零边界与除零保护' },
    ],
    common_mistakes: ['用 Math.sqrt 直接返回浮点结果', 'mid*mid 在 32 位溢出', '返回 lo 而不是记录的最后可行值'],
    followups: ['如何返回保留 k 位小数的平方根？', '牛顿迭代怎么写？'],
    rubric: [
      { point: '二分查找最大的 mid 使 mid² ≤ x', weight: 2 },
      { point: '用除法或 BigInt 避免乘法溢出', weight: 1 },
      { point: 'x=0 时返回 0 且不除零', weight: 1 },
    ],
  },
  {
    id: 'Q040', title: '4. 寻找两个正序数组的中位数', question_url: 'https://leetcode.cn/problems/median-of-two-sorted-arrays/',
    core_idea: '在较短数组上二分划分点 i，另一数组划分点 j=(m+n+1)/2-i；满足 a[i-1]≤b[j] 且 b[j-1]≤a[i] 时，由四邻值算中位数。',
    invariant: '划分把两数组合并后的前 half 个元素放到左侧，且左半最大值 ≤ 右半最小值。',
    complexity: { time: 'O(log min(m,n))', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(a, b) {
  if (a.length > b.length) return solve(b, a);
  const m = a.length, n = b.length, total = m + n, half = Math.floor((total + 1) / 2);
  let lo = 0, hi = m;
  while (lo <= hi) {
    const i = Math.floor((lo + hi) / 2), j = half - i;
    const aL = i > 0 ? a[i - 1] : -Infinity, aR = i < m ? a[i] : Infinity;
    const bL = j > 0 ? b[j - 1] : -Infinity, bR = j < n ? b[j] : Infinity;
    if (aL <= bR && bL <= aR) {
      if (total % 2 === 1) return Math.max(aL, bL);
      return (Math.max(aL, bL) + Math.min(aR, bR)) / 2;
    } else if (aL > bR) hi = i - 1;
    else lo = i + 1;
  }
  return 0;
}`,
    edge_cases: [
      { call: '[1,3], [2]', expected: 2, why: '奇数个元素取中间值' },
      { call: '[1,2], [3,4]', expected: 2.5, why: '偶数个取两个中间值平均' },
      { call: '[], [1]', expected: 1, why: '一个数组为空' },
    ],
    common_mistakes: ['在长数组上二分导致边界处理复杂与越界', 'half 用 (m+n)/2 忘记 +1 导致奇数长度偏左', '越界侧不用 ±Infinity 而直接取 0'],
    followups: ['为什么必须把二分限制在较短数组上？', '若要求 O(log(m+n)) 且不比较数值大小，如何做？'],
    rubric: [
      { point: '在较短数组上二分划分点', weight: 2 },
      { point: '四邻值与 ±Infinity 边界处理正确', weight: 1 },
      { point: '奇偶长度分别返回单值与平均值', weight: 1 },
    ],
  },
  {
    id: 'Q041', title: '22. 括号生成', question_url: 'https://leetcode.cn/problems/generate-parentheses/',
    core_idea: '回溯：已用左括号数小于 n 时可放 "("，右括号数小于左括号数时可放 ")"；长度到 2n 收集结果。',
    invariant: '递归过程中任意前缀的右括号数不超过左括号数，因此生成的都是合法序列且不重复。',
    complexity: { time: 'O(C(2n,n))', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(n) {
  const out = [];
  function dfs(open, close, cur) {
    if (cur.length === 2 * n) { out.push(cur); return; }
    if (open < n) dfs(open + 1, close, cur + '(');
    if (close < open) dfs(open, close + 1, cur + ')');
  }
  dfs(0, 0, '');
  return out;
}`,
    edge_cases: [
      { call: '1', expected: ['()'], why: '只有一对' },
      { call: '2', expected: ['(())','()()'], why: '先放左括号的枚举顺序' },
    ],
    common_mistakes: ['先枚举右括号导致顺序与期望不同', '用 set 去重掩盖了非法序列', '只在 open<n 时递归而漏掉右括号分支'],
    followups: ['如何按字典序输出？', '结果数量为什么是第 n 个卡特兰数？'],
    rubric: [
      { point: '左括号数与右括号数双约束', weight: 2 },
      { point: '前缀合法性由 close<open 保证', weight: 1 },
      { point: '长度到 2n 才收集且顺序稳定', weight: 1 },
    ],
  },
  {
    id: 'Q042', title: '补充题4. 手撕快速排序', question_url: 'https://leetcode.cn/problems/sort-an-array/',
    core_idea: '选基准做分区，小于基准的放左、大于的放右，递归处理两侧；本实现用额外数组分区，保证重复元素不会退化。',
    invariant: '分区后左段元素 ≤ 基准 ≤ 右段元素，且基准位置已确定。',
    complexity: { time: '平均 O(n log n)，最坏 O(n²)', space: 'O(n log n)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  if (nums.length <= 1) return nums.slice();
  const pivot = nums[Math.floor(nums.length / 2)];
  const left = [], mid = [], right = [];
  for (const v of nums) {
    if (v < pivot) left.push(v);
    else if (v > pivot) right.push(v);
    else mid.push(v);
  }
  return [...solve(left), ...mid, ...solve(right)];
}`,
    edge_cases: [
      { call: '[3,1,2]', expected: [1,2,3], why: '常规乱序' },
      { call: '[5,5,1]', expected: [1,5,5], why: '重复元素不退化' },
      { call: '[-2,10,0]', expected: [-2,0,10], why: '负数参与比较' },
    ],
    common_mistakes: ['三路分区缺失导致全相同元素 O(n²)', '基准取边界且已排序时退化', '原地分区时交换条件写错丢元素'],
    followups: ['如何改成原地 Lomuto/Hoare 分区？', '随机基准为什么能把期望复杂度降到 O(n log n)？'],
    rubric: [
      { point: '划分保证左 ≤ 基准 ≤ 右', weight: 2 },
      { point: '重复元素使用三路或等价处理', weight: 1 },
      { point: '递归终止条件与切片不修改输入', weight: 1 },
    ],
  },
  {
    id: 'Q043', title: '93. 复原IP地址', question_url: 'https://leetcode.cn/problems/restore-ip-addresses/',
    core_idea: 'DFS 依次切出 4 段，每段长度 1–3 且数值 ≤255，禁止前导零（除了 "0" 本身）；四段用尽且恰好耗完字符串才收集。',
    invariant: '已切出的段数 + 剩余字符数必须落在 [剩余段数, 3×剩余段数] 内，否则剪枝。',
    complexity: { time: 'O(3^4)', space: 'O(4)' },
    code_lang: 'javascript',
    code: `function solve(s) {
  const out = [];
  function dfs(i, parts) {
    if (parts.length === 4) {
      if (i === s.length) out.push(parts.join('.'));
      return;
    }
    if (s.length - i > (4 - parts.length) * 3) return;
    let num = 0;
    for (let j = i; j < s.length && j < i + 3; j++) {
      num = num * 10 + (s.charCodeAt(j) - 48);
      if (num > 255) break;
      parts.push(s.slice(i, j + 1));
      dfs(j + 1, parts);
      parts.pop();
      if (num === 0) break;
    }
  }
  dfs(0, []);
  return out;
}`,
    edge_cases: [
      { call: '"25525511135"', expected: ['255.255.11.135','255.255.111.35'], why: '两种切法都合法' },
      { call: '"0000"', expected: ['0.0.0.0'], why: '前导零禁止，但单个 0 合法' },
    ],
    common_mistakes: ['允许 "01" 这样的前导零段', '段数到 4 但字符串未耗完仍然收集', '忘记 num>255 后 break 导致后续更长段也尝试'],
    followups: ['IPv6 的合法地址如何校验？', '如何把 DFS 改成迭代写法？'],
    rubric: [
      { point: '每段长度 1–3 且值 ≤255', weight: 2 },
      { point: '禁止前导零（单 0 除外）并正确剪枝', weight: 1 },
      { point: '四段耗尽且下标到末尾才收集', weight: 1 },
    ],
  },
  {
    id: 'Q044', title: '101. 对称二叉树', question_url: 'https://leetcode.cn/problems/symmetric-tree/',
    core_idea: '把“对称”转成两棵子树互为镜像：左子树的左孩子对右子树的右孩子，左子树的右孩子对右子树的左孩子。',
    invariant: 'mirror(x,y) 为真当且仅当两棵以 x、y 为根的子树镜像相等。',
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
  function mirror(x, y) {
    if (!x && !y) return true;
    if (!x || !y) return false;
    return x.val === y.val && mirror(x.left, y.right) && mirror(x.right, y.left);
  }
  const root = build(a);
  return root ? mirror(root.left, root.right) : true;
}`,
    edge_cases: [
      { call: '[1,2,2,3,4,4,3]', expected: true, why: '左右完全镜像' },
      { call: '[1,2,2,null,3,null,3]', expected: false, why: '3 都在右侧不再镜像' },
      { call: '[1]', expected: true, why: '单节点对称' },
    ],
    common_mistakes: ['比较左右子树自身是否相等而不是镜像', '只比较值不比较结构', '镜像递归时交叉方向写反'],
    followups: ['如何用层序队列迭代实现？', '若允许删除节点使树对称，最少删几个？'],
    rubric: [
      { point: '镜像递归使用 x.left↔y.right 交叉比较', weight: 2 },
      { point: '空节点与结构不等的情况区分', weight: 1 },
      { point: '单节点/空树返回 true', weight: 1 },
    ],
  },
  {
    id: 'Q045', title: '1143. 最长公共子序列', question_url: 'https://leetcode.cn/problems/longest-common-subsequence/',
    core_idea: 'dp[i][j] 表示 a 前 i 个字符与 b 前 j 个字符的 LCS 长度；末字符相同则 dp[i-1][j-1]+1，否则取左/上较大者。',
    invariant: 'dp 只依赖上一行与当前行左侧，滚动数组时用 prev 保存左上角。',
    complexity: { time: 'O(mn)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(a, b) {
  const n = b.length;
  const dp = new Array(n + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const cur = dp[j];
      if (a[i - 1] === b[j - 1]) dp[j] = prev + 1;
      else dp[j] = Math.max(dp[j], dp[j - 1]);
      prev = cur;
    }
  }
  return dp[n];
}`,
    edge_cases: [
      { call: '"abcde", "ace"', expected: 3, why: 'LCS 为 ace' },
      { call: '"abc", "def"', expected: 0, why: '无公共字符' },
      { call: '"abc", "abc"', expected: 3, why: '完全相同时等于长度' },
    ],
    common_mistakes: ['把子序列误当成子串，字符不等时清零', '滚动数组 prev 记住的是更新后的值', '行列方向与下标错位'],
    followups: ['子串版本（718）的转移有什么不同？', '如何回溯输出一个具体的 LCS？'],
    rubric: [
      { point: '空串边界由 0 行 0 列自然覆盖', weight: 1 },
      { point: '字符相等走左上 +1，否则取左/上最大', weight: 2 },
      { point: '滚动数组的 prev 保存旧左上值', weight: 1 },
    ],
  },
  {
    id: 'Q046', title: '105. 从前序与中序遍历序列构造二叉树', question_url: 'https://leetcode.cn/problems/construct-binary-tree-from-preorder-and-inorder-traversal/',
    core_idea: '前序首元素是根；在中序中找到根的位置切出左右子树长度，再按长度切前序，递归构造。',
    invariant: '每次递归传入的前序与中序片段描述同一棵子树且长度相等。',
    complexity: { time: 'O(n²)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(pre, ino) {
  function build(p, i) {
    if (!p.length) return null;
    const root = { val: p[0], left: null, right: null };
    const k = i.indexOf(p[0]);
    root.left = build(p.slice(1, k + 1), i.slice(0, k));
    root.right = build(p.slice(k + 1), i.slice(k + 1));
    return root;
  }
  const root = build(pre, ino);
  const out = [], q = [root];
  while (q.length) {
    const n = q.shift();
    out.push(n.val);
    if (n.left) q.push(n.left);
    if (n.right) q.push(n.right);
  }
  return out;
}`,
    edge_cases: [
      { call: '[3,9,20,15,7], [9,3,15,20,7]', expected: [3,9,20,15,7], why: '标准示例，层序还原' },
      { call: '[1,2], [2,1]', expected: [1,2], why: '只有左子树' },
      { call: '[-1], [-1]', expected: [-1], why: '单节点' },
    ],
    common_mistakes: ['前序切片长度用中序下标但忘了从 1 开始', '左右子树顺序颠倒', '用值作哈希键但题目允许重复值时失效'],
    followups: ['如何用哈希表把复杂度降到 O(n)？', '若给的是中序与后序，如何调整？'],
    rubric: [
      { point: '前序首元素为根并定位中序下标', weight: 2 },
      { point: '按左子树长度切分两段前序', weight: 1 },
      { point: '空片段返回 null，单节点正确', weight: 1 },
    ],
  },
  {
    id: 'Q047', title: '322. 零钱兑换', question_url: 'https://leetcode.cn/problems/coin-change/',
    core_idea: '完全背包：dp[x] 表示凑出金额 x 的最少硬币数，dp[x]=min(dp[x-coin]+1)；初始化 dp[0]=0，其余为无穷。',
    invariant: '遍历到金额 x 时，所有小于 x 的金额已是最优解，因此 dp[x-coin]+1 可信。',
    complexity: { time: 'O(amount·k)', space: 'O(amount)' },
    code_lang: 'javascript',
    code: `function solve(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (let x = 1; x <= amount; x++) {
    for (const c of coins) {
      if (c <= x && dp[x - c] + 1 < dp[x]) dp[x] = dp[x - c] + 1;
    }
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}`,
    edge_cases: [
      { call: '[1,2,5], 11', expected: 3, why: '5+5+1' },
      { call: '[2], 3', expected: -1, why: '无法凑出' },
      { call: '[1], 0', expected: 0, why: '金额 0 不需要硬币' },
    ],
    common_mistakes: ['dp 初始化为 0 导致无法凑出时返回 0', '外层遍历硬币内层遍历金额却按 0/1 背包倒序', '忘记判断 Infinity 直接返回'],
    followups: ['如何同时输出使用的硬币组合？', '与 0/1 背包在遍历顺序上的区别是什么？'],
    rubric: [
      { point: 'dp[0]=0，其余初始化为无穷', weight: 2 },
      { point: '完全背包正序遍历金额', weight: 1 },
      { point: '不可达返回 -1', weight: 1 },
    ],
  },
  {
    id: 'Q048', title: '129. 求根到叶子节点数字之和', question_url: 'https://leetcode.cn/problems/sum-root-to-leaf-numbers/',
    core_idea: '前序携带当前路径数值 cur=cur*10+node.val；到叶子时把 cur 累加进总和。',
    invariant: 'cur 等于从根到当前节点路径拼成的十进制数；只有叶子才计入答案。',
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
  let sum = 0;
  function dfs(n, cur) {
    if (!n) return;
    const v = cur * 10 + n.val;
    if (!n.left && !n.right) { sum += v; return; }
    dfs(n.left, v);
    dfs(n.right, v);
  }
  dfs(build(a), 0);
  return sum;
}`,
    edge_cases: [
      { call: '[1,2,3]', expected: 25, why: '12 + 13' },
      { call: '[4,9,0,5,1]', expected: 1026, why: '495 + 491 + 40' },
      { call: '[0]', expected: 0, why: '单节点 0' },
    ],
    common_mistakes: ['在非叶子节点也累加导致重复计数', '用字符串拼接再转数字，大数时精度丢失', '把 cur 传引用导致兄弟分支串值'],
    followups: ['如果路径要从叶子回到根拼接，结果一样吗？', '如何用迭代栈实现？'],
    rubric: [
      { point: 'cur=cur*10+val 沿路径传递', weight: 2 },
      { point: '只在叶子节点累加', weight: 1 },
      { point: '单节点与含 0 的路径正确', weight: 1 },
    ],
  },
];
