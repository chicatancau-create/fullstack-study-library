import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(here, '..');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const ledger = read(path.join(BANK, '字节跳动', '408去重', 'summary.json'));
const lc = ledger.five_counts;
const answers = read(path.join(here, 'evidence', 'answers-index.json'));
const frontend = read(path.join(here, 'evidence', 'frontend-check.json'));
const matrix = read(path.join(here, 'evidence', 'role-matrix.json'));
const links = read(path.join(here, 'evidence', 'evidence-link.json'));
const attempts = read(path.join(here, 'evidence', 'evidence-collection-log.json'));

const frontendOk = frontend.results.every((r) => r.ok);
const items = [
  { item: '408 去重账本', ok: Boolean(lc && lc.raw_records > 0 && lc.unique_canonical > 0), detail: `raw=${lc.raw_records} valid=${lc.valid_records} local_hit=${lc.local_hit_rows} unique=${lc.unique_canonical} evidence=${lc.evidence_backed_questions}` },
  { item: '字节 100 题答案', ok: answers.published === 100 && answers.pending === 0, detail: `published=${answers.published} pending=${answers.pending}` },
  { item: '前端/全栈补充题', ok: frontend.counts.items >= 16 && frontendOk, detail: `items=${frontend.counts.items} gate=${frontendOk ? '5/5' : 'fail'}` },
  { item: '公司×岗位×题型矩阵', ok: matrix.rows > 0 && matrix.totals.questions >= 266, detail: `rows=${matrix.rows} questions=${matrix.totals.questions}` },
  { item: '逐题原始面经', ok: links.totals.linked_questions === links.totals.questions, detail: `linked=${links.totals.linked_questions}/${links.totals.questions}` },
];

fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
const report = {
  generated_at: new Date().toISOString(),
  items,
  evidence: {
    records: links.totals.evidence,
    linked_questions: links.totals.linked_questions,
    attempts: attempts.attempts.length,
    success: attempts.attempts.filter((a) => a.result.startsWith('success')).length,
    blocked: attempts.attempts.filter((a) => a.result !== 'success' && !a.result.startsWith('success')).length,
  },
  complete: items.every((i) => i.ok),
  gaps: items.filter((i) => !i.ok).map((i) => `${i.item}（${i.detail}）`),
};
fs.writeFileSync(path.join(here, 'evidence', 'ms10-status.json'), JSON.stringify(report, null, 2) + '\n');

for (const i of items) console.log(`${i.ok ? 'OK  ' : 'GAP '} ${i.item} (${i.detail})`);
console.log(`MS10-STATUS complete=${report.complete} gaps=${report.gaps.length}`);
if (report.gaps.length) console.log(report.gaps.map((g) => `  - ${g}`).join('\n'));
