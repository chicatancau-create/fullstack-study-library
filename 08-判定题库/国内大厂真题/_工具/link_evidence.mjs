import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(here, '..');
const file = path.join(here, 'evidence', 'interview-evidence.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const records = data.records;

const byCompany = new Map();
for (const r of records) {
  if (!byCompany.has(r.company)) byCompany.set(r.company, new Map());
  for (const qid of r.supports_questions) {
    const m = byCompany.get(r.company);
    if (!m.has(qid)) m.set(qid, []);
    m.get(qid).push({
      evidence_id: r.id,
      url: r.url,
      title: r.title,
      published_at: r.published_at,
      accessed_at: r.accessed_at,
      quote: r.quote,
      role: r.role,
      role_basis: r.role_basis,
      status: r.status,
      verifier: r.verifier,
    });
  }
}

const report = { generated_at: new Date().toISOString(), companies: {}, totals: { evidence: records.length, linked_questions: 0, questions: 0 } };
for (const dir of fs.readdirSync(BANK, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const idx = path.join(BANK, dir.name, '题目索引.json');
  if (!fs.existsSync(idx)) continue;
  const list = JSON.parse(fs.readFileSync(idx, 'utf8'));
  const map = byCompany.get(dir.name) || new Map();
  let linked = 0;
  for (const q of list) {
    const ev = map.get(q.id) || [];
    q.primary_evidence = ev;
    q.evidence_status = ev.length ? 'primary_verified' : 'third_party_aggregate';
    q.evidence_note = ev.length ? '已核验公开牛客面经，见 primary_evidence' : '第三方聚合，待逐题核源';
    if (ev.length) linked++;
  }
  fs.writeFileSync(idx, JSON.stringify(list, null, 2) + '\n');
  report.companies[dir.name] = { questions: list.length, linked, evidence: [...map.keys()].length };
  report.totals.questions += list.length;
  report.totals.linked_questions += linked;
}
fs.writeFileSync(path.join(here, 'evidence', 'evidence-link.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`EVIDENCE-LINK records=${records.length} questions=${report.totals.questions} linked=${report.totals.linked_questions}`);
for (const [c, v] of Object.entries(report.companies)) if (v.linked) console.log(`  ${c}: ${v.linked}/${v.questions} (${v.evidence} 条证据)`);
