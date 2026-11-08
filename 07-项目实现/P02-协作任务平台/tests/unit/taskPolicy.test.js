import { describe, it, expect } from 'vitest';
import { loadTask, assertTaskAccess, canComment, canUpdateStatus } from '../../src/policies/taskPolicy.js';

const prismaWith = (task, membership = { role: 'member' }) => ({
  task: { findUnique: async () => task },
  membership: { findUnique: async () => membership },
});

describe('taskPolicy', () => {
  it('任务不存在返回 404', async () => {
    await expect(loadTask(prismaWith(null), 't1')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('非成员访问任务返回 403', async () => {
    await expect(assertTaskAccess(prismaWith({ id: 't1', workspaceId: 'w1' }, null), 't1', 'u1'))
      .rejects.toMatchObject({ status: 403 });
  });

  it('成员访问任务返回任务', async () => {
    const task = { id: 't1', workspaceId: 'w1' };
    await expect(assertTaskAccess(prismaWith(task), 't1', 'u1')).resolves.toBe(task);
  });

  it('评论与改状态权限默认开放给成员', () => {
    expect(canComment()).toBe(true);
    expect(canUpdateStatus()).toBe(true);
  });
});
