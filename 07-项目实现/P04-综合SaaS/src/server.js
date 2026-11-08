import { createPool } from './db.mjs';
import { buildApp } from './app.js';
import { createRedis, createLoginLimiter } from './rate_limit.mjs';

const pool = createPool();
let redis = null;
let loginLimiter = null;
try {
  redis = createRedis();
  await redis.connect();
  loginLimiter = createLoginLimiter(redis, {
    capacity: Number(process.env.P04_LOGIN_LIMIT || 20),
    refillPerSec: 0.2,
  });
  console.log('redis: login rate limiter enabled');
} catch (error) {
  console.error(`redis unavailable, login rate limit disabled: ${error.message}`);
  redis = null;
}

const app = buildApp({ pool, logger: true, loginLimiter });
const port = Number(process.env.PORT || 8797);

await app.listen({ host: process.env.HOST || '127.0.0.1', port });
console.log(`project04 listening on http://${process.env.HOST || "127.0.0.1"}:${port}`);

async function shutdown(signal) {
  console.log(`${signal} received, closing`);
  await app.close();
  if (redis) await redis.quit();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
