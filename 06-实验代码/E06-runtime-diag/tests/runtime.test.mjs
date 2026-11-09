import test from 'node:test';
import assert from 'node:assert/strict';
import { hotFunctions } from '../src/profile.mjs';
import { summarize, retainerPath } from '../src/heap.mjs';
import { chunkedCompute, measureLoop } from '../src/loop.mjs';

test('hotFunctions：按样本时间聚合自耗时并降序', () => {
  const profile = {
    nodes: [
      { id: 1, callFrame: { functionName: 'spin', url: 'file:///spin.mjs', lineNumber: 9 } },
      { id: 2, callFrame: { functionName: 'gc', url: '', lineNumber: -1 } },
    ],
    samples: [1, 1, 1, 2],
    timeDeltas: [1000, 2000, 1500, 500],
  };
  const top = hotFunctions(profile, 2);
  assert.equal(top[0].name, 'spin');
  assert.equal(top[0].selfMs, 4.5);
  assert.equal(top[0].line, 10);
  assert.equal(top[1].name, 'gc');
  assert.equal(top[1].selfMs, 0.5);
});

test('heap：统计节点并按 retainer path 找到目标对象', () => {
  const nodeFields = ['type', 'name', 'id', 'self_size', 'edge_count'];
  const edgeFields = ['type', 'name_or_index', 'to_node'];
  const snapshot = {
    snapshot: {
      meta: {
        node_fields: nodeFields,
        node_types: [['object', 'string', 'synthetic']],
        edge_fields: edgeFields,
        edge_types: [['property', 'internal']],
      },
    },
    nodes: [
      2, 0, 1, 0, 1, // root: 1 edge
      0, 1, 2, 32, 0, // A: object, 32B
    ],
    edges: [0, 0, 1 * nodeFields.length],
    strings: ['root', 'A'],
  };
  const summary = summarize(snapshot);
  assert.equal(summary.nodeCount, 2);
  assert.equal(summary.edgeCount, 1);
  assert.equal(summary.top[0].name, 'A');

  const path = retainerPath(snapshot, (node) => node.name === 'A');
  assert.deepEqual(path, ['root(synthetic,0B)', 'A(object,32B)']);
  assert.equal(retainerPath(snapshot, (node) => node.name === 'missing'), null);
});

test('chunkedCompute：结果确定，且不长时间阻塞事件循环', async () => {
  const quick = await chunkedCompute(60, 10);
  assert.equal(typeof quick, 'number');
  const m = await measureLoop(() => chunkedCompute(150, 10));
  assert.ok(m.maxMs < 80, `分片后的最大延迟应远小于总工作量，实际 ${m.maxMs}ms`);
});
