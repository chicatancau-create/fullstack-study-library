export const ANSWERS7 = [
  {
    id: 'Q081', title: '剑指 Offer 22. 链表中倒数第k个节点', question_url: 'https://leetcode.cn/problems/lian-biao-zhong-dao-shu-di-kge-jie-dian-lcof/',
    core_idea: '快慢指针：快指针先走 k 步，再与慢指针同步前进，快指针到尾时慢指针即倒数第 k 个节点。',
    invariant: '快慢指针间距恒为 k，因此 slow 最终停在正数第 n-k+1 个节点。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(arr, k) {
  let fast = 0, slow = 0;
  while (fast < arr.length && k > 0) { fast++; k--; }
  while (fast < arr.length) { fast++; slow++; }
  return arr[slow];
}`,
    edge_cases: [
      { call: '[1,2,3,4,5], 2', expected: 4, why: '倒数第二个是 4' },
      { call: '[1], 1', expected: 1, why: '单节点' },
      { call: '[1,2], 2', expected: 1, why: '倒数第二个是头节点' },
    ],
    common_mistakes: ['先求长度再遍历两遍（可行但不是最优）', '快指针先走 k-1 步导致偏移', 'k 大于长度时越界'],
    followups: ['k 大于链表长度时如何返回 null？', '与 19 题删除倒数第 k 个的区别？'],
    rubric: [
      { point: '快指针先走 k 步', weight: 2 },
      { point: '同步前进直到快指针到尾', weight: 1 },
      { point: '返回慢指针所指节点值', weight: 1 },
    ],
  },
  {
    id: 'Q082', title: '198. 打家劫舍', question_url: 'https://leetcode.cn/problems/house-robber/',
    core_idea: 'DP：dp[i]=max(dp[i-1], dp[i-2]+nums[i])，即不抢当前或抢当前加前前；用两个变量滚动。',
    invariant: 'prev 是 dp[i-2]、cur 是 dp[i-1]，每轮更新后仍保持该含义。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  let prev = 0, cur = 0;
  for (const x of nums) {
    const next = Math.max(cur, prev + x);
    prev = cur;
    cur = next;
  }
  return cur;
}`,
    edge_cases: [
      { call: '[1,2,3,1]', expected: 4, why: '抢 1 和 3' },
      { call: '[2,7,9,3,1]', expected: 12, why: '抢 2+9+1' },
      { call: '[0]', expected: 0, why: '单间为 0' },
    ],
    common_mistakes: ['把 dp[i-2]+nums[i] 写成 dp[i-1]+nums[i]', '用贪心选局部最大导致相邻冲突', '空数组未返回 0'],
    followups: ['环形房屋（213）如何拆成两段？', '如何输出抢了哪些房子？'],
    rubric: [
      { point: '转移为 max(不抢, 抢+前前)', weight: 2 },
      { point: '两个变量滚动不覆盖 dp[i-2]', weight: 1 },
      { point: '单元素与零值正确', weight: 1 },
    ],
  },
  {
    id: 'Q083', title: '48. 旋转图像', question_url: 'https://leetcode.cn/problems/rotate-image/',
    core_idea: '先沿主对角线转置，再左右翻转每一行，等价于顺时针旋转 90°；全程原地交换。',
    invariant: '转置后 matrix[i][j] 变为原 matrix[j][i]；左右翻转后列序反转，组合即顺时针旋转。',
    complexity: { time: 'O(n²)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(matrix) {
  const n = matrix.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const t = matrix[i][j];
      matrix[i][j] = matrix[j][i];
      matrix[j][i] = t;
    }
  }
  for (const row of matrix) row.reverse();
  return matrix;
}`,
    edge_cases: [
      { call: '[[1,2,3],[4,5,6],[7,8,9]]', expected: [[7,4,1],[8,5,2],[9,6,3]], why: '标准 3×3' },
      { call: '[[1,2],[3,4]]', expected: [[3,1],[4,2]], why: '2×2' },
      { call: '[[1]]', expected: [[1]], why: '单元素' },
    ],
    common_mistakes: ['双层循环 j 从 0 开始，转置交换两次回到原状', '用额外矩阵冒充原地', '顺时针与逆时针方向弄反'],
    followups: ['逆时针旋转如何改？', '如何旋转非方阵？'],
    rubric: [
      { point: '转置只遍历上三角 j>i', weight: 2 },
      { point: '再逐行反转完成顺时针', weight: 1 },
      { point: '空间 O(1) 原地交换', weight: 1 },
    ],
  },
  {
    id: 'Q084', title: '补充题23. 检测循环依赖', question_url: 'https://leetcode.cn/problems/course-schedule/',
    core_idea: '把依赖对 (a,b) 视作 b→a 的有向边，用 Kahn 拓扑排序统计入度；能处理的节点数不足则存在环。',
    invariant: '队列中始终是入度为 0 的节点；处理一个节点就删除其出边。',
    complexity: { time: 'O(V+E)', space: 'O(V+E)' },
    code_lang: 'javascript',
    code: `function solve(edges) {
  const nodes = new Set();
  for (const [a, b] of edges) { nodes.add(a); nodes.add(b); }
  const adj = new Map(), indeg = new Map();
  for (const v of nodes) { adj.set(v, []); indeg.set(v, 0); }
  for (const [a, b] of edges) { adj.get(b).push(a); indeg.set(a, indeg.get(a) + 1); }
  const q = [...nodes].filter((v) => indeg.get(v) === 0);
  let seen = 0;
  while (q.length) {
    const v = q.shift();
    seen++;
    for (const w of adj.get(v)) {
      indeg.set(w, indeg.get(w) - 1);
      if (indeg.get(w) === 0) q.push(w);
    }
  }
  return seen !== nodes.size;
}`,
    edge_cases: [
      { call: '[[0,1],[1,2],[2,0]]', expected: true, why: '三点成环' },
      { call: '[[0,1],[1,2]]', expected: false, why: '链式依赖无环' },
      { call: '[]', expected: false, why: '空依赖无环' },
    ],
    common_mistakes: ['把 (a,b) 当成 a→b，拓扑方向反了', '入度只统计不递减', '忽略孤立节点导致误判'],
    followups: ['DFS 三色标记法如何写？', '若存在环，如何输出环上的节点？'],
    rubric: [
      { point: '依赖方向 b→a 与入度一致', weight: 2 },
      { point: '处理节点后递减出边入度', weight: 1 },
      { point: '已处理数不足即存在环', weight: 1 },
    ],
  },
  {
    id: 'Q085', title: '543. 二叉树的直径', question_url: 'https://leetcode.cn/problems/diameter-of-binary-tree/',
    core_idea: '后序求高度：每个节点处用 左高+右高 更新直径，向父返回 1+max(左高,右高)。',
    invariant: 'height(n) 是以 n 为根的子树高度；best 是已处理子树内的最大节点数路径。',
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
  let best = 0;
  function height(n) {
    if (!n) return 0;
    const l = height(n.left), r = height(n.right);
    best = Math.max(best, l + r);
    return 1 + Math.max(l, r);
  }
  height(build(a));
  return best;
}`,
    edge_cases: [
      { call: '[1,2,3,4,5]', expected: 3, why: '4-2-1-3 共 3 条边' },
      { call: '[1,2]', expected: 1, why: '单边' },
      { call: '[1]', expected: 0, why: '单节点直径为 0' },
    ],
    common_mistakes: ['返回节点数而不是边数', '只在根节点计算直径', '全局变量每轮重置'],
    followups: ['若直径按节点数计，结果差多少？', '如何输出直径路径？'],
    rubric: [
      { point: '后序返回子树高度', weight: 2 },
      { point: '每个节点处用左右高之和更新', weight: 1 },
      { point: '直径按边计数', weight: 1 },
    ],
  },
  {
    id: 'Q086', title: '402. 移掉K位数字', question_url: 'https://leetcode.cn/problems/remove-k-digits/',
    core_idea: '单调栈：遇到比栈顶小的数字就弹出栈顶并消耗 k，得到最小的剩余序列；最后去掉前导零。',
    invariant: '栈内数字单调不降，且已移除的数字数不超过 k。',
    complexity: { time: 'O(n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(num, k) {
  const st = [];
  for (const ch of num) {
    while (k > 0 && st.length && st[st.length - 1] > ch) {
      st.pop();
      k--;
    }
    st.push(ch);
  }
  while (k-- > 0) st.pop();
  let i = 0;
  while (i < st.length && st[i] === '0') i++;
  const out = st.slice(i).join('');
  return out === '' ? '0' : out;
}`,
    edge_cases: [
      { call: '"1432219", 3', expected: '1219', why: '弹出 4、3、2' },
      { call: '"10200", 1', expected: '200', why: '移除 1 后前导零被去掉' },
      { call: '"10", 2', expected: '0', why: '全部移除返回 0' },
    ],
    common_mistakes: ['只删连续下降的一段，漏掉后续更优删除', '忘记处理剩余 k', '结果为空串而不是 "0"'],
    followups: ['如何保证删除后数字位数最少？', '若要求保留恰好 k 位呢？'],
    rubric: [
      { point: '单调栈弹出更大栈顶并消耗 k', weight: 2 },
      { point: '循环后仍有 k 则从尾部删除', weight: 1 },
      { point: '去前导零并处理空结果', weight: 1 },
    ],
  },
  {
    id: 'Q087', title: '207. 课程表', question_url: 'https://leetcode.cn/problems/course-schedule/',
    core_idea: '建图后拓扑排序：入度为 0 的课先修，统计能修完的课程数，若小于总数说明有环。',
    invariant: '队列只放当前可修的课；每修完一门，其后续课程入度减一。',
    complexity: { time: 'O(V+E)', space: 'O(V+E)' },
    code_lang: 'javascript',
    code: `function solve(n, pre) {
  const adj = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (const [a, b] of pre) { adj[b].push(a); indeg[a]++; }
  const q = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) q.push(i);
  let done = 0;
  while (q.length) {
    const v = q.shift();
    done++;
    for (const w of adj[v]) if (--indeg[w] === 0) q.push(w);
  }
  return done === n;
}`,
    edge_cases: [
      { call: '2, [[1,0]]', expected: true, why: '先修 0 再修 1' },
      { call: '2, [[1,0],[0,1]]', expected: false, why: '互相依赖成环' },
      { call: '1, []', expected: true, why: '无依赖' },
    ],
    common_mistakes: ['边方向建成 a→b 但入度加在 b 上', '只判断直接自环，漏掉长环', '课程编号不从 0 开始时越界'],
    followups: ['如何输出一个合法修课顺序（210）？', 'DFS 版本如何检测环？'],
    rubric: [
      { point: '边 b→a 与入度累加一致', weight: 2 },
      { point: '入度归零才入队', weight: 1 },
      { point: '完成数等于 n 才无环', weight: 1 },
    ],
  },
  {
    id: 'Q088', title: '62. 不同路径', question_url: 'https://leetcode.cn/problems/unique-paths/',
    core_idea: 'DP：dp[i][j]=dp[i-1][j]+dp[i][j-1]；第一行第一列均为 1，可滚动成一维。',
    invariant: 'dp[j] 在处理第 i 行时先表示上方值，加上左侧 dp[j-1] 后表示当前格。',
    complexity: { time: 'O(mn)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(m, n) {
  const dp = new Array(n).fill(1);
  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) {
      dp[j] += dp[j - 1];
    }
  }
  return dp[n - 1];
}`,
    edge_cases: [
      { call: '3, 7', expected: 28, why: '标准示例' },
      { call: '3, 2', expected: 3, why: '小网格' },
      { call: '1, 1', expected: 1, why: '单格' },
    ],
    common_mistakes: ['第一行初始化成 0', '滚动数组先更新 dp[j-1] 再读导致重复', '把路径数当组合数溢出'],
    followups: ['有障碍物（63）如何改？', '为什么答案等于 C(m+n-2, m-1)？'],
    rubric: [
      { point: '一维 dp 初始全 1 对应第一行', weight: 2 },
      { point: '逐行累加左值与上值', weight: 1 },
      { point: '单行/单列返回 1', weight: 1 },
    ],
  },
  {
    id: 'Q089', title: '补充题2. 圆环回原点问题', question_url: 'https://leetcode.cn/problems/count-all-possible-routes/',
    core_idea: '环上 0..n-1 每次走 ±1，求恰好 k 步回到 0 的方案数；dp[step][pos] 由 step-1 的左右邻转移。',
    invariant: 'dp 只依赖上一步状态，按步数递增计算即可；位置取模保证环形。',
    complexity: { time: 'O(kn)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(n, k) {
  let dp = new Array(n).fill(0);
  dp[0] = 1;
  for (let s = 0; s < k; s++) {
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (!dp[i]) continue;
      next[(i + 1) % n] += dp[i];
      next[(i - 1 + n) % n] += dp[i];
    }
    dp = next;
  }
  return dp[0];
}`,
    edge_cases: [
      { call: '10, 1', expected: 0, why: '一步无法回到原点' },
      { call: '10, 2', expected: 2, why: '顺时针或逆时针各一步再返回' },
      { call: '3, 2', expected: 2, why: '三节点环两条往返路径' },
    ],
    common_mistakes: ['不做取模导致下标越界', '把 k 步写成最多 k 步并累加', 'n=1 时左右邻居重合需累加两次'],
    followups: ['n=2 时答案与什么数列有关？', '如何用矩阵快速幂做到 O(n³ log k)？'],
    rubric: [
      { point: 'dp 状态为步数与位置', weight: 2 },
      { point: '左右邻居按模运算回绕', weight: 1 },
      { point: '恰好 k 步而不是至多 k 步', weight: 1 },
    ],
  },
  {
    id: 'Q090', title: '179. 最大数', question_url: 'https://leetcode.cn/problems/largest-number/',
    core_idea: '自定义比较器：a 排在 b 前当且仅当 a+b > b+a（字符串拼接比较），排序后拼接并处理全零。',
    invariant: '比较器满足传递性，因此排序结果使任意相邻交换都不会得到更大的拼接数。',
    complexity: { time: 'O(n log n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  const strs = nums.map(String);
  strs.sort((a, b) => (b + a).localeCompare(a + b));
  if (strs[0] === '0') return '0';
  return strs.join('');
}`,
    edge_cases: [
      { call: '[10,2]', expected: '210', why: '210 > 102' },
      { call: '[3,30,34,5,9]', expected: '9534330', why: '标准示例' },
      { call: '[0,0]', expected: '0', why: '全零返回单个 0' },
    ],
    common_mistakes: ['按数值降序排序，30 会排在 3 前面', '比较 a+b 与 b+a 时用数值相减导致溢出', '全零时返回 "00"'],
    followups: ['比较器为什么满足传递性？', '若拼接后的数超过 64 位如何处理？'],
    rubric: [
      { point: '比较器按 a+b 与 b+a 的字典序', weight: 2 },
      { point: '排序后直接拼接', weight: 1 },
      { point: '全零结果返回 "0"', weight: 1 },
    ],
  },
  {
    id: 'Q091', title: '24. 两两交换链表中的节点', question_url: 'https://leetcode.cn/problems/swap-nodes-in-pairs/',
    core_idea: '哑节点 + 迭代：每轮取 first、second 两个节点，让 second 接到前驱后、first 接到 second 后，并把 second 的后继作为下一轮起点。',
    invariant: 'prev 始终指向已处理部分的最后一个节点，其 next 指向待处理段的第一个节点。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(arr) {
  const d = { val: 0, next: null };
  let tail = d;
  for (const v of arr) { tail.next = { val: v, next: null }; tail = tail.next; }
  const dummy = { next: d.next };
  let prev = dummy;
  while (prev.next && prev.next.next) {
    const a = prev.next, b = a.next;
    a.next = b.next;
    b.next = a;
    prev.next = b;
    prev = a;
  }
  const out = [];
  for (let p = dummy.next; p; p = p.next) out.push(p.val);
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3,4]', expected: [2,1,4,3], why: '两两交换' },
      { call: '[1]', expected: [1], why: '奇数个尾部不动' },
      { call: '[]', expected: [], why: '空链表' },
    ],
    common_mistakes: ['交换后 prev 没移到已交换的第二个节点', '丢头节点（无哑节点）', '奇数长度时越界'],
    followups: ['如何用递归实现？', 'K 个一组反转（25）如何推广？'],
    rubric: [
      { point: '哑节点统一处理头两个节点', weight: 1 },
      { point: '三指针重连顺序正确', weight: 2 },
      { point: '奇数长度与空链表正确', weight: 1 },
    ],
  },
  {
    id: 'Q092', title: '560. 和为K的子数组', question_url: 'https://leetcode.cn/problems/subarray-sum-equals-k/',
    core_idea: '前缀和 + 哈希：遍历时把此前出现过的前缀和计数，若 sum-k 出现过则以其计数累加答案。',
    invariant: 'map 记录的是当前下标之前所有前缀和的出现次数，因此每个合法区间只被统计一次。',
    complexity: { time: 'O(n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(nums, k) {
  const map = new Map([[0, 1]]);
  let sum = 0, count = 0;
  for (const x of nums) {
    sum += x;
    count += map.get(sum - k) || 0;
    map.set(sum, (map.get(sum) || 0) + 1);
  }
  return count;
}`,
    edge_cases: [
      { call: '[1,1,1], 2', expected: 2, why: '两个长度为 2 的区间' },
      { call: '[1,2,3], 3', expected: 2, why: '[3] 与 [1,2]' },
      { call: '[1], 0', expected: 0, why: '无满足区间' },
    ],
    common_mistakes: ['先存 map 再查，把自己算进区间', '忘记初始化 map(0)=1', '用滑动窗口处理含负数数组'],
    followups: ['为什么不能用双指针？', '若要求和为 K 且长度最短呢？'],
    rubric: [
      { point: 'map 初始含前缀和 0 计数 1', weight: 2 },
      { point: '先查 sum-k 再写入当前 sum', weight: 1 },
      { point: '计数累加而非仅判断存在', weight: 1 },
    ],
  },
  {
    id: 'Q093', title: '958. 二叉树的完全性检验', question_url: 'https://leetcode.cn/problems/check-completeness-of-a-binary-tree/',
    core_idea: '层序遍历包含空孩子：一旦遇到 null，其后不能再出现非空节点；全部遍历完即完全。',
    invariant: '遇到 null 之后队列中剩余节点必须全为 null，否则存在“空洞”。',
    complexity: { time: 'O(n)', space: 'O(n)' },
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
  if (!root) return true;
  const q = [root];
  let seenNull = false;
  while (q.length) {
    const n = q.shift();
    if (!n) { seenNull = true; continue; }
    if (seenNull) return false;
    q.push(n.left);
    q.push(n.right);
  }
  return true;
}`,
    edge_cases: [
      { call: '[1,2,3,4,5,6]', expected: true, why: '最后一层从左连续填充' },
      { call: '[1,2,3,4,5,null,7]', expected: false, why: '6 的位置空缺但 7 存在' },
      { call: '[1]', expected: true, why: '单节点' },
    ],
    common_mistakes: ['层序只压非空孩子，无法发现空洞', '遇到 null 后仍允许非空节点', '忽略右孩子缺失但左孩子存在的情况'],
    followups: ['如何用编号法（堆式下标）判断？', '满二叉树与完全二叉树的区别？'],
    rubric: [
      { point: '层序把 null 孩子也入队', weight: 2 },
      { point: '遇到 null 后出现非空即返回 false', weight: 1 },
      { point: '空树视为完全', weight: 1 },
    ],
  },
  {
    id: 'Q094', title: '110. 平衡二叉树', question_url: 'https://leetcode.cn/problems/balanced-binary-tree/',
    core_idea: '后序求高度：左右子树高度差超过 1 或子树已不平衡时返回 -1 作为失败标记，向上短路。',
    invariant: 'height(n) 返回 n 的真实高度，或 -1 表示该子树不平衡。',
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
  function height(n) {
    if (!n) return 0;
    const l = height(n.left);
    if (l === -1) return -1;
    const r = height(n.right);
    if (r === -1) return -1;
    if (Math.abs(l - r) > 1) return -1;
    return 1 + Math.max(l, r);
  }
  return height(build(a)) !== -1;
}`,
    edge_cases: [
      { call: '[3,9,20,null,null,15,7]', expected: true, why: '标准平衡树' },
      { call: '[1,2,2,3,3,null,null,4,4]', expected: false, why: '深层左右差 2' },
      { call: '[]', expected: true, why: '空树平衡' },
    ],
    common_mistakes: ['只检查根节点左右高度', '每个节点重复求高度导致 O(n²)', '用 -1 标记后仍继续加高度'],
    followups: ['如何同时返回不平衡的节点？', '红黑树如何保证近似平衡？'],
    rubric: [
      { point: '后序返回高度或 -1 标记', weight: 2 },
      { point: '左右差大于 1 判定失败', weight: 1 },
      { point: '空树返回 true', weight: 1 },
    ],
  },
  {
    id: 'Q095', title: '104. 二叉树的最大深度', question_url: 'https://leetcode.cn/problems/maximum-depth-of-binary-tree/',
    core_idea: '后序递归：空节点深度 0，否则 1+max(左深度,右深度)；也可用层序统计层数。',
    invariant: 'depth(n) 等于从 n 到最远叶子经过的节点数。',
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
  function depth(n) {
    if (!n) return 0;
    return 1 + Math.max(depth(n.left), depth(n.right));
  }
  return depth(build(a));
}`,
    edge_cases: [
      { call: '[3,9,20,null,null,15,7]', expected: 3, why: '三层' },
      { call: '[]', expected: 0, why: '空树深度 0' },
      { call: '[0]', expected: 1, why: '单节点深度 1' },
    ],
    common_mistakes: ['空树返回 1', '把深度按边数计算', '只走一条分支'],
    followups: ['最小深度（111）有什么陷阱？', '如何用层序迭代求深度？'],
    rubric: [
      { point: '空节点返回 0', weight: 2 },
      { point: '取左右较大者加 1', weight: 1 },
      { point: '单节点深度为 1', weight: 1 },
    ],
  },
  {
    id: 'Q096', title: '151. 翻转字符串里的单词', question_url: 'https://leetcode.cn/problems/reverse-words-in-a-string/',
    core_idea: '按空白切分并过滤空串，反转单词数组后用单个空格拼接；等价于原地先整体反转再逐词反转。',
    invariant: '过滤后数组中每项都是非空单词，拼接结果不含多余空格。',
    complexity: { time: 'O(n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(s) {
  return s.split(/\\s+/).filter(Boolean).reverse().join(' ');
}`,
    edge_cases: [
      { call: '"the sky is blue"', expected: 'blue is sky the', why: '标准示例' },
      { call: '"  hello world  "', expected: 'world hello', why: '首尾空格被去除' },
      { call: '"a good   example"', expected: 'example good a', why: '多个空格折叠为一个' },
    ],
    common_mistakes: ['只按单空格切分，残留空串产生双空格', '反转字符而不是单词', '忘记去除首尾空格'],
    followups: ['如何用 O(1) 额外空间原地完成？', '若输入是字符数组且要求不申请新数组？'],
    rubric: [
      { point: '按任意空白切分并过滤空串', weight: 2 },
      { point: '反转单词顺序', weight: 1 },
      { point: '单空格拼接无多余空格', weight: 1 },
    ],
  },
  {
    id: 'Q097', title: '329. 矩阵中的最长递增路径', question_url: 'https://leetcode.cn/problems/longest-increasing-path-in-a-matrix/',
    core_idea: '记忆化 DFS：memo[i][j] 存从该格出发的最长递增路径，向四个方向中值更大的邻格递归，结果取 1+最大值。',
    invariant: '严格递增保证递归无环，memo 命中即可直接复用。',
    complexity: { time: 'O(mn)', space: 'O(mn)' },
    code_lang: 'javascript',
    code: `function solve(matrix) {
  const m = matrix.length, n = matrix[0].length;
  const memo = Array.from({ length: m }, () => new Array(n).fill(0));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function dfs(i, j) {
    if (memo[i][j]) return memo[i][j];
    let best = 1;
    for (const [di, dj] of dirs) {
      const x = i + di, y = j + dj;
      if (x >= 0 && y >= 0 && x < m && y < n && matrix[x][y] > matrix[i][j]) {
        best = Math.max(best, 1 + dfs(x, y));
      }
    }
    memo[i][j] = best;
    return best;
  }
  let ans = 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) ans = Math.max(ans, dfs(i, j));
  return ans;
}`,
    edge_cases: [
      { call: '[[9,9,4],[6,6,8],[2,1,1]]', expected: 4, why: '1→2→6→9' },
      { call: '[[3,4,5],[3,2,6],[2,2,1]]', expected: 4, why: '3→4→5→6' },
      { call: '[[1]]', expected: 1, why: '单格' },
    ],
    common_mistakes: ['只判断更大但未记忆化导致指数级', '把等于也当作递增', 'memo 在递归返回后才写入，重复计算'],
    followups: ['拓扑排序解法如何写？', '若允许上下左右走且不要求递增，如何求最长路径？'],
    rubric: [
      { point: '严格大于才递归', weight: 2 },
      { point: 'memo 命中直接返回', weight: 1 },
      { point: '四方向越界检查', weight: 1 },
    ],
  },
  {
    id: 'Q098', title: '8. 字符串转换整数 (atoi)', question_url: 'https://leetcode.cn/problems/string-to-integer-atoi/',
    core_idea: '按规则逐段解析：跳前导空格、读可选符号、读连续数字并在累加时做 32 位边界裁剪，遇到非数字立即停止。',
    invariant: '每一步累加后的值都被夹在 [MIN, MAX] 内，因此不会溢出。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(s) {
  const MAX = 2147483647, MIN = -2147483648;
  let i = 0, sign = 1, num = 0;
  while (i < s.length && s[i] === ' ') i++;
  if (s[i] === '+' || s[i] === '-') { sign = s[i] === '-' ? -1 : 1; i++; }
  while (i < s.length && s[i] >= '0' && s[i] <= '9') {
    num = num * 10 + (s.charCodeAt(i) - 48);
    if (sign === 1 && num > MAX) return MAX;
    if (sign === -1 && -num < MIN) return MIN;
    i++;
  }
  return sign * num;
}`,
    edge_cases: [
      { call: '"42"', expected: 42, why: '纯数字' },
      { call: '"   -42"', expected: -42, why: '前导空格与负号' },
      { call: '"-91283472332"', expected: -2147483648, why: '下溢裁剪到 INT_MIN' },
    ],
    common_mistakes: ['用 parseInt，后者的边界与规则不同', '符号后无数字时返回符号而非 0', '溢出判断放在最后导致精度丢失'],
    followups: ['"words and 987" 应返回什么？', '如何支持 64 位整数？'],
    rubric: [
      { point: '跳过前导空格并只读一个符号', weight: 1 },
      { point: '逐位读数字遇到非数字停止', weight: 1 },
      { point: '累加过程中按 32 位边界裁剪', weight: 2 },
    ],
  },
  {
    id: 'Q099', title: '55. 跳跃游戏', question_url: 'https://leetcode.cn/problems/jump-game/',
    core_idea: '贪心维护最远可达下标 reach：遍历到 i 时若 i>reach 则不可达，否则用 i+nums[i] 更新 reach。',
    invariant: 'reach 始终是从起点出发能到达的最远下标。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  let reach = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > reach) return false;
    reach = Math.max(reach, i + nums[i]);
  }
  return true;
}`,
    edge_cases: [
      { call: '[2,3,1,1,4]', expected: true, why: '可跳到终点' },
      { call: '[3,2,1,0,4]', expected: false, why: '卡在下标 3' },
      { call: '[0]', expected: true, why: '已在终点' },
    ],
    common_mistakes: ['在 i>reach 时仍更新 reach 造成假可达', '只检查前一步能否跳', '把 nums[0]=0 判为 true 但数组长度大于 1'],
    followups: ['最少跳跃次数（45）如何改？', '为什么贪心不需要回溯？'],
    rubric: [
      { point: '以最远可达下标作为状态', weight: 2 },
      { point: 'i>reach 立即失败', weight: 1 },
      { point: '单元素与 0 起点边界正确', weight: 1 },
    ],
  },
  {
    id: 'Q100', title: '135. 分发糖果', question_url: 'https://leetcode.cn/problems/candy/',
    core_idea: '两次贪心：从左到右保证比左邻高者多得，再从右到左保证比右邻高者多得，每个孩子取两次约束的较大值。',
    invariant: '两轮结束后每个位置同时满足左右两侧的相邻约束，因此总和最小。',
    complexity: { time: 'O(n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(ratings) {
  const n = ratings.length;
  const candies = new Array(n).fill(1);
  for (let i = 1; i < n; i++) {
    if (ratings[i] > ratings[i - 1]) candies[i] = candies[i - 1] + 1;
  }
  for (let i = n - 2; i >= 0; i--) {
    if (ratings[i] > ratings[i + 1]) candies[i] = Math.max(candies[i], candies[i + 1] + 1);
  }
  return candies.reduce((a, b) => a + b, 0);
}`,
    edge_cases: [
      { call: '[1,0,2]', expected: 5, why: '1,2,1 共 5 颗' },
      { call: '[1,2,2]', expected: 4, why: '相等不要求更多' },
      { call: '[1]', expected: 1, why: '单孩子' },
    ],
    common_mistakes: ['只从左扫一遍，右侧下降段不足', '相等时也加一导致浪费', '第二轮直接赋值而不是取较大值'],
    followups: ['环形排列（补充题）如何分情况？', '如何用 O(1) 空间完成？'],
    rubric: [
      { point: '左到右处理左邻约束', weight: 2 },
      { point: '右到左处理右邻约束并取 max', weight: 1 },
      { point: '相等时不多给', weight: 1 },
    ],
  },
];
