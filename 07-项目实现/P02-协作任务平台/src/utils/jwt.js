import { randomBytes } from 'node:crypto';
import { sha256 } from './password.js';

export function signAccess(app, user) {
  return app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '15m' });
}

export async function issueRefreshToken(prisma, userId, ttlMs = 7 * 24 * 3600 * 1000) {
  const raw = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(raw), expiresAt } });
  return raw;
}

export async function rotateRefreshToken(prisma, raw, ttlMs = 7 * 24 * 3600 * 1000) {
  if (!raw) return null;
  const tokenHash = sha256(raw);
  const next = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      UPDATE "RefreshToken"
         SET "revokedAt" = NOW()
       WHERE "tokenHash" = ${tokenHash}
         AND "revokedAt" IS NULL
         AND "expiresAt" > NOW()
      RETURNING "userId"
    `;
    if (!rows.length) return null;
    const userId = rows[0].userId;
    await tx.refreshToken.create({ data: { userId, tokenHash: sha256(next), expiresAt } });
    return { userId, refreshToken: next };
  });
}
