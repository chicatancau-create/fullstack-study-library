/** E02 测量与调度工具：事件循环延迟采样、堆采样、可控闸门。 */

export function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 让出事件循环一轮（比 sleep(0) 更接近 0 延迟） */
export function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 同步忙等：故意阻塞事件循环，用于反例 */
export function busyWait(ms) {
  const end = nowMs() + ms;
  while (nowMs() < end) {
    /* 空转 */
  }
}

/** 具名闸门：任务 await gate.promise，测试用 gate.open() 决定完成顺序 */
export function gate(name) {
  const d = deferred();
  return {
    name,
    promise: d.promise,
    open(value) {
      d.resolve(value);
    },
  };
}

export function heapMB() {
  if (typeof global.gc === 'function') global.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

/**
 * 轮询等待某个条件成立。
 * 用轮询而不是内部事件，是为了让「等待」本身也走真实定时器，不会掩盖事件循环阻塞。
 */
export async function waitUntil(predicate, { timeoutMs = 3000, pollMs = 1, label = 'condition' } = {}) {
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    if (await predicate()) return true;
    await sleep(pollMs);
  }
  throw new Error(`waitUntil 超时（${timeoutMs}ms 内未成立）：${label}`);
}

/** 采样事件循环延迟：每 intervalMs 记录一次「实际触发时刻 - 期望触发时刻」 */
export class EventLoopLag {
  #intervalMs;
  #timer = null;
  #expected = 0;
  #samples = [];

  constructor(intervalMs = 20) {
    this.#intervalMs = intervalMs;
  }

  start() {
    this.#samples = [];
    this.#expected = nowMs() + this.#intervalMs;
    this.#timer = setInterval(() => {
      const at = nowMs();
      this.#samples.push(at - this.#expected);
      this.#expected = at + this.#intervalMs;
    }, this.#intervalMs);
    return this;
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    return this.summary();
  }

  summary() {
    const sorted = [...this.#samples].sort((a, b) => a - b);
    const n = sorted.length;
    const at = (q) => (n === 0 ? NaN : sorted[Math.min(n - 1, Math.floor(q * n))]);
    const mean = n === 0 ? NaN : sorted.reduce((a, b) => a + b, 0) / n;
    return { samples: n, mean, p50: at(0.5), p95: at(0.95), max: n === 0 ? NaN : sorted[n - 1] };
  }
}

export function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}
