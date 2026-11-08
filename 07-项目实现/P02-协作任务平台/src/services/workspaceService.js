import { HttpError } from '../utils/errors.js';

export async function createWorkspace({ prisma, userId, name }) {
  if (!name) throw new HttpError(400, 'name 必填', 'INVALID_INPUT');
  return prisma.workspace.create({
    data: { name, ownerId: userId, memberships: { create: { userId, role: 'owner' } } },
  });
}

export async function listWorkspaces({ prisma, userId }) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });
  return memberships.map((m) => ({ ...m.workspace, role: m.role }));
}

export async function transactionDemo({ prisma, userId, workspaceId: _workspaceId }) {
  const name = `rollback-probe-${Date.now()}`;
  let failed = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.workspace.create({ data: { name, ownerId: userId } });
      throw new Error('injected failure');
    });
  } catch {
    failed = true;
  }
  const count = await prisma.workspace.count({ where: { name } });
  return { injected: failed, rolledBack: failed && count === 0, remainingRows: count };
}
