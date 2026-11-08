export function canEditField(actor, task, field, policy = {}) {
  if (actor.tenantId !== task.tenantId) return false;
  if ((actor.roles ?? []).includes('admin')) return true;
  const allowed = policy[field] ?? [];
  if (allowed.includes('owner') && task.ownerId === actor.id) return true;
  return allowed.includes('member');
}
