import { createPool } from './db.mjs';
import { buildApp } from './app.js';

const pool = createPool();
const app = buildApp({ pool, logger: true });
const port = Number(process.env.PORT || 8796);

await app.listen({ host: process.env.HOST || '127.0.0.1', port });
console.log(`project03 listening on http://${process.env.HOST || "127.0.0.1"}:${port}`);

async function shutdown(signal) {
  console.log(`${signal} received, closing`);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
