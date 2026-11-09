import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(here, '..');
const companies = ['字节跳动', '腾讯', '阿里巴巴', '美团', '滴滴', '华为'];
const rows = [];
let rawEvidence = 0;

for (const company of companies) {
  const file = path.join(BANK, company, '题目索引.json');
  if (!fs.existsSync(file)) continue;
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byRole = new Map();
  for (const q of list) {
    rawEvidence += Array.isArray(q.primary_evidence) ? q.primary_evidence.length : 0;
    const role = q.role_class || '岗位未标注';
    byRole.set(role, (byRole.get(role) || 0) + 1);
  }
  for (const [role, count] of byRole) rows.push({ company, role, type: '算法', count });
}

const feFile = path.join(BANK, '前端全栈', 'questions.json');
const fe = JSON.parse(fs.readFileSync(feFile, 'utf8')).items;
for (const q of fe) rows.push({ company: q.company, role: q.role, type: q.type, count: 1 });

const merged = new Map();
for (const r of rows) {
  const key = `${r.company}\u0000${r.role}\u0000${r.type}`;
  merged.set(key, (merged.get(key) || 0) + r.count);
}
const finalRows = [...merged.entries()].map(([key, count]) => {
  const [company, role, type] = key.split('\u0000');
  return { company, role, type, count };
}).sort((a, b) => a.company.localeCompare(b.company, 'zh') || a.role.localeCompare(b.role, 'zh') || a.type.localeCompare(b.type, 'zh'));

const csv = ['company,role,type,count', ...finalRows.map((r) => `${r.company},${r.role},${r.type},${r.count}`)].join('\n') + '\n';
fs.writeFileSync(path.join(BANK, '岗位矩阵.csv'), csv);

const byRole = {};
for (const r of finalRows) byRole[r.role] = (byRole[r.role] || 0) + r.count;

const evidence = {
  generated_at: new Date().toISOString(),
  rows: finalRows.length,
  totals: { questions: finalRows.reduce((s, r) => s + r.count, 0), by_role: byRole, verified_raw_evidence: rawEvidence },
  note: '算法题岗位来自 CodeTop 聚合，未标注岗位统一记为“岗位未标注”；前端/全栈补充题为公开文档模拟题，无原始面经。',
  policy: rawEvidence === 0 ? '严格已核验真题 = 0（primary_evidence 全为空）' : 'partial',
};
fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(here, 'evidence', 'role-matrix.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(`ROLE-MATRIX rows=${finalRows.length} questions=${evidence.totals.questions} raw_evidence=${rawEvidence}`);
for (const [role, count] of Object.entries(byRole)) console.log(`  ${role}: ${count}`);
