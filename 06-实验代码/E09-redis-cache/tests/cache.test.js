import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { command } from '../src/redis.mjs';

const PORT = Number(process.env.REDIS_PORT || 6379);
const key = (name) => `e09:${name}`;

async function cleanup() {
  const keys = await command(PORT, 'KEYS', 'e09:*');
  if (Array.isArray(keys) && keys.length > 0) await command(PORT, 'DEL', ...keys);
}

beforeEach(cleanup);

test('Redis 基本读写与删除（真实服务）', async () => {
  assert.equal(await command(PORT, 'PING'), 'PONG');
  assert.equal(await command(PORT, 'SET', key('basic'), '1'), 'OK');
  assert.equal(await command(PORT, 'GET', key('basic')), '1');
  assert.equal(await command(PORT, 'DEL', key('basic')), 1);
  assert.equal(await command(PORT, 'GET', key('basic')), null);
});

test('Cache Aside：miss 回源并写入，第二次命中', async () => {
  const db = new Map([['1', { value: 'old' }]]);
  async function read(id) {
    const cacheKey = key(`item:${id}`);
    const cached = await command(PORT, 'GET', cacheKey);
    if (cached !== null) return { value: cached, hit: true };
    const row = db.get(id);
    if (!row) return { value: null, hit: false };
    await command(PORT, 'SET', cacheKey, row.value, 'EX', '60');
    return { value: row.value, hit: false };
  }

  assert.deepEqual(await read('1'), { value: 'old', hit: false });
  assert.deepEqual(await read('1'), { value: 'old', hit: true });
});

test('反例：旧读晚写回，缓存出现陈旧值', async () => {
  const cacheKey = key('stale');
  await command(PORT, 'DEL', cacheKey);
  const db = { value: 'old' };

  const readerOld = db.value; // reader 在写者之前读到 old
  db.value = 'new'; // writer 更新 DB
  await command(PORT, 'DEL', cacheKey); // writer 删缓存
  await command(PORT, 'SET', cacheKey, readerOld, 'EX', '60'); // reader 晚写回 old

  assert.equal(await command(PORT, 'GET', cacheKey), 'old');
  assert.equal(db.value, 'new');
});

test('修复：版本化缓存键，旧版本写回不会被新读命中', async () => {
  const db = { value: 'old', version: 1 };
  const v1 = key(`item:1:v${db.version}`);
  await command(PORT, 'SET', v1, db.value, 'EX', '60');

  db.value = 'new';
  db.version = 2;
  const v2 = key(`item:1:v${db.version}`);
  await command(PORT, 'SET', v2, db.value, 'EX', '60');
  await command(PORT, 'DEL', v1);

  // 迟到的旧 reader 写回 v1，但新 reader 只读 v2
  await command(PORT, 'SET', v1, 'old', 'EX', '60');
  assert.equal(await command(PORT, 'GET', v2), 'new');
});

test('Redis 不可用：读路径可降级到 DB，并标记 degraded', async () => {
  const db = { value: 'from-db' };
  async function readWithFallback() {
    try {
      const cached = await command(6399, 'GET', key('down'));
      if (cached !== null) return { value: cached, degraded: false };
      return { value: db.value, degraded: false };
    } catch {
      return { value: db.value, degraded: true };
    }
  }
  assert.deepEqual(await readWithFallback(), { value: 'from-db', degraded: true });
});