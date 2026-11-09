export function canAccess(member, action, resource) {
  if (!member || !resource || resource.tenantId !== member.tenantId) return false;
  if (action === 'read') return ['owner', 'admin', 'member'].includes(member.role);
  if (action === 'write') return ['owner', 'admin'].includes(member.role);
  if (action === 'manage') return member.role === 'owner';
  return false;
}
