import fs from 'node:fs';

// 解析 V8 .heapsnapshot（schema v2），统计节点/边/字符串与按构造名聚合的浅层大小。
export function loadSnapshot(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function indexSnapshot(snapshot) {
  const meta = snapshot.snapshot?.meta ?? snapshot.meta;
  const { nodes, edges, strings } = snapshot;
  const nf = meta.node_fields.length;
  const ef = meta.edge_fields.length;
  const nTypes = meta.node_types[0];
  const eTypes = meta.edge_types[0];
  const nField = (name) => meta.node_fields.indexOf(name);
  const eField = (name) => meta.edge_fields.indexOf(name);
  const nameOff = nField('name');
  const sizeOff = nField('self_size');
  const typeOff = nField('type');
  const edgeCountOff = nField('edge_count');
  const toNodeOff = eField('to_node');
  const edgeTypeOff = eField('type');
  const nodeCount = nodes.length / nf;

  const nodeAt = (ord) => {
    const base = ord * nf;
    return {
      ordinal: ord,
      name: strings[nodes[base + nameOff]] ?? '',
      type: nTypes[nodes[base + typeOff]] ?? 'unknown',
      selfSize: nodes[base + sizeOff] ?? 0,
      edgeCount: nodes[base + edgeCountOff] ?? 0,
    };
  };

  const edgeGroups = [];
  let cursor = 0;
  for (let ord = 0; ord < nodeCount; ord += 1) {
    const count = nodes[ord * nf + edgeCountOff] ?? 0;
    edgeGroups.push({ start: cursor, count });
    cursor += count * ef;
  }

  const childrenOf = (ord) => {
    const { start, count } = edgeGroups[ord];
    const out = [];
    for (let k = 0; k < count; k += 1) {
      const base = start + k * ef;
      out.push({
        to: edges[base + toNodeOff] / nf,
        type: eTypes[edges[base + edgeTypeOff]],
      });
    }
    return out;
  };

  return {
    nodeCount,
    edgeCount: edges.length / ef,
    stringCount: strings.length,
    nodeAt,
    childrenOf,
  };
}

const IGNORED = new Set(['(system)', '(synthetic)']);

export function summarize(snapshot) {
  const index = indexSnapshot(snapshot);
  const byName = new Map();
  for (let ord = 0; ord < index.nodeCount; ord += 1) {
    const node = index.nodeAt(ord);
    if (IGNORED.has(node.name)) continue;
    const key = `${node.type}:${node.name}`;
    const entry = byName.get(key) ?? { type: node.type, name: node.name, count: 0, selfSize: 0 };
    entry.count += 1;
    entry.selfSize += node.selfSize;
    byName.set(key, entry);
  }
  const top = [...byName.values()].sort((a, b) => b.selfSize - a.selfSize).slice(0, 12);
  return { nodeCount: index.nodeCount, edgeCount: index.edgeCount, stringCount: index.stringCount, top };
}

// 从 root(ordinal 0) 做一次 BFS，找到名称匹配的目标节点并回溯 retainer path。
export function retainerPath(snapshot, matcher) {
  const index = indexSnapshot(snapshot);
  const parent = new Map([[0, null]]);
  const queue = [0];
  let target = -1;
  while (queue.length) {
    const ord = queue.shift();
    if (ord !== 0 && matcher(index.nodeAt(ord))) { target = ord; break; }
    for (const { to } of index.childrenOf(ord)) {
      if (parent.has(to)) continue;
      parent.set(to, ord);
      queue.push(to);
    }
  }
  if (target < 0) return null;
  const path = [];
  for (let cur = target; cur !== null; cur = parent.get(cur) ?? null) {
    const node = index.nodeAt(cur);
    path.push(`${node.name}(${node.type},${node.selfSize}B)`);
    if (cur === 0) break;
  }
  return path.reverse();
}
