export function optimisticUpdate(record, patch, expectedVersion) {
  if (record.version !== expectedVersion) return { ok: false, conflict: true };
  return { ok: true, record: { ...record, ...patch, version: expectedVersion + 1 } };
}
