import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, '08-判定题库');
const manifestTool = path.join(ROOT, '06-实验代码/_template/manifest.mjs');
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

const packs = fs.readdirSync(BASE).filter((n) => /^G\d-/.test(n)).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
check('S01 G0–G9 十个包齐全', packs.length === 10 && packs.every((p, i) => p.startsWith(`G${i}-`)), `packs=${packs.length}`);

const missing = [];
const noAnswer = [];
const noScript = [];
const badEvidence = [];
const todoOutsideStarter = [];
let starterTodos = 0;

for (const pack of packs) {
  const dir = path.join(BASE, pack);
  for (const rel of ['README.md', '自评指南.md', '参考答案', '自测脚本', '起始代码', 'evidence/judge-solution.txt', 'evidence/judge-starter.txt']) {
    if (!fs.existsSync(path.join(dir, rel))) missing.push(`${pack}:${rel}`);
  }
  const answersDir = path.join(dir, '参考答案');
  if (fs.existsSync(answersDir) && fs.readdirSync(answersDir).filter((f) => !f.startsWith('.')).length === 0) noAnswer.push(pack);
  const selfDir = path.join(dir, '自测脚本');
  if (fs.existsSync(selfDir) && fs.readdirSync(selfDir).filter((f) => !f.startsWith('.')).length === 0) noScript.push(pack);

  const solution = path.join(dir, 'evidence/judge-solution.txt');
  const starter = path.join(dir, 'evidence/judge-starter.txt');
  if (!fs.existsSync(solution) || !fs.existsSync(starter)) badEvidence.push(`${pack}:missing`);
  else {
    const sol = fs.readFileSync(solution, 'utf8');
    const sta = fs.readFileSync(starter, 'utf8');
    if (!/fails=0/.test(sol) || !/NOT_IMPLEMENTED/.test(sta)) badEvidence.push(pack);
  }

  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === '__pycache__') return [];
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
  for (const file of walk(dir).filter((f) => /\.(md|mjs|js|json|ts)$/.test(f))) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('TODO')) continue;
    // 允许任意层级下的「起始代码/」子目录（如 G9 的 paperA/起始代码/）
    if (/(^|\/)起始代码\//.test(rel)) starterTodos++;
    else todoOutsideStarter.push(`${pack}:${rel}`);
  }
}

check('S02 必填结构存在', missing.length === 0, missing.slice(0, 5).join(',') || 'ok');
check('S03 每包参考答案非空且公开', noAnswer.length === 0, noAnswer.join(',') || `answers=${packs.length}`);
check('S04 每包自测脚本非空', noScript.length === 0, noScript.join(',') || `scripts=${packs.length}`);
check('S05 参考答案判题通过、起始代码未实现', badEvidence.length === 0, badEvidence.join(',') || `evidence=${packs.length}`);
check('S06 TODO 仅存在于起始代码', todoOutsideStarter.length === 0 && starterTodos >= 10, `starter=${starterTodos} outside=${todoOutsideStarter.length}`);
check('S07 答案与自评公开（无隐藏目录）', !fs.readdirSync(BASE).some((n) => /hidden|teacher/i.test(n)), 'no hidden/teacher');

const evidenceDir = path.join(BASE, 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, 'student-packages.json'), JSON.stringify({ generated_at: new Date().toISOString(), packs: packs.length, starterTodos, results }, null, 2) + '\n');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} ${r.detail}`);
const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `STUDENT-PACKAGES PASS ${results.length}/${results.length}` : `STUDENT-PACKAGES FAIL ${failures}/${results.length}`);
if (failures) process.exitCode = 1;
