/** E02 环境探测：全部真实执行，不写预期结论。 */
import { arch, availableParallelism, cpus, platform, release } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { nowMs, sleep } from '../src/measure.mjs';

console.log(`captured_at: ${new Date().toISOString()}`);
console.log('');
console.log('--- OS / runtime ---');
console.log(`platform           : ${platform()} ${release()} ${arch()}`);
console.log(`node               : ${process.version}`);
console.log(`v8                 : ${process.versions.v8}`);
console.log(`uv                 : ${process.versions.uv}`);
console.log(`cpus               : ${cpus().length} (availableParallelism=${availableParallelism()})`);
console.log(`UV_THREADPOOL_SIZE : ${process.env.UV_THREADPOOL_SIZE ?? '(未设置，默认 4)'}`);
console.log(`pid                : ${process.pid}`);
console.log('');

console.log('--- 特性探测（typeof / 实际调用）---');
const probe = (name, fn) => {
  try {
    const value = fn();
    console.log(`${name.padEnd(26)}: ${value}`);
  } catch (error) {
    console.log(`${name.padEnd(26)}: 不可用（${error.message}）`);
  }
};
probe('AbortController', () => typeof AbortController);
probe('AbortSignal.timeout', () => typeof AbortSignal.timeout);
probe('AbortSignal.any', () => typeof AbortSignal.any);
probe('structuredClone', () => typeof structuredClone);
const wt = await import('node:worker_threads');
probe('worker_threads', () => (typeof wt.Worker === 'function' ? '可用（Worker 可构造）' : '缺失'));
probe('monitorEventLoopDelay', () => (typeof monitorEventLoopDelay === 'function' ? '函数' : '缺失'));
probe('process.getActiveResourcesInfo', () => typeof process.getActiveResourcesInfo);
probe('global.gc(--expose-gc)', () => typeof global.gc);
console.log('');

console.log('--- AbortSignal.timeout 实际触发 ---');
{
  const t0 = nowMs();
  const signal = AbortSignal.timeout(20);
  const keepAlive = setTimeout(() => {}, 500); // 保住事件循环，否则进程会直接退出
  await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
  clearTimeout(keepAlive);
  console.log(`signal.reason.name : ${signal.reason?.name}`);
  console.log(`实际触发耗时       : ${(nowMs() - t0).toFixed(1)}ms（请求 20ms）`);
  console.log('观察 1：Windows 定时器粒度约 15.6ms，短延时会被抬到最近的粒度上。');
  console.log('观察 2：AbortSignal.timeout 的内部计时器是 unref 的。若事件循环没有其他 ref 资源，');
  console.log('        进程会直接退出、abort 永不触发（本机实测 exit=0 且无任何输出）。');
  console.log('        这条对 E02 有意义：超时装置既不保活进程，也不保证在超时点一定执行回调。');
}
console.log('');

console.log('--- 事件循环延迟采样器自检 ---');
{
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  await sleep(60);
  h.disable();
  console.log(`monitorEventLoopDelay max = ${(h.max / 1e6).toFixed(2)}ms  mean = ${(h.mean / 1e6).toFixed(2)}ms`);
  console.log('说明：本实验的 measured lag 用 src/measure.mjs 里的 setInterval 采样，');
  console.log('      原因是它给出逐次样本，便于和具体阶段对齐；内置直方图只用于交叉核对。');
}
console.log('');

console.log('--- 依赖 ---');
{
  const { readFileSync, existsSync } = await import('node:fs');
  const pkgPath = new URL('../package.json', import.meta.url);
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps = Object.keys(pkg.dependencies ?? {});
    const devDeps = Object.keys(pkg.devDependencies ?? {});
    console.log(`dependencies    : ${deps.length === 0 ? '(无)' : deps.join(', ')}`);
    console.log(`devDependencies : ${devDeps.length === 0 ? '(无)' : devDeps.join(', ')}`);
    console.log(`engines.node    : ${pkg.engines?.node ?? '(未声明)'}`);
  } else {
    console.log('package.json    : 缺失');
  }
  console.log(`node_modules    : ${existsSync(new URL('../node_modules', import.meta.url)) ? '存在' : '不存在（零依赖）'}`);
}
