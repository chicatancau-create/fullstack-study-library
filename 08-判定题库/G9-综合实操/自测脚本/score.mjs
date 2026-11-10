// 自评算分：读 评分规则.json，按你填的分算总分与各维达成率。
// 用法：
//   node 自测脚本/score.mjs 我的自评分.json
// 自评分文件格式：{"business":{"主路径":8,"数据不变量":6,...}, "sec":{...}, ...}
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ruleFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '评分规则.json');
const rules = JSON.parse(readFileSync(ruleFile, 'utf8'));

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('用法: node 自测脚本/score.mjs <我的自评分.json>');
  process.exit(2);
}
let mine;
try {
  mine = JSON.parse(readFileSync(path.resolve(inputFile), 'utf8'));
} catch (error) {
  console.error(`读不了自评分文件: ${error.message}`);
  process.exit(2);
}

let total = 0;
let dimensionFails = 0;
const rows = [];
for (const dim of rules.dimensions) {
  const given = mine[dim.id] ?? {};
  let got = 0;
  const missing = [];
  for (const item of dim.breakdown) {
    const value = given[item.label];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      missing.push(item.label);
      continue;
    }
    const capped = Math.max(0, Math.min(item.points, value));
    if (capped !== value) console.error(`WARN ${dim.name}/${item.label} 超出上限，按 ${item.points} 计`);
    got += capped;
  }
  const ratio = got / dim.points;
  total += got;
  const pass = ratio >= rules.pass_rules.per_dimension_min_ratio;
  if (!pass) dimensionFails += 1;
  rows.push({
    dimension: dim.name,
    got,
    max: dim.points,
    ratio: Number(ratio.toFixed(4)),
    pass,
    missing: missing.join(',') || '-',
  });
}

console.log('维度\t得分\t满分\t达成率\t达标\t未填写');
for (const r of rows) console.log(`${r.dimension}\t${r.got}\t${r.max}\t${(r.ratio * 100).toFixed(1)}%\t${r.pass ? 'Y' : 'N'}\t${r.missing}`);

const totalPass = total >= rules.pass_rules.per_round_total_min;
console.log(`\n总分=${total}/100 需要≥${rules.pass_rules.per_round_total_min} → ${totalPass ? '达标' : '未达标'}`);
console.log(`维度达标=${rows.length - dimensionFails}/${rows.length} 每维需要≥${rules.pass_rules.per_dimension_min_ratio * 100}%`);
console.log(`本轮结论：${totalPass && dimensionFails === 0 ? 'PASS' : 'FAIL'}（两轮都 PASS 才算通过）`);
process.exit(totalPass && dimensionFails === 0 ? 0 : 1);
