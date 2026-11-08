import fs from 'node:fs';
import pg from 'pg';
import { pgConfig } from './db.mjs';
import { connectBroker, resetBroker, publish, QUEUE } from './broker.mjs';

const TOTAL = 1000;
const PREFETCH = 20;
const db = new pg.Pool(pgConfig);
const { connection, channel } = await connectBroker();
const publisher = await connection.createConfirmChannel();
const lines = [];
const log = (line = '') => {
  lines.push(line);
  console.log(line);
};

async function resetDb() {
  await db.query('DROP SCHEMA IF EXISTS e10 CASCADE');
  await db.query('CREATE SCHEMA e10');
  await db.query(`
    CREATE TABLE e10.inbox (event_id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE e10.side_effects (id bigserial PRIMARY KEY, event_id text NOT NULL, note text NOT NULL);
  `);
}

function event(index) {
  return { id: `backlog-${index}`, amount: 1, note: 'replay-test' };
}

async function publishBatch(start, count) {
  const started = process.hrtime.bigint();
  for (let i = start; i < start + count; i++) publish(publisher, event(i));
  await publisher.waitForConfirms();
  return Number(process.hrtime.bigint() - started) / 1e6;
}

async function consume(count, mode) {
  let handled = 0;
  let duplicates = 0;
  const started = process.hrtime.bigint();
  const tag = `e10-${mode}-${Date.now()}`;
  const done = new Promise((resolve) => {
    channel.consume(QUEUE, async (message) => {
      if (!message) return;
      const payload = JSON.parse(message.content.toString());
      const inserted = await db.query(
        'INSERT INTO e10.inbox (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
        [payload.id],
      );
      if (inserted.rowCount === 1) {
        await db.query('INSERT INTO e10.side_effects (event_id, note) VALUES ($1, $2)', [payload.id, mode]);
      } else {
        duplicates++;
      }
      channel.ack(message);
      handled++;
      if (handled === count) resolve();
    }, { noAck: false, consumerTag: tag });
  });
  await done;
  await channel.cancel(tag);
  return { handled, duplicates, ms: Number(process.hrtime.bigint() - started) / 1e6 };
}

try {
  await resetDb();
  await resetBroker(channel);
  channel.on('error', () => {});
  await channel.prefetch(PREFETCH);

  const publishMs = await publishBatch(0, TOTAL);
  const queued = await channel.checkQueue(QUEUE);
  log(`published=${TOTAL} publish_ms=${publishMs.toFixed(0)} queued_before_consume=${queued.messageCount}`);

  const first = await consume(TOTAL, 'first');
  const afterFirst = await channel.checkQueue(QUEUE);
  const inboxAfterFirst = (await db.query('SELECT count(*)::int AS n FROM e10.inbox')).rows[0].n;
  const effectsAfterFirst = (await db.query('SELECT count(*)::int AS n FROM e10.side_effects')).rows[0].n;
  log(`first_consume_ms=${first.ms.toFixed(0)} handled=${first.handled} duplicates=${first.duplicates}`);
  log(`after_first queued=${afterFirst.messageCount} inbox=${inboxAfterFirst} side_effects=${effectsAfterFirst}`);

  const replayPublishMs = await publishBatch(0, TOTAL);
  const second = await consume(TOTAL, 'replay');
  const afterReplay = await channel.checkQueue(QUEUE);
  const inboxAfterReplay = (await db.query('SELECT count(*)::int AS n FROM e10.inbox')).rows[0].n;
  const effectsAfterReplay = (await db.query('SELECT count(*)::int AS n FROM e10.side_effects')).rows[0].n;
  log(`replay_publish_ms=${replayPublishMs.toFixed(0)} replay_consume_ms=${second.ms.toFixed(0)} handled=${second.handled} duplicates=${second.duplicates}`);
  log(`after_replay queued=${afterReplay.messageCount} inbox=${inboxAfterReplay} side_effects=${effectsAfterReplay}`);

  const ok = queued.messageCount === TOTAL
    && first.handled === TOTAL && first.duplicates === 0
    && afterFirst.messageCount === 0 && inboxAfterFirst === TOTAL && effectsAfterFirst === TOTAL
    && second.handled === TOTAL && second.duplicates === TOTAL
    && afterReplay.messageCount === 0 && inboxAfterReplay === TOTAL && effectsAfterReplay === TOTAL;
  log(`duplicate_side_effects_blocked=${effectsAfterReplay === TOTAL ? 'YES' : 'FAIL'}`);
  log(ok ? 'BACKLOG_REPLAY PASS' : 'BACKLOG_REPLAY FAIL');
  if (!ok) process.exitCode = 1;
} finally {
  await publisher.close().catch(() => {});
  await channel.close().catch(() => {});
  await connection.close().catch(() => {});
  await db.end().catch(() => {});
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/backlog_replay.txt', lines.join('\n') + '\n');
}
