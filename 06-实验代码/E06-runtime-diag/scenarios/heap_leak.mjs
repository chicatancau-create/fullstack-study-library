// 长期闭包泄漏：每轮把「捕获大数组的闭包」和命名类实例一起放进模块级数组，永不释放。
// 用 --expose-gc 做多轮堆趋势，并在泄漏后/清理后各写一份 heap snapshot，
// 再用 src/heap.mjs 找出 LeakBuffer 的 retainer path。
import fs from 'node:fs';
import v8 from 'node:v8';
import assert from 'node:assert/strict';
import { loadSnapshot, summarize, retainerPath } from '../src/heap.mjs';

const OUT = 'evidence/heap';
fs.mkdirSync(OUT, { recursive: true });
const store = [];

class LeakBuffer {
  constructor(round, payload) {
    this.round = round;
    this.payload = payload;
  }
}

const heapMB = () => {
  global.gc();
  return Number((process.memoryUsage().heapUsed / 1048576).toFixed(2));
};

function leakRound(round, count) {
  for (let i = 0; i < count; i += 1) {
    const payload = new Array(2048).fill((round * 31 + i) % 97);
    store.push(() => payload[0]);              // 闭包捕获 payload
    store.push(new LeakBuffer(round, payload)); // 命名类，便于 retainer path 定位
  }
}

const trend = [];
const base = heapMB();
trend.push({ stage: 'base', mb: base });
for (let round = 1; round <= 4; round += 1) {
  leakRound(round, 120);
  trend.push({ stage: `round-${round}`, mb: heapMB() });
}

const leakedFile = `${OUT}/leaked.heapsnapshot`;
v8.writeHeapSnapshot(leakedFile);

store.length = 0;
const fixedMB = heapMB();
const fixedFile = `${OUT}/fixed.heapsnapshot`;
v8.writeHeapSnapshot(fixedFile);

// 只看对象实例；类构造函数（closure）在两个快照里都会存在，不能当作泄漏。
const isLeakInstance = (node) => node.name === 'LeakBuffer' && node.type === 'object';

// 先测完堆趋势，再解析快照，避免 JSON 解析自身的内存干扰测量。
const leaked = summarize(loadSnapshot(leakedFile));
const leakedPath = retainerPath(loadSnapshot(leakedFile), isLeakInstance);
const fixed = summarize(loadSnapshot(fixedFile));
const fixedPath = retainerPath(loadSnapshot(fixedFile), isLeakInstance);

const lines = [
  '闭包泄漏与修复对照（--expose-gc，120 条/轮，每条约 16KB 堆数据）',
  ...trend.map((t) => `${t.stage}: heapUsed=${t.mb}MB`),
  `清理后: heapUsed=${fixedMB}MB`,
  '',
  `leaked snapshot: nodes=${leaked.nodeCount} edges=${leaked.edgeCount} strings=${leaked.stringCount}`,
  `fixed  snapshot: nodes=${fixed.nodeCount} edges=${fixed.edgeCount} strings=${fixed.stringCount}`,
  `leaked 中 LeakBuffer 顶层聚合: ${leaked.top.filter((x) => x.name === 'LeakBuffer').map((x) => `count=${x.count} self=${x.selfSize}B`).join(', ') || '(未进入前 12)'}`,
  `retainer path(leaked): ${leakedPath ? leakedPath.join(' -> ') : '(not found)'}`,
  `retainer path(fixed): ${fixedPath ? fixedPath.join(' -> ') : '(not found，符合清理预期)'}`,
];
console.log(lines.join('\n'));

assert.ok(trend.at(-1).mb - base > 4, `4 轮后堆应增长 >4MB，实际 ${base} -> ${trend.at(-1).mb}`);
assert.ok(trend.at(-1).mb > fixedMB + 4, `清理后应回落 >4MB，实际 ${trend.at(-1).mb} -> ${fixedMB}`);
assert.ok(leakedPath && leakedPath.some((p) => p.startsWith('LeakBuffer(')), '泄漏快照中应能找到 LeakBuffer 的 retainer path');
assert.equal(fixedPath, null, '清理后的快照不应再有 LeakBuffer 可达路径');
