export function isStale(record, nowMs, ttlMs) {
  return nowMs - record.updatedAt > ttlMs;
}
