import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function signAccess(app, user) {
  return app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '15m' });
}

export async function issueRefreshToken(prisma, userId, ttlMs = 7 * 24 * 3600 * 1000) {
  const raw = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(raw), expiresAt } });
  return raw;
}

export async function rotateRefreshToken(prisma, raw, ttlMs) {
  const tokenHash = sha256(raw || '');
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!record || record.revokedAt || record.expiresAt <= new Date()) return null;
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  const next = await issueRefreshToken(prisma, record.userId, ttlMs);
  return { userId: record.userId, refreshToken: next };
}
