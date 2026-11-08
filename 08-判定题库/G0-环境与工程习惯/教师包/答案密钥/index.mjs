export function resolveConflict(ours, theirs) {
  const seen = new Set();
  const out = [];
  for (const line of [...ours, ...theirs]) {
    const text = String(line).trim();
    if (!text) continue;
    if (text.startsWith('<<<<<<<') || text === '=======' || text.startsWith('>>>>>>>')) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
