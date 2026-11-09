// TODO: 实现 TS CLI 的并发池（并发上限、FIFO、拒绝后继续、取消）
// 说明见 题面.md；smoke.mjs 只做冒烟，完整断言在 自测脚本/grade-ts.mjs（已公开）。
export interface PoolStats {
  peak: number;
  running: number;
  queued: number;
}

export interface Pool {
  run<T>(task: () => Promise<T>): Promise<T>;
  stats(): PoolStats;
}

export function createPool(_limit: number, _queueMax = Number.POSITIVE_INFINITY): Pool {
  throw new Error('NOT_IMPLEMENTED: ts/pool');
}
