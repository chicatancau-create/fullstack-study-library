export interface PoolStats {
  peak: number;
  running: number;
  queued: number;
}

export interface Pool {
  run<T>(task: () => Promise<T>): Promise<T>;
  stats(): PoolStats;
}

export function createPool(limit: number, queueMax = Number.POSITIVE_INFINITY): Pool {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('invalid_limit');
  if (queueMax !== Number.POSITIVE_INFINITY && (!Number.isInteger(queueMax) || queueMax < 0)) {
    throw new RangeError('invalid_queue_max');
  }

  const queue: Array<() => void> = [];
  const state: PoolStats = { peak: 0, running: 0, queued: 0 };

  const pump = (): void => {
    while (state.running < limit && queue.length > 0) {
      const start = queue.shift();
      if (start === undefined) break;
      start();
    }
    state.queued = queue.length;
  };

  const run = <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = (): void => {
        state.running += 1;
        state.peak = Math.max(state.peak, state.running);
        Promise.resolve()
          .then(task)
          .then(
            (value) => {
              state.running -= 1;
              pump();
              resolve(value);
            },
            (error: unknown) => {
              state.running -= 1;
              pump();
              reject(error);
            },
          );
      };
      if (state.running >= limit && queue.length >= queueMax) {
        reject(new Error('queue_full'));
        return;
      }
      queue.push(start);
      pump();
    });

  return { run, stats: () => ({ ...state, queued: queue.length }) };
}
