export function diffEndpoints(oldPaths, newPaths) {
  const before = new Set(Object.keys(oldPaths));
  const after = new Set(Object.keys(newPaths));
  return {
    added: [...after].filter((p) => !before.has(p)).sort(),
    removed: [...before].filter((p) => !after.has(p)).sort(),
  };
}
