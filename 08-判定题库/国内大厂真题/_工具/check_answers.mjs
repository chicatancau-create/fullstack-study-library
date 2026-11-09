import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(here, '..');
const DIR = path.join(BANK, '字节跳动', '答案');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json')) : [];
const answers = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const required = ['id', 'title', 'core_idea', 'invariant', 'complexity', 'code', 'edge_cases', 'common_mistakes', 'followups', 'rubric'];
let missing = 0;
let codeFailures = 0;
let edgeFailures = 0;
const rubricSignatures = new Map();
let duplicateRubric = 0;

for (const a of answers) {
  for (const field of required) if (!a[field]) missing++;
  if (a.rubric?.length < 3) missing++;
  if (a.edge_cases?.length < 2) missing++;
  const sig = JSON.stringify(a.rubric?.map((r) => r.point));
  if (rubricSignatures.has(sig)) duplicateRubric++;
  rubricSignatures.set(sig, a.id);
  try {
    const solve = new Function(`${a.code}\nreturn solve;`)();
    for (const edge of a.edge_cases || []) {
      const actual = vm.runInNewContext(`solve(${edge.call})`, { solve }, { timeout: 500 });
      if (JSON.stringify(actual) !== JSON.stringify(edge.expected)) {
        edgeFailures++;
        console.log(`  edge mismatch ${a.id}: call=${edge.call} actual=${JSON.stringify(actual)} expected=${JSON.stringify(edge.expected)}`);
      }
    }
  } catch (error) {
    codeFailures++;
    console.log(`  code error ${a.id}: ${error.message}`);
  }
}

check('A01 答案文件存在且字段完整', answers.length >= 8 && missing === 0, `files=${answers.length} missing=${missing}`);
check('A02 每题代码可编译执行', codeFailures === 0, `failures=${codeFailures}`);
check('A03 全部边界用例通过', edgeFailures === 0, `failures=${edgeFailures}`);
check('A04 评分点逐题不同（无统一模板）', duplicateRubric === 0, `duplicates=${duplicateRubric}`);
check('A05 每题至少 3 个专属评分点、2 个边界用例', answers.every((a) => a.rubric.length >= 3 && a.edge_cases.length >= 2));

fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
fs.writeFileSync(path.join(here, 'evidence', 'answers-check.json'), JSON.stringify({ captured_at: new Date().toISOString(), answers: answers.length, results }, null, 2) + '\n');
const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `ANSWERS-CHECK PASS ${results.length}/${results.length}` : `ANSWERS-CHECK FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
