export function nextRetryDelay(attempt, baseMs = 100) {
  if (attempt >= 5) return null;
  return Math.min(baseMs * 2 ** (attempt - 1), 3000);
}
