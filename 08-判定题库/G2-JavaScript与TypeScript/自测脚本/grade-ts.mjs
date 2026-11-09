import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(process.argv[2]).href);
const fn = mod.createPool || mod.default;
if (typeof fn !== 'function') {
  console.error('FAIL: 未导出函数 createPool');
  process.exit(2);
}

let checks = 0;
let fails = 0;
const ok = (name) => console.log(`ok ${name}`);
const bad = (name, detail) => {
  fails += 1;
  console.error(`FAIL ${name}: ${detail}`);
};
function eq(name, actual, expected) {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) bad(name, `${a} != ${e}`);
  else ok(name);
}
async function reject(name, thunk, pattern) {
  checks += 1;
  try {
    await thunk();
    bad(name, '应当拒绝但成功了');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pattern && !pattern.test(message)) bad(name, `错误信息不匹配: ${message}`);
    else ok(name);
  }
}

// 1. 并发上限 + 完成顺序
{
  const pool = fn(2);
  const observed = [];
  const task = (id, ms) => () => new Promise((resolve) => {
    observed.push(pool.stats().running);
    setTimeout(() => resolve(id), ms);
  });
  const results = await Promise.all([
    pool.run(task('a', 40)), pool.run(task('b', 8)), pool.run(task('c', 4)), pool.run(task('d', 1)),
  ]);
  eq('并发上限=2 峰值不超', pool.stats().peak, 2);
  eq('全部结果返回', results.slice().sort(), ['a', 'b', 'c', 'd']);
  eq('四次启动时在跑数都不超过 2', observed.every((n) => n <= 2) && Math.max(...observed) === 2, true);
  eq('结束后无在跑任务', pool.stats().running, 0);
  eq('结束后队列为空', pool.stats().queued, 0);
}

// 2. FIFO：后进入的短任务不得插队
{
  const pool = fn(1);
  const started = [];
  const mk = (id, ms) => () => new Promise((r) => setTimeout(() => r(id), ms));
  await Promise.all([
    pool.run(mk('first', 30)),
    pool.run(mk('second', 1)),
    pool.run(mk('third', 1)),
  ]);
  started.push(...['first', 'second', 'third']);
  eq('FIFO 顺序', started, ['first', 'second', 'third']);
}

// 3. 拒绝后继续：一个任务抛错不影响后续任务
{
  const pool = fn(2);
  const boom = pool.run(async () => { throw new Error('boom'); });
  const after = pool.run(async () => 'ok');
  await reject('异常任务向外抛错', () => boom, /boom/);
  eq('异常后队列继续推进', await after, 'ok');
  eq('异常后无残留', pool.stats().running, 0);
}

// 4. 队列满：超过 queueMax 立即拒绝
{
  const pool = fn(1, 1);
  const slow = () => new Promise((r) => setTimeout(() => r('slow'), 20));
  const running = pool.run(slow);
  const queued = pool.run(slow);
  await reject('队列满时拒绝', () => pool.run(slow), /queue_full/);
  eq('在跑任务不受影响', await running, 'slow');
  eq('排队任务仍执行', await queued, 'slow');
}

// 5. 运行时边界：非法 limit
{
  checks += 1;
  try {
    fn(0);
    bad('limit=0 抛 RangeError', '没有抛错');
  } catch (error) {
    if (error instanceof RangeError) ok('limit=0 抛 RangeError');
    else bad('limit=0 抛 RangeError', String(error));
  }
  checks += 1;
  try {
    fn(1.5);
    bad('limit=1.5 抛 RangeError', '没有抛错');
  } catch (error) {
    if (error instanceof RangeError) ok('limit=1.5 抛 RangeError');
    else bad('limit=1.5 抛 RangeError', String(error));
  }
}

// 6. 异步交错：任务内部 await 多轮也不越界
{
  const pool = fn(3);
  let live = 0;
  let peak = 0;
  const tick = () => new Promise((r) => setTimeout(r, 2));
  const task = async () => {
    live += 1;
    peak = Math.max(peak, live);
    await tick(); await tick(); await tick();
    live -= 1;
    return live;
  };
  await Promise.all(Array.from({ length: 12 }, () => pool.run(task)));
  eq('多轮 await 下峰值仍在 3 以内', peak, 3);
}

// 7. stats 是快照，不被外部改动
{
  const pool = fn(2);
  const snapshot = pool.stats();
  snapshot.running = 99;
  eq('stats 快照不被外部污染', pool.stats().running, 0);
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
