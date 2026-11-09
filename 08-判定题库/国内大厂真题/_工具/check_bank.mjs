import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(here, '..');
const COMPANIES = ['字节跳动', '腾讯', '阿里巴巴', '美团', '滴滴', '华为'];
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

let total = 0;
let withPrimary = 0;
let evidenceEntries = 0;
let roleInferred = 0;
const missing = [];
const badUrls = [];
const badEvidence = [];

for (const company of COMPANIES) {
  const list = JSON.parse(fs.readFileSync(path.join(BANK, company, '题目索引.json'), 'utf8'));
  const ids = new Set();
  for (const q of list) {
    total++;
    for (const field of ['id', 'title', 'question_url', 'aggregate_source_url', 'primary_evidence', 'evidence_status', 'role_class', 'role_source']) {
      if (q[field] === undefined || q[field] === null || q[field] === '') missing.push(`${company}/${q.id}:${field}`);
    }
    if (ids.has(q.id)) missing.push(`${company}:duplicate-id:${q.id}`);
    ids.add(q.id);
    if (!/^https:\/\/leetcode\.(cn|com)\/problems\//.test(q.question_url || '')) badUrls.push(`${company}/${q.id}:question_url`);
    if (!/^https:\/\/codetop\.cc\//.test(q.aggregate_source_url || '')) badUrls.push(`${company}/${q.id}:aggregate`);
    if (q.primary_evidence?.length) withPrimary++;
    for (const e of q.primary_evidence || []) {
      evidenceEntries++;
      if (!e.evidence_id || !/^https:\/\/www\.nowcoder\.com\//.test(e.url || '')) badEvidence.push(`${company}/${q.id}:url`);
      if (!e.quote || e.quote.length > 120) badEvidence.push(`${company}/${q.id}:quote`);
      if (!e.accessed_at || !e.status) badEvidence.push(`${company}/${q.id}:meta`);
      if (q.evidence_status !== 'primary_verified') badEvidence.push(`${company}/${q.id}:status`);
    }
    if (q.role_class === '后端/算法') roleInferred++;
  }
}

check('B01 六家公司题目总数 = 250', total === 250, `total=${total}`);
check('B02 必填字段完整（含证据与岗位字段）', missing.length === 0, missing.slice(0, 3).join(',') || 'all-present');
check('B03 题目链接均为 LeetCode 题面', badUrls.filter((x) => x.includes('question_url')).length === 0);
check('B04 聚合来源均为 CodeTop', badUrls.filter((x) => x.includes('aggregate')).length === 0);
check('B05 岗位不再统一推断为后端', roleInferred === 0, `inferred=${roleInferred}`);
check('B06 原始面经证据结构完整且与状态一致', badEvidence.length === 0, `questions=${withPrimary} entries=${evidenceEntries} bad=${badEvidence.length}`);

const failures = results.filter((r) => !r.ok).length;
fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(here, 'evidence', 'bank-check.json'), JSON.stringify({ captured_at: new Date().toISOString(), total, withPrimary, evidenceEntries, results }, null, 2) + '\n');
console.log(failures === 0 ? `BANK-CHECK PASS ${results.length}/${results.length}` : `BANK-CHECK FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
