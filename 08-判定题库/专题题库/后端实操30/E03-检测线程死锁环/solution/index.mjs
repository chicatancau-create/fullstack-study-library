export function hasDeadlock(threads) {
  const next = new Map(threads.map((t) => [t.name, t.waitingFor]));
  const state = new Map();
  const visit = (name) => {
    if (state.get(name) === 1) return true;
    if (state.get(name) === 2) return false;
    state.set(name, 1);
    const target = next.get(name);
    if (target && visit(target)) return true;
    state.set(name, 2);
    return false;
  };
  return threads.some((t) => visit(t.name));
}
