export function canReadResource(actor, resource) {
  if (actor.tenantId !== resource.tenantId) return false;
  return resource.ownerId === actor.id || (actor.roles ?? []).some((r) => ['admin', 'auditor'].includes(r));
}
