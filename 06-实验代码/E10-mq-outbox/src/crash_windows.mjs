import http from 'node:http';
import assert from 'node:assert/strict';
import { connect, reset } from './db.mjs';
import { connectBroker, resetBroker, publish, getOne } from './broker.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const scenario = process.argv[2] || 'all';
let broker;

async function setup() {
  await reset();
  broker = await connectBroker();
  await resetBroker(broker.channel);
  return connect();
}

async function teardown() {
  if (broker) {
    await broker.channel.close().catch(() => {});
    await broker.connection.close().catch(() => {});
  }
}

async function phantom() {
  const client = await setup();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO e10.orders (id, amount) VALUES ('o-phantom', 10)");
    publish(broker.channel, { id: 'evt-phantom', orderId: 'o-phantom' });
    await sleep(100);
    await client.query('ROLLBACK');
    const message = await getOne(broker.channel);
    const order = await client.query("SELECT count(*)::int AS n FROM e10.orders WHERE id = 'o-phantom'");
    assert.ok(message, '幻影消息应已发布');
    assert.equal(order.rows[0].n, 0);
    broker.channel.ack(message);
    console.log(`naive publish-then-rollback: message=${message ? 'published' : 'none'} order_rows=${order.rows[0].n}`);

    await client.query('BEGIN');
    await client.query("INSERT INTO e10.orders (id, amount) VALUES ('o-rollback', 10)");
    await client.query("INSERT INTO e10.outbox (event_id, payload) VALUES ('evt-rollback', '{}')");
    await client.query('ROLLBACK');
    const outbox = await client.query("SELECT count(*)::int AS n FROM e10.outbox WHERE event_id = 'evt-rollback'");
    assert.equal(outbox.rows[0].n, 0);
    console.log('outbox: rolled-back event invisible, nothing to publish');
    console.log('PHANTOM PASS');
  } finally {
    await client.end();
  }
}

async function crash() {
  const client = await setup();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO e10.orders (id, amount) VALUES ('o-crash', 20)");
    await client.query(
      "INSERT INTO e10.outbox (event_id, payload) VALUES ('evt-crash', $1)",
      [JSON.stringify({ id: 'evt-crash', orderId: 'o-crash' })],
    );
    await client.query('COMMIT');
    const pendingBefore = await client.query('SELECT count(*)::int AS n FROM e10.outbox WHERE NOT published');
    assert.equal(pendingBefore.rows[0].n, 1);

    // relay 在发布前崩溃：关连接、不动 published
    await broker.channel.close();
    await broker.connection.close();
    broker = await connectBroker();

    const rows = (await client.query('SELECT payload FROM e10.outbox WHERE NOT published ORDER BY id')).rows;
    for (const row of rows) publish(broker.channel, row.payload);
    await client.query('UPDATE e10.outbox SET published = true WHERE NOT published');
    const message = await getOne(broker.channel);
    assert.ok(message, '恢复后应发布 pending 事件');
    broker.channel.ack(message);
    const pendingAfter = await client.query('SELECT count(*)::int AS n FROM e10.outbox WHERE NOT published');
    assert.equal(pendingAfter.rows[0].n, 0);
    console.log(`crash-after-commit: pending_before=1 pending_after=0 delivered=1`);
    console.log('CRASH PASS');
  } finally {
    await client.end();
  }
}

async function sideeffect() {
  let realCharges = 0;
  const ledger = new Map();
  const server = http.createServer((req, res) => {
    const key = req.headers['idempotency-key'];
    if (ledger.has(key)) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ chargeId: ledger.get(key), deduped: true }));
      return;
    }
    realCharges += 1;
    const chargeId = `ch_${realCharges}`;
    ledger.set(key, chargeId);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ chargeId, deduped: false }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const charge = async (key) => {
    const res = await fetch(`http://127.0.0.1:${port}/charge`, {
      method: 'POST',
      headers: { 'idempotency-key': key },
    });
    return res.json();
  };

  const client = await setup();
  try {
    const first = await charge('evt-charge');
    // 收到响应后、ack 前“崩溃”：消息重投，再次调用外部副作用
    const second = await charge('evt-charge');
    assert.equal(first.chargeId, second.chargeId);
    assert.equal(second.deduped, true);
    assert.equal(realCharges, 1);
    await client.query(
      "INSERT INTO e10.side_effects (event_id, note) VALUES ('evt-charge', $1)",
      [`charge:${first.chargeId}`],
    );
    const rows = await client.query('SELECT count(*)::int AS n FROM e10.side_effects');
    assert.equal(rows.rows[0].n, 1);
    console.log(`external-http: chargeId=${first.chargeId} redelivered_deduped=${second.deduped} real_charges=${realCharges}`);
    console.log('SIDEEFFECT PASS');
  } finally {
    await client.end();
    server.close();
  }
}

async function ordering() {
  const client = await setup();
  try {
    await client.query('CREATE TABLE e10.ordered (key text, version int, value text, PRIMARY KEY (key, version))');
    const applyVersion = async (key, version, value) => {
      const exists = await client.query('SELECT 1 FROM e10.ordered WHERE key = $1 AND version = $2', [key, version]);
      if (exists.rowCount) return 'duplicate';
      const last = (await client.query(
        'SELECT coalesce(max(version), 0)::int AS v FROM e10.ordered WHERE key = $1', [key],
      )).rows[0].v;
      if (version !== last + 1) return 'stale';
      await client.query('INSERT INTO e10.ordered (key, version, value) VALUES ($1, $2, $3)', [key, version, value]);
      return 'applied';
    };

    const events = [
      ['k1', 1], ['k1', 2], ['k1', 3], ['k2', 1], ['k4', 1],
    ];
    for (const [key, version] of events) {
      publish(broker.channel, { id: `${key}-${version}`, key, version });
    }
    const got = [];
    while (got.length < events.length) {
      const message = await getOne(broker.channel, 2000);
      if (!message) break;
      got.push(JSON.parse(message.content.toString()));
      broker.channel.ack(message);
    }
    const k1 = got.filter((e) => e.key === 'k1').sort((a, b) => a.version - b.version);
    const k1Outcomes = [];
    for (const event of k1) k1Outcomes.push(await applyVersion(event.key, event.version, String(event.version)));
    // 跨 key 并行：k2 与 k4 各自独立，可同时处理
    const crossKey = got.filter((e) => e.key === 'k2' || e.key === 'k4');
    const k2Outcomes = await Promise.all(crossKey.map((e) => applyVersion(e.key, e.version, String(e.version))));

    // 乱序重投：先到 v2（期望 v1），暂拒；v1 到达后接受
    const outOfOrder = await applyVersion('k3', 2, '2');
    const missing = await applyVersion('k3', 1, '1');
    // 重复重投：v1 再来一次
    const duplicate = await applyVersion('k1', 1, '1');
    const rows = await client.query('SELECT count(*)::int AS n FROM e10.ordered');

    assert.deepEqual(k1Outcomes, ['applied', 'applied', 'applied']);
    assert.deepEqual(k2Outcomes, ['applied', 'applied']);
    assert.equal(outOfOrder, 'stale');
    assert.equal(missing, 'applied');
    assert.equal(duplicate, 'duplicate');
    assert.equal(rows.rows[0].n, 6);
    console.log(`ordering: same-key=${k1Outcomes.join('/')} cross-key=${k2Outcomes.join('/')} out-of-order=${outOfOrder} then=${missing} redelivery=${duplicate} rows=${rows.rows[0].n}`);
    console.log('ORDER PASS');
  } finally {
    await client.end();
  }
}

const scenarios = { phantom, crash, sideeffect, ordering };
try {
  if (scenario === 'all') {
    for (const name of Object.keys(scenarios)) {
      await scenarios[name]();
      await teardown();
    }
  } else if (scenarios[scenario]) {
    await scenarios[scenario]();
  } else {
    throw new Error(`未知场景: ${scenario}`);
  }
} finally {
  await teardown();
}
