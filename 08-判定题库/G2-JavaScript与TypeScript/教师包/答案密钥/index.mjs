export function createPool(limit) {
  const queue = [];
  let running = 0;
  let peak = 0;
  const next = () => {
    if (running < limit && queue.length > 0) queue.shift()();
  };
  const run = (fn) => new Promise((resolve, reject) => {
    const start = () => {
      running += 1;
      peak = Math.max(peak, running);
      Promise.resolve().then(fn).then(
        (value) => { running -= 1; next(); resolve(value); },
        (error) => { running -= 1; next(); reject(error); },
      );
    };
    if (running < limit) start();
    else queue.push(start);
  });
  return { run, stats: () => ({ peak, running, queued: queue.length }) };
}
