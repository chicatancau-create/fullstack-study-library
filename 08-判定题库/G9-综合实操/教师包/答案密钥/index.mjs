export function solvePaper(paper, input) {
  if (paper === 'A') {
    const tasks = input;
    const done = new Set();
    const out = [];
    let guard = 0;
    while (out.length < tasks.length && guard++ < tasks.length * tasks.length) {
      for (const task of tasks) {
        if (done.has(task.id)) continue;
        if ((task.dependsOn || []).every((d) => done.has(d))) {
          done.add(task.id);
          out.push(task.id);
        }
      }
    }
    if (out.length !== tasks.length) throw new Error('cycle');
    return out;
  }
  if (paper === 'B') {
    const net = {};
    for (const event of input) {
      const sign = event.type === 'credit' ? 1 : -1;
      net[event.account] = (net[event.account] || 0) + sign * event.amount;
    }
    return net;
  }
  throw new Error('unknown paper');
}
