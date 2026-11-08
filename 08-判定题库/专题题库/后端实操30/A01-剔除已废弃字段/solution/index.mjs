export function stripDeprecated(payload, deprecatedFields = []) {
  const out = { ...payload };
  for (const key of deprecatedFields) delete out[key];
  return out;
}
