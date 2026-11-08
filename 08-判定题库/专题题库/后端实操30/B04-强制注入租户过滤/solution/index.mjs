export function tenantScopedQuery(actor, query = {}) {
  if (!actor?.tenantId) throw new Error('MISSING_TENANT');
  return { ...query, tenantId: actor.tenantId };
}
