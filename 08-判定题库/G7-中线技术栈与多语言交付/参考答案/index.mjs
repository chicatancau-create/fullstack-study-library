export function compareContract(left, right) {
  const l = left || {};
  const r = right || {};
  const missing = Object.keys(l).filter((k) => !(k in r));
  const extra = Object.keys(r).filter((k) => !(k in l));
  const mismatch = Object.keys(l).filter((k) => k in r && l[k] !== r[k]);
  return { missing, extra, mismatch, compatible: missing.length === 0 };
}
