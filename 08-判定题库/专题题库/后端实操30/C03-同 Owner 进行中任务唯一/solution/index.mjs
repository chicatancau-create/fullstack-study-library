export function uniqueOwnerTask(tasks, candidate) {
  const conflict = tasks.some((t) => t.workspaceId === candidate.workspaceId
    && t.ownerId === candidate.ownerId && t.status === 'in_progress');
  if (conflict) return { ok: false, reason: 'OWNER_ACTIVE' };
  return { ok: true, tasks: [...tasks, candidate] };
}
