export function assertOwnerOrAdmin(actor, resource) {
  const ok = actor.tenantId === resource.tenantId
    && (resource.ownerId === actor.id || (actor.roles ?? []).includes('admin'));
  if (!ok) {
    const err = new Error('FORBIDDEN');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
}
