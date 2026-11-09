import fs from 'node:fs';

// 读取 --cpu-prof 产出的 .cpuprofile，按样本归属计算自耗时并排序。
export function loadProfile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function hotFunctions(profile, limit = 8) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  samples.forEach((id, i) => {
    const us = deltas[i] ?? 0;
    self.set(id, (self.get(id) ?? 0) + us);
  });
  if (samples.length === 0) {
    for (const node of profile.nodes) {
      if (node.hitCount) self.set(node.id, node.hitCount * 1000);
    }
  }
  return [...self.entries()]
    .map(([id, us]) => {
      const frame = nodes.get(id)?.callFrame ?? {};
      return {
        name: frame.functionName || '(anonymous)',
        url: (frame.url || '').replace(/^file:\/\//, ''),
        line: (frame.lineNumber ?? -1) + 1,
        selfMs: Number((us / 1000).toFixed(2)),
      };
    })
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, limit);
}
