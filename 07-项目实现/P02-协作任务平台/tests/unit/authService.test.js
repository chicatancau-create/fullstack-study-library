import { describe, it, expect } from 'vitest';
import { register, login, publicUser } from '../../src/services/authService.js';
import { hashPassword } from '../../src/utils/password.js';

const app = { jwt: { sign: () => 'signed-token' } };

function prismaWithUser(user) {
  return {
    user: { create: async ({ data }) => ({ id: 'u1', ...data }), findUnique: async () => user },
    refreshToken: { create: async () => ({}) },
  };
}

describe('authService', () => {
  it('注册参数不足返回 400', async () => {
    await expect(register({ prisma: prismaWithUser(null), app, email: 'a@b.c', password: 'short' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('重复邮箱返回 409', async () => {
    const prisma = prismaWithUser(null);
    prisma.user.create = async () => {
      const error = new Error('dup');
      error.code = 'P2002';
      throw error;
    };
    await expect(register({ prisma, app, email: 'a@b.c', password: 'password123' }))
      .rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
  });

  it('注册成功返回公开用户与令牌', async () => {
    const payload = await register({ prisma: prismaWithUser(null), app, email: 'a@b.c', password: 'password123' });
    expect(payload.user).toEqual({ id: 'u1', email: 'a@b.c', name: 'a' });
    expect(payload.accessToken).toBe('signed-token');
    expect(payload.refreshToken).toBeTruthy();
  });

  it('密码错误返回 401', async () => {
    const prisma = prismaWithUser({ id: 'u1', email: 'a@b.c', passwordHash: hashPassword('password123') });
    await expect(login({ prisma, app, email: 'a@b.c', password: 'wrong' }))
      .rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('publicUser 不泄漏 passwordHash', () => {
    expect(publicUser({ id: '1', email: 'e', name: 'n', passwordHash: 'x' })).toEqual({ id: '1', email: 'e', name: 'n' });
  });
});
