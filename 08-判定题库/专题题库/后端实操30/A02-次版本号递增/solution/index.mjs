export function bumpMinor(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error('INVALID_VERSION');
  return `${m[1]}.${Number(m[2]) + 1}.0`;
}
