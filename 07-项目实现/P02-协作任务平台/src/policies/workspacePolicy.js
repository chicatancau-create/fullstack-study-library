import { HttpError } from '../utils/errors.js';

export async function findMembership(prisma, userId, workspaceId) {
  return prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}

export async function assertMember(prisma, userId, workspaceId) {
  const membership = await findMembership(prisma, userId, workspaceId);
  if (!membership) throw new HttpError(403, '无权访问该工作区', 'FORBIDDEN');
  return membership;
}

export function canManage(role) {
  return role === 'owner' || role === 'admin';
}

export async function assertCanManage(prisma, userId, workspaceId) {
  const membership = await assertMember(prisma, userId, workspaceId);
  if (!canManage(membership.role)) throw new HttpError(403, '需要 owner 或 admin', 'FORBIDDEN');
  return membership;
}
