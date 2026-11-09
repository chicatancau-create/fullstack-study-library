// 自测脚本自身的有效性检查：对参考答案注入受控缺陷，确认 grade-ts.mjs 会失败。
// 只用文本替换在临时目录生成变体，不修改仓库文件。
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const answer = path.join(root, '参考答案/ts/pool.ts');
const grader = path.join(root, '自测脚本/grade-ts.mjs');
const source = await readFile(answer, 'utf8');
const dir = await mkdtemp(path.join(tmpdir(), 'g2-mut-'));

const variants = [
  { id: 'V1', why: 'pump 循环放宽到 <= limit', from: 'while (state.running < limit && ', to: 'while (state.running <= limit && ', expect: /并发上限|四次启动|多轮 await/ },
  { id: 'V3', why: '队列满判断用 > 代替 >=', from: 'queue.length >= queueMax', to: 'queue.length > queueMax', expect: /队列满时拒绝/ },
  { id: 'V4', why: 'limit 下界从 1 放宽到 0', from: 'limit < 1', to: 'limit < 0', expect: /limit=0/ },
  { id: 'V5', why: 'stats 直接返回内部对象', from: "return { run, stats: () => ({ ...state, queued: queue.length }) };", to: 'return { run, stats: () => state };', expect: /快照不被外部污染/ },
];

let fails = 0;
for (const v of variants) {
  if (!source.includes(v.from)) {
    fails += 1;
    console.error(`FAIL ${v.id} 锚点未找到: ${v.from.slice(0, 40)}`);
    continue;
  }
  const file = path.join(dir, `${v.id}.ts`);
  await writeFile(file, source.replace(v.from, v.to), 'utf8');
  const out = await new Promise((resolve) => {
    execFile(process.execPath, [grader, file], { cwd: root, timeout: 30000 }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? -1) : 0, text: `${stdout}${stderr}` });
    });
  });
  if (out.code === 0) {
    fails += 1;
    console.error(`FAIL ${v.id} 变体仍通过（${v.why}）——自测脚本没抓到`);
  } else if (!v.expect.test(out.text)) {
    fails += 1;
    console.error(`FAIL ${v.id} 变体失败但断言不符预期；输出行: ${out.text.split('\n').filter((l) => l.startsWith('FAIL')).join(' | ')}`);
  } else {
    const hit = out.text.split('\n').find((l) => l.startsWith('FAIL')) ?? '';
    console.log(`ok ${v.id} rc=${out.code} ${v.why} -> ${hit.slice(0, 60)}`);
  }
}

console.log(`variants=${variants.length} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
