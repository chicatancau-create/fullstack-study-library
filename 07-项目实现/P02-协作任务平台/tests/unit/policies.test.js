import { describe, it, expect } from 'vitest';
import { assertMember, canManage, assertCanManage } from '../../src/policies/workspacePolicy.js';

const prismaWith = (membership) => ({
  membership: { findUnique: async () => membership },
});

describe('workspacePolicy', () => {
  it('无成员关系返回 403', async () => {
    await expect(assertMember(prismaWith(null), 'u1', 'w1')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('成员关系存在则返回角色', async () => {
    const m = { role: 'owner' };
    await expect(assertMember(prismaWith(m), 'u1', 'w1')).resolves.toBe(m);
  });

  it('owner/admin 可管理，member 不可', () => {
    expect(canManage('owner')).toBe(true);
    expect(canManage('admin')).toBe(true);
    expect(canManage('member')).toBe(false);
  });

  it('member 调用管理动作返回 403', async () => {
    await expect(assertCanManage(prismaWith({ role: 'member' }), 'u1', 'w1'))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
