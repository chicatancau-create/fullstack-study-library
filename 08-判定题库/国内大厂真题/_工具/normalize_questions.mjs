import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(here, '..');
const COMPANIES = ['字节跳动', '腾讯', '阿里巴巴', '美团', '滴滴', '华为'];

const summary = { generated_at: new Date().toISOString(), companies: {}, totals: { questions: 0, primary_evidence: 0, third_party: 0, role_unlabeled: 0 } };
const matrix = [['company', 'role_class', 'count']];

for (const company of COMPANIES) {
  const file = path.join(BANK, company, '题目索引.json');
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  let primary = 0;
  for (const q of list) {
    q.question_url = q.leetcode;
    q.aggregate_source_url = q.url;
    q.primary_evidence = Array.isArray(q.primary_evidence) ? q.primary_evidence : [];
    q.evidence_status = q.primary_evidence.length ? 'primary_verified' : 'third_party_aggregate';
    q.evidence_note = q.primary_evidence.length ? '' : '第三方聚合，待逐题核源';
    q.role_recorded = q.role;
    q.role_class = '岗位未标注';
    q.role_source = 'codetop_aggregate';
    if (q.primary_evidence.length) primary++;
  }
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
  const third = list.length - primary;
  summary.companies[company] = { questions: list.length, primary_evidence: primary, third_party: third };
  summary.totals.questions += list.length;
  summary.totals.primary_evidence += primary;
  summary.totals.third_party += third;
  summary.totals.role_unlabeled += list.length;
  matrix.push([company, '岗位未标注', String(list.length)]);
}

fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(here, 'evidence', 'evidence-index.json'), JSON.stringify(summary, null, 2) + '\n');
fs.writeFileSync(path.join(here, '岗位矩阵.csv'), matrix.map((r) => r.join(',')).join('\n') + '\n');
console.log(`NORMALIZED ${summary.totals.questions} questions; primary=${summary.totals.primary_evidence} third_party=${summary.totals.third_party} role_unlabeled=${summary.totals.role_unlabeled}`);
