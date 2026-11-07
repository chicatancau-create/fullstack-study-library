// 堆增长与释放：--expose-gc 下测量保留对象与释放后的 heapUsed。
if (typeof global.gc !== 'function') {
  console.error('HEAP FAIL: 需要 --expose-gc');
  process.exit(1);
}

global.gc();
const before = process.memoryUsage().heapUsed;
let keep = [];
for (let i = 0; i < 200_000; i += 1) {
  keep.push({ i, text: 'x'.repeat(32) });
}
// 让数组在 GC 后仍可达，避免 V8 把未读取的分配优化掉。
globalThis.__keep = keep;
global.gc();
if (keep.length !== 200_000) {
  console.error('HEAP FAIL: 保留数组长度异常');
  process.exit(1);
}
const held = process.memoryUsage().heapUsed;
const growth = held - before;
console.log(`heap before=${(before / 1024 / 1024).toFixed(2)}MB held=${(held / 1024 / 1024).toFixed(2)}MB growth=${(growth / 1024 / 1024).toFixed(2)}MB`);
if (growth < 5 * 1024 * 1024) {
  console.error('HEAP FAIL: 增长不足 5MB，保留对象未生效');
  process.exit(1);
}

keep = null;
globalThis.__keep = null;
global.gc();
const after = process.memoryUsage().heapUsed;
console.log(`heap after_release=${(after / 1024 / 1024).toFixed(2)}MB released=${((held - after) / 1024 / 1024).toFixed(2)}MB`);
if (after > held - 3 * 1024 * 1024) {
  console.error('HEAP FAIL: 释放后 heapUsed 未明显下降');
  process.exit(1);
}
console.log('HEAP PASS');