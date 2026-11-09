import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cliPath = process.argv[2] ?? path.join(root, '参考答案/ts/cli.ts');
const cli = path.resolve(root, cliPath);

let checks = 0;
let fails = 0;
const ok = (name, extra = '') => console.log(`ok ${name}${extra ? ` ${extra}` : ''}`);
const bad = (name, detail) => {
  fails += 1;
  console.error(`FAIL ${name}: ${detail}`);
};

function run(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [cli, ...args], { cwd: root, timeout: opts.timeout ?? 20000, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
      resolve({ code: error ? (error.code ?? -1) : 0, stdout, stderr });
    });
  });
}

async function expect(name, args, want) {
  checks += 1;
  const r = await run(args);
  const problems = [];
  if (want.code !== undefined && r.code !== want.code) problems.push(`退出码 ${r.code} != ${want.code}`);
  if (want.stdout && !want.stdout.test(r.stdout)) problems.push(`stdout 不匹配: ${JSON.stringify(r.stdout.slice(0, 160))}`);
  if (want.stderr && !want.stderr.test(r.stderr)) problems.push(`stderr 不匹配: ${JSON.stringify(r.stderr.slice(0, 160))}`);
  if (want.code === 2 && !/用法/.test(r.stderr)) problems.push('用法错误没有打印帮助文本');
  if (problems.length) bad(name, problems.join('; '));
  else ok(name);
  return r;
}

const dir = await mkdtemp(path.join(tmpdir(), 'g2-cli-'));
const write = async (name, text) => {
  const p = path.join(dir, name);
  await writeFile(p, text, 'utf8');
  return p;
};

const good = await write('jobs.json', JSON.stringify([
  { id: 'a', ms: 30 }, { id: 'b', ms: 5 }, { id: 'c', ms: 1 }, { id: 'd', ms: 1 },
]));

// 1. --help 与无参数
await expect('--help 退出码 0', ['--help'], { code: 0, stdout: /用法:\s*node/ });
await expect('无参数退出码 2 并打印用法', [], { code: 2, stdout: /^$/, stderr: /用法:/ });
await expect('未知参数退出码 2', ['--wat'], { code: 2, stderr: /未知参数 --wat/ });
await expect('--limit 缺值退出码 2', [good, '--limit'], { code: 2, stderr: /缺少 --limit/ });
await expect('--limit 0 退出码 2', [good, '--limit', '0'], { code: 2, stderr: /正整数/ });

// 2. 正常执行
{
  checks += 1;
  const r = await run([good, '--limit', '2', '--json']);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch (error) { parsed = null; }
  const results = parsed?.results ?? [];
  const ids = results.map((x) => x.id).join(',');
  const statuses = new Set(results.map((x) => x.status));
  if (r.code !== 0) bad('正常执行退出码 0', `实际 ${r.code}: ${r.stderr}`);
  else if (ids !== 'a,b,c,d') bad('--json 结果顺序与输入一致', `ids=${ids}`);
  else if (statuses.size !== 1 || !statuses.has('ok')) bad('--json 全部 ok', `statuses=${[...statuses]}`);
  else if (!/^A$/.test(results[0]?.value ?? '')) bad('--json 带转换结果', `value=${results[0]?.value}`);
  else ok('正常执行退出码 0 且 --json 结构正确', `ids=${ids}`);
}

// 3. 并发上限被真正执行
{
  checks += 1;
  const slow = await write('slow.json', JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ id: `j${i}`, ms: 60 }))));
  const started = Date.now();
  const r = await run([slow, '--limit', '2', '--queue', '16']);
  const elapsed = Date.now() - started;
  if (r.code !== 0) bad('并发上限执行退出码 0', `实际 ${r.code}`);
  else if (elapsed < 170) bad('并发上限生效（6×60ms / 并发 2 ≥180ms）', `elapsed=${elapsed}ms`);
  else ok('并发上限生效', `elapsed=${elapsed}ms`);
}

// 4. schema 校验
await expect('顶层不是数组退出码 3', [await write('obj.json', '{"a":1}')], { code: 3, stderr: /顶层必须是数组/ });
await expect('非法 JSON 退出码 3', [await write('bad.json', '{"a":')], { code: 3, stderr: /JSON 解析失败/ });
await expect('缺少 id 退出码 3', [await write('noid.json', '[{"ms":1}]')], { code: 3, stderr: /id/ });
await expect('ms 为负数退出码 3', [await write('neg.json', '[{"id":"a","ms":-1}]')], { code: 3, stderr: /ms/ });
await expect('文件不存在退出码 4', [path.join(dir, 'nope.json')], { code: 4, stderr: /ERROR/ });

// 5. 队列满：单次超限即报错
{
  checks += 1;
  const many = await write('many.json', JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, ms: 20 }))));
  const r = await run([many, '--limit', '1', '--queue', '2']);
  if (r.code !== 4) bad('队列满退出码 4', `实际 ${r.code}`);
  else if (!/queue_full/.test(r.stdout)) bad('队列满逐项结果为 error', r.stdout.slice(0, 160));
  else ok('队列满退出码 4 且逐项报 queue_full');
}

// 6. 取消：abort 后未启动的任务返回 cancelled
{
  checks += 1;
  const { runJobs } = await import(new URL('../参考答案/ts/cli.ts', import.meta.url).href);
  const controller = new AbortController();
  const jobs = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, ms: 40 }));
  const pending = runJobs(jobs, { limit: 1, queue: 16, signal: controller.signal });
  controller.abort();
  const results = await pending;
  const cancelled = results.filter((r) => r.status === 'cancelled').length;
  const okCount = results.filter((r) => r.status === 'ok').length;
  if (cancelled + okCount !== jobs.length) bad('取消后每个任务都有终态', JSON.stringify(results));
  else if (cancelled === 0) bad('取消后有任务被标记 cancelled', JSON.stringify(results));
  else ok('取消后有任务被标记 cancelled', `cancelled=${cancelled} ok=${okCount}`);
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
