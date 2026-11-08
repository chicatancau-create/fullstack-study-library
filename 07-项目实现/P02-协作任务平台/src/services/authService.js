import { HttpError } from '../utils/errors.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccess, issueRefreshToken, rotateRefreshToken } from '../utils/jwt.js';

const MIN_PASSWORD = 8;

export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

export async function register({ prisma, app, email, password, name }) {
  if (!email || !password || password.length < MIN_PASSWORD) {
    throw new HttpError(400, `email 与至少 ${MIN_PASSWORD} 位 password 必填`, 'INVALID_INPUT');
  }
  let user;
  try {
    user = await prisma.user.create({
      data: { email, name: name || email.split('@')[0], passwordHash: hashPassword(password) },
    });
  } catch (error) {
    if (error.code === 'P2002') throw new HttpError(409, '邮箱已注册', 'EMAIL_TAKEN');
    throw error;
  }
  const refreshToken = await issueRefreshToken(prisma, user.id);
  return { user: publicUser(user), accessToken: signAccess(app, user), refreshToken };
}

export async function login({ prisma, app, email, password }) {
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || !verifyPassword(password || '', user.passwordHash)) {
    throw new HttpError(401, '邮箱或密码错误', 'INVALID_CREDENTIALS');
  }
  const refreshToken = await issueRefreshToken(prisma, user.id);
  return { user: publicUser(user), accessToken: signAccess(app, user), refreshToken };
}

export async function refresh({ prisma, app, refreshToken }) {
  const rotated = await rotateRefreshToken(prisma, refreshToken);
  if (!rotated) throw new HttpError(401, 'refresh token 无效或已使用', 'INVALID_REFRESH');
  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  return { accessToken: signAccess(app, user), refreshToken: rotated.refreshToken };
}
