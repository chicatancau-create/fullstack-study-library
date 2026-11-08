export function maskSensitiveFields(actor, record, sensitive = ['salary', 'idCard']) {
  if ((actor.roles ?? []).includes('hr')) return { ...record };
  const out = { ...record };
  for (const key of sensitive) {
    if (key in out) out[key] = '***';
  }
  return out;
}
