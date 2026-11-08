export function countThreadStates(dump) {
  const counts = {};
  for (const m of dump.matchAll(/Thread\.State:\s*([A-Z_]+)/g)) {
    counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  }
  return counts;
}
