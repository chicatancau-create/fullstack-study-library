import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(here, '..');
const file = path.join(BANK, '前端全栈', 'questions.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const items = data.items;
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

const ids = new Set(items.map((q) => q.id));
check('F01 题目数量与 ID 唯一', items.length >= 16 && ids.size === items.length, `items=${items.length} unique=${ids.size}`);

const bad = [];
for (const q of items) {
  const missing = ['id', 'company', 'role', 'type', 'title', 'question', 'answer', 'rubric', 'followups', 'source_url', 'evidence_status']
    .filter((k) => q[k] === undefined || q[k] === null || q[k] === '');
  if (missing.length) bad.push(`${q.id}:missing=${missing.join('/')}`);
  if (!['前端', '全栈'].includes(q.role)) bad.push(`${q.id}:role=${q.role}`);
  if (!Array.isArray(q.answer) || q.answer.length < 5) bad.push(`${q.id}:answer<5`);
  if (!Array.isArray(q.rubric) || q.rubric.length < 3) bad.push(`${q.id}:rubric<3`);
  if (!Array.isArray(q.followups) || q.followups.length < 2) bad.push(`${q.id}:followups<2`);
  if (!/^https:\/\//.test(q.source_url || '')) bad.push(`${q.id}:source_url`);
}
check('F02 字段完整（≥5 答案点、≥3 评分点、≥2 追问、https 来源）', bad.length === 0, bad.join('; ') || 'ok');

const points = new Map();
const dup = [];
for (const q of items) for (const r of q.rubric) {
  const key = r.point.trim();
  if (points.has(key)) dup.push(`${q.id}~${points.get(key)}:${key}`);
  else points.set(key, q.id);
}
check('F03 评分点逐题不同（无统一模板）', dup.length === 0, dup.join('; ') || `points=${points.size}`);

const types = new Set(items.map((q) => q.type));
check('F04 覆盖前端/全栈主题 ≥12 类', types.size >= 12, [...types].join(','));

const simulated = items.filter((q) => /模拟题/.test(q.evidence_status));
check('F05 无原始面经的题目标记为模拟题', simulated.length === items.length, `simulated=${simulated.length}/${items.length}`);

fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(here, 'evidence', 'frontend-check.json'), JSON.stringify({ generated_at: new Date().toISOString(), counts: { items: items.length, types: types.size }, results }, null, 2) + '\n');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}`);
const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `FRONTEND-CHECK PASS ${results.length}/${results.length}` : `FRONTEND-CHECK FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
