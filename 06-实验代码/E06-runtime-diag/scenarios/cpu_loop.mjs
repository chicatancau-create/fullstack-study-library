// CPU 忙循环：用 --cpu-prof 采主线程 profile，证明阻塞发生在 JS 执行。
const start = Date.now();
let x = 0;
while (Date.now() - start < 300) {
  x = (x + 1) % 1000003;
}
console.log(`cpu_loop done x=${x} elapsed=${Date.now() - start}ms`);