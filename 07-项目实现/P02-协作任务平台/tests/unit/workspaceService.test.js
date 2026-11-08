import { describe, it, expect } from 'vitest';
import { createWorkspace, listWorkspaces, transactionDemo } from '../../src/services/workspaceService.js';

describe('workspaceService', () => {
  it('缺少名称返回 400', async () => {
    await expect(createWorkspace({ prisma: {}, userId: 'u1', name: '' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('创建工作区时把创建者写成 owner 成员', async () => {
    let captured;
    const prisma = { workspace: { create: async (args) => { captured = args; return { id: 'w1' }; } } };
    await createWorkspace({ prisma, userId: 'u1', name: '团队' });
    expect(captured.data.memberships.create).toEqual({ userId: 'u1', role: 'owner' });
  });

  it('列表把成员角色合并进工作区', async () => {
    const prisma = {
      membership: { findMany: async () => [{ role: 'admin', workspace: { id: 'w1' } }] },
    };
    await expect(listWorkspaces({ prisma, userId: 'u1' })).resolves.toEqual([{ id: 'w1', role: 'admin' }]);
  });

  it('事务回滚不留下探测行', async () => {
    let created = false;
    const prisma = {
      $transaction: async (fn) => fn({ workspace: { create: async () => { created = true; } } }),
      workspace: { count: async () => 0 },
    };
    const result = await transactionDemo({ prisma, userId: 'u1', workspaceId: 'w1' });
    expect(created).toBe(true);
    expect(result).toMatchObject({ injected: true, rolledBack: true, remainingRows: 0 });
  });
});
