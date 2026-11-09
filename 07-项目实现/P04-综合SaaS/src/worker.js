import Fastify from 'fastify';
import { createPool } from './db.mjs';
import { processJobs } from './jobs.mjs';

const pool = createPool();
const app = Fastify({ logger: false });
let last = null;
app.get('/health', async () => ({ status: 'ok', last }));
app.get('/ready', async (_request, reply) => {
  try { await pool.query('SELECT 1'); return { status: 'ready' }; } catch { return reply.code(503).send({ status: 'unavailable' }); }
});

const port = Number(process.env.WORKER_PORT || 8798);
const interval = Number(process.env.JOB_INTERVAL_MS || 500);
let running = true;
let timer;
async function loop() {
  if (!running) return;
  try { last = await processJobs(pool, { limit: Number(process.env.JOB_BATCH || 5) }); }
  catch (error) { last = { error: error.message }; }
  if (running) timer = setTimeout(loop, interval);
}
await app.listen({ port, host: '0.0.0.0' });
void loop();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    running = false;
    clearTimeout(timer);
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
