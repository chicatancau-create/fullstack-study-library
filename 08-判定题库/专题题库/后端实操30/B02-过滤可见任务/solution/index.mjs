export function filterVisibleTasks(actor, tasks) {
  return tasks.filter((t) => {
    if (t.tenantId !== actor.tenantId) return false;
    return t.ownerId === actor.id || (actor.roles ?? []).some((r) => ['admin', 'auditor'].includes(r));
  });
}
