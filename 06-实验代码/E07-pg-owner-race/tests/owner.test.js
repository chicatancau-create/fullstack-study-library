import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { connect, inventoryQty, ownerCount, reset } from '../src/db.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  await reset();
});

test('反例：两个 Owner 各自 count=2 后删除自己，最终 0 个 Owner', async () => {
  const c1 = await connect();
  const c2 = await connect();
  try {
    await c1.query('BEGIN');
    await c2.query('BEGIN');

    const a = await c1.query("SELECT count(*)::int AS n FROM e07.members WHERE workspace_id = 1 AND role = 'owner'");
    const b = await c2.query("SELECT count(*)::int AS n FROM e07.members WHERE workspace_id = 1 AND role = 'owner'");
    assert.equal(a.rows[0].n, 2);
    assert.equal(b.rows[0].n, 2);

    await c1.query("DELETE FROM e07.members WHERE workspace_id = 1 AND user_id = 'alice'");
    await c2.query("DELETE FROM e07.members WHERE workspace_id = 1 AND user_id = 'bob'");
    await c1.query('COMMIT');
    await c2.query('COMMIT');

    assert.equal(await ownerCount(1), 0); // 写偏差：最后 Owner 被移除
  } finally {
    await c1.end();
    await c2.end();
  }
});

test('修复：锁 workspace 父行后，第二个事务看到只剩 1 个 Owner 并回滚', async () => {
  const c1 = await connect();
  const c2 = await connect();
  try {
    await c1.query('BEGIN');
    await c2.query('BEGIN');

    await c1.query('SELECT id FROM e07.workspaces WHERE id = 1 FOR UPDATE');
    const lock2 = c2.query('SELECT id FROM e07.workspaces WHERE id = 1 FOR UPDATE');
    await sleep(50);

    const first = await c1.query("SELECT count(*)::int AS n FROM e07.members WHERE workspace_id = 1 AND role = 'owner'");
    assert.equal(first.rows[0].n, 2);
    await c1.query("DELETE FROM e07.members WHERE workspace_id = 1 AND user_id = 'alice'");
    await c1.query('COMMIT');

    await lock2; // 第二个事务拿到锁，READ COMMITTED 下重新看到已提交删除
    const second = await c2.query("SELECT count(*)::int AS n FROM e07.members WHERE workspace_id = 1 AND role = 'owner'");
    assert.equal(second.rows[0].n, 1);
    await c2.query('ROLLBACK'); // 删除 bob 会移除最后 Owner，拒绝

    assert.equal(await ownerCount(1), 1);
  } finally {
    await c1.end();
    await c2.end();
  }
});

test('库存：并发条件扣减不会为负', async () => {
  const c1 = await connect();
  const c2 = await connect();
  try {
    await c1.query('BEGIN');
    await c2.query('BEGIN');
    const first = await c1.query("UPDATE e07.inventory SET qty = qty - 1 WHERE sku = 'x' AND qty >= 1 RETURNING qty");
    const secondPromise = c2.query("UPDATE e07.inventory SET qty = qty - 1 WHERE sku = 'x' AND qty >= 1 RETURNING qty");
    await c1.query('COMMIT');
    const second = await secondPromise;
    await c2.query('COMMIT');

    assert.equal(first.rowCount, 1);
    assert.equal(second.rowCount, 0);
    assert.equal(await inventoryQty('x'), 0);
  } finally {
    await c1.end();
    await c2.end();
  }
});