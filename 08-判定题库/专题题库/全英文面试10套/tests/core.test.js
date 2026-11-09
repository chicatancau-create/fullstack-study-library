import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIMENSIONS,
  applyRedlines,
  buildRecord,
  drawSet,
  segmentAt,
  segmentPlan,
  validateScores,
  weightedScore,
} from '../web/core.mjs';

test('segment plan is 5/25/20/10 and totals 60 minutes', () => {
  const plan = segmentPlan();
  assert.deepEqual(plan.map((s) => s.minutes), [5, 25, 20, 10]);
  assert.equal(plan.at(-1).end, 3600);
  assert.deepEqual(plan.map((s) => s.start), [0, 300, 1800, 3000]);
});

test('segmentAt maps boundaries to the right phase', () => {
  assert.equal(segmentAt(0).id, 'intro');
  assert.equal(segmentAt(299).id, 'intro');
  assert.equal(segmentAt(300).id, 'technical');
  assert.equal(segmentAt(1799).id, 'technical');
  assert.equal(segmentAt(1800).id, 'coding');
  assert.equal(segmentAt(2999).id, 'coding');
  assert.equal(segmentAt(3000).id, 'behavioral');
  assert.equal(segmentAt(9999).id, 'behavioral');
});

test('drawSet is deterministic with an injected rng', () => {
  assert.equal(drawSet(['A', 'B', 'C'], () => 0), 'A');
  assert.equal(drawSet(['A', 'B', 'C'], () => 0.99), 'C');
  assert.throws(() => drawSet([], () => 0), /non-empty/);
});

test('weighted score uses the fourdimension weights', () => {
  const scores = { pronunciation: 5, fluency: 5, technical: 5, structure: 5 };
  assert.equal(weightedScore(scores), 5);
  const mixed = { pronunciation: 3, fluency: 4, technical: 5, structure: 2 };
  assert.equal(weightedScore(mixed), 3.65);
  assert.equal(DIMENSIONS.reduce((s, d) => s + d.weight, 0).toFixed(2), '1.00');
});

test('invalid scores are rejected', () => {
  assert.throws(() => validateScores({ pronunciation: 0, fluency: 3, technical: 3, structure: 3 }), /1-5/);
  assert.throws(() => validateScores({ pronunciation: 3.5, fluency: 3, technical: 3, structure: 3 }), /integer/);
});

test('redlines cap the final score at 2', () => {
  const scores = { pronunciation: 5, fluency: 5, technical: 5, structure: 5 };
  assert.deepEqual(applyRedlines(scores, { codeNotRun: false, noTradeoff: false }), { base: 5, final: 5, capped: false });
  assert.deepEqual(applyRedlines(scores, { codeNotRun: true, noTradeoff: false }), { base: 5, final: 2, capped: true });
});

test('record keeps duration and local-only recording flag', () => {
  const record = buildRecord({
    set: 'SET-01',
    scores: { pronunciation: 3, fluency: 3, technical: 3, structure: 3 },
    redlines: { codeNotRun: false, noTradeoff: false },
    notes: 'quote',
    startedAt: '2026-11-09T00:00:00.000Z',
    endedAt: '2026-11-09T01:00:00.000Z',
    recording: true,
  });
  assert.equal(record.durationSeconds, 3600);
  assert.equal(record.recordingLocalOnly, true);
  assert.equal(record.weighted.final, 3);
});
