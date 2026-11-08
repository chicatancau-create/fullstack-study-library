import { describe, it, expect } from 'vitest';
import { createTask, updateTaskStatus, listTasks } from '../../src/services/taskService.js';

function fakePrisma({ membership = { role: 'member' }, create, update, findMany = [] } = {}) {
  return {
    membership: { findUnique: async () => membership },
    task: {
      create: create || (async ({ data }) => ({ id: 't1', version: 0, ...data })),
      findUnique: async ({ where }) => (where.id === 'missing' ? null : { id: where.id, workspaceId: 'w1' }),
      update: update || (async ({ where, data }) => ({ id: where.id, ...data })),
      findMany: async () => findMany,
    },
  };
}

describe('taskService', () => {
  it('非法状态返回 400', async () => {
    await expect(createTask({ prisma: fakePrisma(), userId: 'u1', workspaceId: 'w1', title: 'x', status: 'bad' }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' });
  });

  it('非成员创建返回 403', async () => {
    await expect(createTask({ prisma: fakePrisma({ membership: null }), userId: 'u1', workspaceId: 'w1', title: 'x' }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('同一 Owner 已有进行中任务时 P2002 映射为 409', async () => {
    const prisma = fakePrisma({
      create: async () => {
        const error = new Error('unique');
        error.code = 'P2002';
        throw error;
      },
    });
    await expect(createTask({ prisma, userId: 'u1', workspaceId: 'w1', title: 'x', status: 'in_progress' }))
      .rejects.toMatchObject({ status: 409, code: 'OWNER_BUSY' });
  });

  it('创建成功返回任务', async () => {
    const task = await createTask({ prisma: fakePrisma(), userId: 'u1', workspaceId: 'w1', title: '写完' });
    expect(task).toMatchObject({ title: '写完', status: 'todo', workspaceId: 'w1' });
  });

  it('更新不存在的任务返回 404', async () => {
    await expect(updateTaskStatus({ prisma: fakePrisma(), userId: 'u1', taskId: 'missing', status: 'done' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('列表返回按创建时间排序的结果', async () => {
    const prisma = fakePrisma({ findMany: [{ id: 'a' }, { id: 'b' }] });
    await expect(listTasks({ prisma, userId: 'u1', workspaceId: 'w1' })).resolves.toHaveLength(2);
  });
});
