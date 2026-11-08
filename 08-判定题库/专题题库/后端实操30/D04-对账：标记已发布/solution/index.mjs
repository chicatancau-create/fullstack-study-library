export function reconcile(publishedIds, outbox) {
  const published = new Set(publishedIds);
  const next = outbox.map((r) => (published.has(r.id) ? { ...r, status: 'published' } : { ...r }));
  return {
    outbox: next,
    published: next.filter((r) => r.status === 'published').length,
    pending: next.filter((r) => r.status !== 'published').length,
  };
}
