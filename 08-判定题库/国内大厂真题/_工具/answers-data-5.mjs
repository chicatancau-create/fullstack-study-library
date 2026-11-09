export const ANSWERS5 = [
  {
    id: 'Q049', title: '394. 字符串解码', question_url: 'https://leetcode.cn/problems/decode-string/',
    core_idea: '双栈：数字栈存重复次数、字符串栈存进入括号前的前缀；遇到 "]" 弹栈并按次数重复当前段再拼回前缀。',
    invariant: '扫描到任意位置时，cur 是当前层已解码内容，两个栈保存外层待恢复状态。',
    complexity: { time: 'O(n·k)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(s) {
  const numSt = [], strSt = [];
  let cur = '', num = 0;
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') num = num * 10 + (ch.charCodeAt(0) - 48);
    else if (ch === '[') { numSt.push(num); strSt.push(cur); num = 0; cur = ''; }
    else if (ch === ']') { const k = numSt.pop(); cur = strSt.pop() + cur.repeat(k); }
    else cur += ch;
  }
  return cur;
}`,
    edge_cases: [
      { call: '"3[a]2[bc]"', expected: 'aaabcbc', why: '多段拼接' },
      { call: '"3[a2[c]]"', expected: 'accaccacc', why: '嵌套解码' },
      { call: '"2[abc]3[cd]ef"', expected: 'abcabccdcdcdef', why: '尾部无括号字符保留' },
    ],
    common_mistakes: ['只用一个栈导致前缀丢失', '多位数按单字符解析', '遇到 "]" 后忘记把结果拼回外层前缀'],
    followups: ['如何支持乘数含变量或表达式？', '递归写法如何避免深嵌套爆栈？'],
    rubric: [
      { point: '数字可跨多位且遇 "[" 归零', weight: 1 },
      { point: '双栈保存前缀与次数，嵌套正确恢复', weight: 2 },
      { point: '括号外字符按序拼接', weight: 1 },
    ],
  },
  {
    id: 'Q050', title: '39. 组合总和', question_url: 'https://leetcode.cn/problems/combination-sum/',
    core_idea: '回溯：每层从 start 开始选，允许重复选同一元素（下一层仍传 i），剩余目标为 0 时收集，超过时剪枝。',
    invariant: 'path 中元素非降序，因此同一组合只会以一种顺序出现；start 保证不回头选更小下标。',
    complexity: { time: 'O(n^(T/m))', space: 'O(T/m)' },
    code_lang: 'javascript',
    code: `function solve(candidates, target) {
  const out = [];
  function dfs(start, remain, path) {
    if (remain === 0) { out.push(path.slice()); return; }
    for (let i = start; i < candidates.length; i++) {
      if (candidates[i] > remain) continue;
      path.push(candidates[i]);
      dfs(i, remain - candidates[i], path);
      path.pop();
    }
  }
  dfs(0, target, []);
  return out;
}`,
    edge_cases: [
      { call: '[2,3,6,7], 7', expected: [[2,2,3],[7]], why: '标准示例' },
      { call: '[2,3,5], 8', expected: [[2,2,2,2],[2,3,3],[3,5]], why: '多次复用同一元素' },
      { call: '[2], 1', expected: [], why: '最小元素已超过目标' },
    ],
    common_mistakes: ['下一层传 i+1，退化成不可重复选择', '把重复组合用 set 去重而不是用 start 控制顺序', 'remain<0 才停止，缺少提前剪枝'],
    followups: ['若候选含重复元素（40 题）如何去重？', '如果每个数只能用一次，改动哪一行？'],
    rubric: [
      { point: '下一层仍从 i 开始，允许重复使用', weight: 2 },
      { point: 'start 保证组合不重复且有序', weight: 1 },
      { point: 'remain 为 0 才收集，超出剪枝', weight: 1 },
    ],
  },
  {
    id: 'Q051', title: '662. 二叉树最大宽度', question_url: 'https://leetcode.cn/problems/maximum-width-of-binary-tree/',
    core_idea: '层序遍历时为每个节点维护完全二叉树下标：左孩子 2i、右孩子 2i+1；每层宽度 = 末节点下标 - 首节点下标 + 1。',
    invariant: '同层节点下标单调递增，空节点占位但不下沉队列，因此宽度包含中间空洞。',
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
  if (!root) return 0;
  let q = [[root, 0]], best = 0;
  while (q.length) {
    const len = q.length;
    const first = q[0][1], last = q[len - 1][1];
    best = Math.max(best, last - first + 1);
    const next = [];
    for (const [n, idx] of q) {
      if (n.left) next.push([n.left, 2 * idx]);
      if (n.right) next.push([n.right, 2 * idx + 1]);
    }
    q = next;
  }
  return best;
}`,
    edge_cases: [
      { call: '[1,3,2,5,3,null,9]', expected: 4, why: '第三层下标跨空洞' },
      { call: '[1,3,2,5]', expected: 2, why: '只有左侧更深时宽度为 2' },
      { call: '[1]', expected: 1, why: '单节点' },
    ],
    common_mistakes: ['用每层节点个数当宽度，忽略空洞', '下标从 1 开始但孩子算成 2i+1/2i+2', '把 null 孩子也压入队列导致无限展开'],
    followups: ['下标在极端链状树下会溢出 32 位，如何处理？', '如何同时返回最宽层号？'],
    rubric: [
      { point: '孩子下标为 2i 与 2i+1', weight: 2 },
      { point: '宽度用末下标减首下标而不是节点数', weight: 1 },
      { point: '空孩子不下沉队列', weight: 1 },
    ],
  },
  {
    id: 'Q052', title: '76. 最小覆盖子串', question_url: 'https://leetcode.cn/problems/minimum-window-substring/',
    core_idea: '滑动窗口：右指针扩张直到覆盖 t 的全部字符计数，再收缩左指针并记录最短窗口，直到不再覆盖。',
    invariant: 'formed 等于 need 中已满足计数的字符种类数；formed===required 时窗口合法。',
    complexity: { time: 'O(m+n)', space: 'O(k)' },
    code_lang: 'javascript',
    code: `function solve(s, t) {
  if (!t.length) return '';
  const need = new Map();
  for (const c of t) need.set(c, (need.get(c) || 0) + 1);
  const required = need.size;
  let formed = 0, l = 0;
  const window = new Map();
  let best = [Infinity, 0, 0];
  for (let r = 0; r < s.length; r++) {
    const c = s[r];
    window.set(c, (window.get(c) || 0) + 1);
    if (need.has(c) && window.get(c) === need.get(c)) formed++;
    while (formed === required) {
      if (r - l + 1 < best[0]) best = [r - l + 1, l, r];
      const d = s[l];
      window.set(d, window.get(d) - 1);
      if (need.has(d) && window.get(d) < need.get(d)) formed--;
      l++;
    }
  }
  return best[0] === Infinity ? '' : s.slice(best[1], best[2] + 1);
}`,
    edge_cases: [
      { call: '"ADOBECODEBANC", "ABC"', expected: 'BANC', why: '标准示例' },
      { call: '"a", "a"', expected: 'a', why: '单字符覆盖' },
      { call: '"a", "aa"', expected: '', why: '字符数量不足' },
    ],
    common_mistakes: ['用字符种类是否出现判断覆盖，忽略重复次数', '收缩时先移动左指针再更新计数', '相等时继续收缩导致丢失更短窗口'],
    followups: ['若要求返回所有最短覆盖子串？', '字符集很大时 Map 与数组计数如何取舍？'],
    rubric: [
      { point: '按字符计数而非仅出现判断', weight: 2 },
      { point: 'formed 在计数恰好满足时递增、低于需求时递减', weight: 1 },
      { point: '无解返回空串', weight: 1 },
    ],
  },
  {
    id: 'Q053', title: '232. 用栈实现队列', question_url: 'https://leetcode.cn/problems/implement-queue-using-stacks/',
    core_idea: '两个栈：输入栈只接收 push，输出栈只在为空时把输入栈整体倒入；pop/peek 都走输出栈。',
    invariant: '输出栈非空时，其栈顶就是队首；倒入只在输出栈为空时发生，保证顺序不倒错。',
    complexity: { time: '摊还 O(1)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(ops, args) {
  const inS = [], outS = [];
  const move = () => { if (!outS.length) while (inS.length) outS.push(inS.pop()); };
  const out = [];
  for (let i = 0; i < ops.length; i++) {
    const a = args[i] || [];
    if (ops[i] === 'MyQueue') out.push(null);
    else if (ops[i] === 'push') { inS.push(a[0]); out.push(null); }
    else if (ops[i] === 'pop') { move(); out.push(outS.pop()); }
    else if (ops[i] === 'peek') { move(); out.push(outS[outS.length - 1]); }
    else if (ops[i] === 'empty') out.push(inS.length === 0 && outS.length === 0);
  }
  return out;
}`,
    edge_cases: [
      { call: '["MyQueue","push","push","peek","pop","empty"], [[],[1],[2],[],[],[]]', expected: [null,null,null,1,1,false], why: '先进先出' },
      { call: '["MyQueue","push","pop","empty"], [[],[1],[],[]]', expected: [null,null,1,true], why: '单元素弹出后为空' },
    ],
    common_mistakes: ['每次 pop 都把输入栈倒一遍，导致顺序反转', 'peek 也直接弹栈', 'empty 只看一个栈'],
    followups: ['为什么摊还复杂度是 O(1)？', '如何用两个队列模拟栈？'],
    rubric: [
      { point: '倾倒只在输出栈为空时进行', weight: 2 },
      { point: 'pop 与 peek 都从输出栈顶取', weight: 1 },
      { point: 'empty 同时检查两个栈', weight: 1 },
    ],
  },
  {
    id: 'Q054', title: '19. 删除链表的倒数第N个节点', question_url: 'https://leetcode.cn/problems/remove-nth-node-from-end-of-list/',
    core_idea: '哑节点 + 快慢指针：快指针先走 n 步，再与慢指针同步前进，快指针到尾时慢指针正好在待删节点前驱。',
    invariant: '快慢指针间距恒为 n，因此慢指针最终停在倒数第 n+1 个节点。',
    complexity: { time: 'O(L)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(arr, n) {
  const d = { val: 0, next: null };
  let tail = d;
  for (const v of arr) { tail.next = { val: v, next: null }; tail = tail.next; }
  let fast = d, slow = d;
  for (let i = 0; i < n; i++) fast = fast.next;
  while (fast.next) { fast = fast.next; slow = slow.next; }
  slow.next = slow.next.next;
  const out = [];
  for (let p = d.next; p; p = p.next) out.push(p.val);
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3,4,5], 2', expected: [1,2,3,5], why: '删除中间节点' },
      { call: '[1], 1', expected: [], why: '删除唯一节点需要哑节点' },
      { call: '[1,2], 1', expected: [1], why: '删除尾节点' },
    ],
    common_mistakes: ['没有哑节点导致删头节点时丢链', '快指针先走 n-1 步导致慢指针停在待删节点', '删除后忘记接回后继'],
    followups: ['如何用一次遍历完成？', '若 n 可能大于链表长度如何防护？'],
    rubric: [
      { point: '快指针先走 n 步再同步移动', weight: 2 },
      { point: '哑节点统一处理删头', weight: 1 },
      { point: '前驱指向后继完成删除', weight: 1 },
    ],
  },
  {
    id: 'Q055', title: '209. 长度最小的子数组', question_url: 'https://leetcode.cn/problems/minimum-size-subarray-sum/',
    core_idea: '正整数数组上的滑动窗口：右指针累加，窗口和 ≥target 时不断收缩左指针并更新最小长度。',
    invariant: '窗口 [l,r] 内元素和由 sum 精确维护；收缩过程中只会移除正数，因此 sum 单调不增。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums, target) {
  let l = 0, sum = 0, best = Infinity;
  for (let r = 0; r < nums.length; r++) {
    sum += nums[r];
    while (sum >= target) {
      best = Math.min(best, r - l + 1);
      sum -= nums[l];
      l++;
    }
  }
  return best === Infinity ? 0 : best;
}`,
    edge_cases: [
      { call: '[2,3,1,2,4,3], 7', expected: 2, why: '最短为 4+3' },
      { call: '[1,4,4], 4', expected: 1, why: '单个元素达标' },
      { call: '[1,1,1,1], 11', expected: 0, why: '总和不足' },
    ],
    common_mistakes: ['对含负数数组使用滑动窗口', '先移左指针再判断窗口和', '无解返回 -1 而不是 0'],
    followups: ['元素含负数时该怎么做？', '为什么窗口右移总复杂度仍是 O(n)？'],
    rubric: [
      { point: '窗口和随右指针增加、随左指针减少', weight: 1 },
      { point: '满足条件时循环收缩并记录最短', weight: 2 },
      { point: '无解返回 0', weight: 1 },
    ],
  },
  {
    id: 'Q056', title: '剑指 Offer 26. 树的子结构', question_url: 'https://leetcode.cn/problems/shu-de-zi-jie-gou-lcof/',
    core_idea: '双重递归：外层遍历 A 的每个节点作为候选根，内层检查 A 的该子树是否与 B 完全匹配（B 可为 A 的一部分）。',
    invariant: 'match(a,b) 为真要求 a 存在、值相等且左右子树继续匹配；B 为空即匹配成功。',
    complexity: { time: 'O(mn)', space: 'O(h)' },
    code_lang: 'javascript',
    code: `function solve(A, B) {
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
  function match(a, b) {
    if (!b) return true;
    if (!a) return false;
    if (a.val !== b.val) return false;
    return match(a.left, b.left) && match(a.right, b.right);
  }
  function dfs(a, b) {
    if (!a) return false;
    return match(a, b) || dfs(a.left, b) || dfs(a.right, b);
  }
  return dfs(build(A), build(B));
}`,
    edge_cases: [
      { call: '[3,4,5,1,2], [4,1]', expected: true, why: 'B 是 A 左子树的头部' },
      { call: '[3,4,5,1,2], [4,2]', expected: false, why: 'B 的 2 应挂在左孩子位置' },
      { call: '[1], [1]', expected: true, why: '单节点相同' },
    ],
    common_mistakes: ['用“子树完全相同”判断，导致 B 是局部结构时误判', 'B 为空时返回 false', '外层遍历与内层匹配混用同一个 null 判断'],
    followups: ['与“判断 B 是否为 A 的子树”区别在哪？', '如何在 O(m+n) 内借助序列化做匹配？'],
    rubric: [
      { point: 'match 中 B 先判空返回 true', weight: 2 },
      { point: '外层对 A 每个节点尝试匹配', weight: 1 },
      { point: '结构不匹配立即返回 false', weight: 1 },
    ],
  },
  {
    id: 'Q057', title: '82. 删除排序链表中的重复元素 II', question_url: 'https://leetcode.cn/problems/remove-duplicates-from-sorted-list-ii/',
    core_idea: '哑节点 + 按连续相同值分段：一段长度大于 1 整段丢弃，否则接到结果尾部；只保留出现一次的值。',
    invariant: 'tail 之后是新链表；扫描下标始终指向尚未处理段的起点。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(arr) {
  const d = { next: null };
  let tail = d, i = 0;
  while (i < arr.length) {
    let j = i;
    while (j < arr.length && arr[j] === arr[i]) j++;
    if (j - i === 1) { tail.next = { val: arr[i], next: null }; tail = tail.next; }
    i = j;
  }
  const out = [];
  for (let p = d.next; p; p = p.next) out.push(p.val);
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3,3,4,4,5]', expected: [1,2,5], why: '3 与 4 成对删除' },
      { call: '[1,1,1,2,3]', expected: [2,3], why: '连续三个重复全删' },
      { call: '[1]', expected: [1], why: '单节点保留' },
    ],
    common_mistakes: ['只删相邻重复中的一个（那是 83 题）', '删完重复后忘记接回 tail', '用哈希计数破坏 O(1) 空间'],
    followups: ['83 题只去重一个元素，代码差在哪？', '无序链表怎么做？'],
    rubric: [
      { point: '按相同值分段统计长度', weight: 2 },
      { point: '长度大于 1 整段丢弃', weight: 1 },
      { point: '哑节点 + tail 接链不丢头', weight: 1 },
    ],
  },
  {
    id: 'Q058', title: '43. 字符串相乘', question_url: 'https://leetcode.cn/problems/multiply-strings/',
    core_idea: '竖式乘法：长度为 m、n 的两数乘积最多 m+n 位，逐位相乘累加到结果数组，再统一处理进位并去前导零。',
    invariant: 'res[i+j+1] 先存部分积的低位，进位加到 res[i+j]，处理完后 res 即十进制结果。',
    complexity: { time: 'O(mn)', space: 'O(m+n)' },
    code_lang: 'javascript',
    code: `function solve(a, b) {
  if (a === '0' || b === '0') return '0';
  const m = a.length, n = b.length;
  const res = new Array(m + n).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      const mul = (a.charCodeAt(i) - 48) * (b.charCodeAt(j) - 48);
      const p1 = i + j, p2 = i + j + 1;
      const sum = mul + res[p2];
      res[p2] = sum % 10;
      res[p1] += Math.floor(sum / 10);
    }
  }
  let k = 0;
  while (k < res.length && res[k] === 0) k++;
  return res.slice(k).join('');
}`,
    edge_cases: [
      { call: '"2", "3"', expected: '6', why: '单位数' },
      { call: '"123", "456"', expected: '56088', why: '标准竖式' },
      { call: '"0", "0"', expected: '0', why: '零结果不能返回空串' },
    ],
    common_mistakes: ['用 Number 相乘，超过 2^53 精度丢失', '结果数组长度取 m+n-1 导致最高位无处进位', '忘记去掉前导零'],
    followups: ['如何支持负数与小数？', 'Karatsuba 如何把复杂度降到约 O(n^1.585)？'],
    rubric: [
      { point: '结果数组长度为 m+n 并按下标累加', weight: 2 },
      { point: '进位并入高位而非只取模', weight: 1 },
      { point: '零结果与去前导零正确', weight: 1 },
    ],
  },
  {
    id: 'Q059', title: '142. 环形链表 II', question_url: 'https://leetcode.cn/problems/linked-list-cycle-ii/',
    core_idea: 'Floyd 判圈：快慢指针相遇后，一个指针回到头，两指针同速前进，再次相遇处即入环点。',
    invariant: '设头到环入口为 a、入口到相遇点为 b、环长 c，则相遇时 2(a+b)=a+b+kc，故 a=(k-1)c+(c-b)。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(arr, pos) {
  if (!arr.length) return -1;
  const nodes = arr.map((v) => ({ val: v, next: null }));
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].next = nodes[i + 1];
  if (pos >= 0) nodes[nodes.length - 1].next = nodes[pos];
  let slow = nodes[0], fast = nodes[0];
  while (fast && fast.next) {
    slow = slow.next;
    fast = fast.next.next;
    if (slow === fast) {
      let p = nodes[0];
      while (p !== slow) { p = p.next; slow = slow.next; }
      return nodes.indexOf(p);
    }
  }
  return -1;
}`,
    edge_cases: [
      { call: '[3,2,0,-4], 1', expected: 1, why: '环入口在第二个节点' },
      { call: '[1,2], 0', expected: 0, why: '入口是头节点' },
      { call: '[1], -1', expected: -1, why: '无环' },
    ],
    common_mistakes: ['相遇后直接返回相遇点而不是入环点', '快指针步进前不检查 fast.next', '用哈希集合冒充 O(1) 空间'],
    followups: ['如何求环长？', '为什么第二次相遇一定在入口？'],
    rubric: [
      { point: '快慢指针先判是否有环', weight: 1 },
      { point: '相遇后一指针回头同速再相遇', weight: 2 },
      { point: '无环返回 -1 且不越界', weight: 1 },
    ],
  },
  {
    id: 'Q060', title: '162. 寻找峰值', question_url: 'https://leetcode.cn/problems/find-peak-element/',
    core_idea: '二分：比较 nums[mid] 与 nums[mid+1]，上升则峰值在右半，下降则峰值在左半（含 mid）。',
    invariant: '区间 [lo,hi] 内必存在至少一个峰值，因为两端视为负无穷。',
    complexity: { time: 'O(log n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (nums[mid] < nums[mid + 1]) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}`,
    edge_cases: [
      { call: '[1,2,3,1]', expected: 2, why: '峰值下标 2' },
      { call: '[1,2,1,3,5,6,4]', expected: 5, why: '任一峰值均可，本实现返回 5' },
      { call: '[1]', expected: 0, why: '单元素' },
    ],
    common_mistakes: ['线性扫描虽然正确但不符合 O(log n)', 'hi=mid-1 时丢掉可能的峰值', '返回峰值而不是下标'],
    followups: ['为什么题目保证一定有解？', '二维矩阵版本（1901）如何二分？'],
    rubric: [
      { point: '比较 mid 与 mid+1 决定半区', weight: 2 },
      { point: '下降时 hi=mid 保留候选', weight: 1 },
      { point: '返回下标且单元素正确', weight: 1 },
    ],
  },
  {
    id: 'Q061', title: '78. 子集', question_url: 'https://leetcode.cn/problems/subsets/',
    core_idea: '回溯：每个位置决定选或不选，路径在进入下一层前先收集，从而得到包含空集在内的全部子集。',
    invariant: 'path 是 [0,start) 的一个子集，out 收集的是所有已确定前缀的完整解，不重不漏。',
    complexity: { time: 'O(n·2^n)', space: 'O(n)' },
    code_lang: 'javascript',
    code: `function solve(nums) {
  const out = [];
  function dfs(start, path) {
    out.push(path.slice());
    for (let i = start; i < nums.length; i++) {
      path.push(nums[i]);
      dfs(i + 1, path);
      path.pop();
    }
  }
  dfs(0, []);
  return out;
}`,
    edge_cases: [
      { call: '[1,2,3]', expected: [[],[1],[1,2],[1,2,3],[1,3],[2],[2,3],[3]], why: '字典序回溯顺序' },
      { call: '[0]', expected: [[],[0]], why: '单元素含空集' },
    ],
    common_mistakes: ['忘记先收集当前路径，漏掉空集', '下一层传 i 导致重复组合', '最后才收集导致丢前缀'],
    followups: ['含重复元素（90 题）如何剪枝？', '如何用位掩码迭代生成？'],
    rubric: [
      { point: '进入递归即收集当前 path', weight: 2 },
      { point: '下一层从 i+1 开始，避免重复', weight: 1 },
      { point: '回到上层时回溯弹出', weight: 1 },
    ],
  },
  {
    id: 'Q062', title: '2. 两数相加', question_url: 'https://leetcode.cn/problems/add-two-numbers/',
    core_idea: '逐位相加：两链表已按低位在前存储，同步遍历并维护进位，任一方或进位未尽就继续，头插/尾插生成结果。',
    invariant: '每一轮处理的都是同一位权；carry 只可能是 0 或 1。',
    complexity: { time: 'O(max(m,n))', space: 'O(max(m,n))' },
    code_lang: 'javascript',
    code: `function solve(a, b) {
  const out = [];
  let i = 0, j = 0, carry = 0;
  while (i < a.length || j < b.length || carry) {
    const x = i < a.length ? a[i++] : 0;
    const y = j < b.length ? b[j++] : 0;
    const sum = x + y + carry;
    out.push(sum % 10);
    carry = Math.floor(sum / 10);
  }
  return out;
}`,
    edge_cases: [
      { call: '[2,4,3], [5,6,4]', expected: [7,0,8], why: '342+465=807' },
      { call: '[0], [0]', expected: [0], why: '零加零' },
      { call: '[9,9,9,9,9,9,9], [9,9,9,9]', expected: [8,9,9,9,0,0,0,1], why: '最长进位链' },
    ],
    common_mistakes: ['长度不等时提前结束，漏掉剩余位', '最高位进位未追加', '把结果当成高位在前存储'],
    followups: ['若链表是高位在前（445 题）如何先逆序？', '如何在不新建链表时原地复用节点？'],
    rubric: [
      { point: '循环条件包含任一方剩余或进位', weight: 2 },
      { point: '短链表缺位补 0', weight: 1 },
      { point: '最高位进位输出为新节点', weight: 1 },
    ],
  },
  {
    id: 'Q063', title: '122. 买卖股票的最佳时机 II', question_url: 'https://leetcode.cn/problems/best-time-to-buy-and-sell-stock-ii/',
    core_idea: '贪心：只要次日价格高于当日就当日买次日卖，累加所有正收益，等价于抓住每一段上升区间。',
    invariant: '任意多段上涨的总收益等于逐日正收益之和，交易次数不限因此贪心最优。',
    complexity: { time: 'O(n)', space: 'O(1)' },
    code_lang: 'javascript',
    code: `function solve(prices) {
  let profit = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) profit += prices[i] - prices[i - 1];
  }
  return profit;
}`,
    edge_cases: [
      { call: '[7,1,5,3,6,4]', expected: 7, why: '1→5 与 3→6 两段' },
      { call: '[1,2,3,4,5]', expected: 4, why: '连续上涨等价于一次持有' },
      { call: '[7,6,4,3,1]', expected: 0, why: '单边下跌不交易' },
    ],
    common_mistakes: ['沿用 121 题的“只能交易一次”模型', '在下跌日卖出造成亏损', '用 DP 但状态转移写错'],
    followups: ['含手续费（714）如何改 DP？', '限制最多 k 次交易（188）怎么建模？'],
    rubric: [
      { point: '累加所有相邻正差价', weight: 2 },
      { point: '单边下跌返回 0', weight: 1 },
      { point: '理解贪心与不限次数交易的等价性', weight: 1 },
    ],
  },
  {
    id: 'Q064', title: '695. 岛屿的最大面积', question_url: 'https://leetcode.cn/problems/max-area-of-island/',
    core_idea: 'DFS 洪水填充：遍历每个未访问的 1，向四邻扩散并计数，取所有连通块面积最大值；访问后置 0 或标记。',
    invariant: '每次 dfs 只访问同一连通块，返回该块面积；已访问格不会再次贡献计数。',
    complexity: { time: 'O(mn)', space: 'O(mn)' },
    code_lang: 'javascript',
    code: `function solve(grid) {
  const m = grid.length;
  if (!m) return 0;
  const n = grid[0].length;
  let best = 0;
  function dfs(i, j) {
    if (i < 0 || j < 0 || i >= m || j >= n || grid[i][j] !== 1) return 0;
    grid[i][j] = 0;
    return 1 + dfs(i + 1, j) + dfs(i - 1, j) + dfs(i, j + 1) + dfs(i, j - 1);
  }
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (grid[i][j] === 1) best = Math.max(best, dfs(i, j));
    }
  }
  return best;
}`,
    edge_cases: [
      { call: '[[1,1,0],[1,0,0],[0,0,1]]', expected: 3, why: '一个 3 格岛加一个 1 格岛' },
      { call: '[[0,0],[0,0]]', expected: 0, why: '无岛屿' },
      { call: '[[1]]', expected: 1, why: '单格岛屿' },
    ],
    common_mistakes: ['访问后不标记导致重复计数与爆栈', '只向两个方向扩散', '在越界检查前访问数组'],
    followups: ['如何避免递归爆栈（迭代栈/BFS）？', '求岛屿数量（200）与本题的差别？'],
    rubric: [
      { point: '四邻扩散且访问即标记', weight: 2 },
      { point: '越界与水域返回 0', weight: 1 },
      { point: '取所有连通块最大值，无岛屿返回 0', weight: 1 },
    ],
  },
];
