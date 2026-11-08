export function serializeByKey() {
  const chains = new Map();
  return function run(key, task) {
    const prev = chains.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    chains.set(key, next.catch(() => {}));
    return next;
  };
}
