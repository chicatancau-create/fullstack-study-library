import pg from 'pg';
import fs from 'node:fs';

const password = process.env.PGPASSWORD;
if (!password) {
  console.error('需要 PGPASSWORD（只从环境变量读取）');
  process.exit(2);
}

const config = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password,
  database: process.env.PGDATABASE || 'study_lab',
};

const results = [];
const evidence = { captured_at: new Date().toISOString(), checks: [] };
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  evidence.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const c = new pg.Client(config);
await c.connect();
await c.query("SELECT set_config('app.tenant_id', '1', false), set_config('app.user_id', '1', false), set_config('app.role', 'member', false)");

async function asTenant(tenantId, userId, role, fn) {
  await c.query('BEGIN');
  await c.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
  await c.query("SELECT set_config('app.user_id', $1, true)", [userId]);
  await c.query("SELECT set_config('app.role', $1, true)", [role]);
  try {
    const out = await fn();
    await c.query('COMMIT');
    return out;
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

try {
  await c.query('DROP SCHEMA IF EXISTS backend30_b CASCADE');
  await c.query('CREATE SCHEMA backend30_b');
  await c.query(`
    CREATE TABLE backend30_b.tenants (id int PRIMARY KEY, name text NOT NULL);
    CREATE TABLE backend30_b.users (
      id int PRIMARY KEY, tenant_id int NOT NULL REFERENCES backend30_b.tenants(id),
      name text NOT NULL, email text NOT NULL, role text NOT NULL CHECK (role IN ('member','admin'))
    );
    CREATE TABLE backend30_b.tasks (
      id int PRIMARY KEY, tenant_id int NOT NULL REFERENCES backend30_b.tenants(id),
      owner_id int NOT NULL REFERENCES backend30_b.users(id),
      title text NOT NULL, status text NOT NULL DEFAULT 'open', internal_note text
    );
    CREATE TABLE backend30_b.audit (
      id bigserial PRIMARY KEY, tenant_id int NOT NULL, actor text NOT NULL, action text NOT NULL, allowed boolean NOT NULL
    );
    INSERT INTO backend30_b.tenants VALUES (1, 'tenant-a'), (2, 'tenant-b');
    INSERT INTO backend30_b.users VALUES
      (1, 1, 'alice', 'alice@example.com', 'member'),
      (2, 1, 'bob', 'bob@example.com', 'member'),
      (3, 1, 'root', 'root@example.com', 'admin'),
      (4, 2, 'carol', 'carol@example.com', 'member');
    INSERT INTO backend30_b.tasks VALUES
      (1, 1, 1, 't1', 'open', 'secret-a1'),
      (2, 1, 2, 't2', 'open', 'secret-a2'),
      (3, 1, 1, 't3', 'open', 'secret-a3'),
      (4, 2, 4, 't4', 'open', 'secret-b1'),
      (5, 2, 4, 't5', 'open', 'secret-b2');
  `);

  await c.query(`
    ALTER TABLE backend30_b.tasks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE backend30_b.tasks FORCE ROW LEVEL SECURITY;
    ALTER TABLE backend30_b.users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE backend30_b.users FORCE ROW LEVEL SECURITY;
    CREATE POLICY tasks_tenant ON backend30_b.tasks
      USING (tenant_id = current_setting('app.tenant_id', true)::int)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::int);
    CREATE POLICY tasks_owner_or_admin ON backend30_b.tasks AS RESTRICTIVE FOR UPDATE
      USING (
        owner_id = current_setting('app.user_id', true)::int
        OR current_setting('app.role', true) = 'admin'
      );
    CREATE POLICY users_tenant ON backend30_b.users
      USING (tenant_id = current_setting('app.tenant_id', true)::int)
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::int);
    CREATE VIEW backend30_b.tasks_public AS
      SELECT id, title, status FROM backend30_b.tasks WHERE tenant_id = current_setting('app.tenant_id', true)::int;
    CREATE VIEW backend30_b.users_masked AS
      SELECT id, name,
        regexp_replace(email, '^(.).*(@.*)$', '\\1***\\2') AS email_masked,
        role
      FROM backend30_b.users WHERE tenant_id = current_setting('app.tenant_id', true)::int;
    CREATE FUNCTION backend30_b.is_admin() RETURNS boolean
      LANGUAGE sql STABLE AS $$
        SELECT current_setting('app.role', true) = 'admin'
      $$;
  `);

  // B01 资源读取授权：跨租户读取不可见
  const b01 = await asTenant(1, 1, 'member', async () => {
    const rows = (await c.query('SELECT id FROM backend30_b.tasks ORDER BY id')).rows.map((r) => r.id);
    return rows;
  });
  check('B01 跨租户读取被 RLS 过滤', b01.join(',') === '1,2,3', `ids=${b01.join(',')}`);

  // B02 过滤可见任务
  const b02 = await asTenant(1, 2, 'member', async () => {
    const rows = (await c.query('SELECT id FROM backend30_b.tasks WHERE owner_id = 2')).rows.map((r) => r.id);
    return rows;
  });
  check('B02 仅返回本租户且属于该 Owner 的任务', b02.join(',') === '2', `ids=${b02.join(',')}`);

  // B03 字段级权限：公开视图不含内部备注
  const b03cols = (await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'backend30_b' AND table_name = 'tasks_public' ORDER BY ordinal_position
  `)).rows.map((r) => r.column_name);
  let b03err = null;
  try {
    await asTenant(1, 1, 'member', () => c.query('SELECT internal_note FROM backend30_b.tasks_public'));
  } catch (error) {
    b03err = error.code;
  }
  check('B03 公开视图隐藏 internal_note', !b03cols.includes('internal_note') && b03err === '42703', `cols=${b03cols.join(',')} err=${b03err}`);

  // B04 强制注入租户过滤：写入别人租户被 WITH CHECK 拒绝
  let b04err = null;
  try {
    await asTenant(1, 1, 'member', () => c.query(
      "INSERT INTO backend30_b.tasks (id, tenant_id, owner_id, title) VALUES (99, 2, 4, 'forged')",
    ));
  } catch (error) {
    b04err = error.code;
  }
  check('B04 WITH CHECK 拒绝跨租户写入（42501）', b04err === '42501', `err=${b04err}`);

  // B05 Owner 或 Admin
  const bobRows = await asTenant(1, 2, 'member', async () => {
    const r = await c.query("UPDATE backend30_b.tasks SET title = 'bob-edit' WHERE id = 1");
    return r.rowCount;
  });
  const aliceRows = await asTenant(1, 1, 'member', async () => {
    const r = await c.query("UPDATE backend30_b.tasks SET title = 'alice-edit' WHERE id = 1");
    return r.rowCount;
  });
  const adminRows = await asTenant(1, 3, 'admin', async () => {
    const r = await c.query("UPDATE backend30_b.tasks SET title = 'admin-edit' WHERE id = 1");
    return r.rowCount;
  });
  check('B05 Owner 可改、他人不可改、Admin 可改', bobRows === 0 && aliceRows === 1 && adminRows === 1, `bob=${bobRows} alice=${aliceRows} admin=${adminRows}`);

  // B06 敏感字段脱敏
  const b06 = await asTenant(1, 1, 'member', async () => {
    const r = await c.query("SELECT email_masked FROM backend30_b.users_masked WHERE name = 'alice'");
    return r.rows[0]?.email_masked;
  });
  check('B06 邮箱脱敏视图', b06 === 'a***@example.com', `masked=${b06}`);

  // B07 角色判断
  const memberAdmin = await asTenant(1, 1, 'member', async () => (await c.query('SELECT backend30_b.is_admin() AS v')).rows[0].v);
  const adminAdmin = await asTenant(1, 3, 'admin', async () => (await c.query('SELECT backend30_b.is_admin() AS v')).rows[0].v);
  check('B07 is_admin() 按会话角色返回', memberAdmin === false && adminAdmin === true, `member=${memberAdmin} admin=${adminAdmin}`);

  // B08 拒绝访问审计
  await asTenant(1, 1, 'member', async () => {
    let denied = false;
    try {
      await c.query("UPDATE backend30_b.tasks SET title = 'x' WHERE id = 2");
    } catch {
      denied = true;
    }
    if (!denied) {
      const r = await c.query("UPDATE backend30_b.tasks SET title = 'x' WHERE id = 2");
      denied = r.rowCount === 0;
    }
    await c.query(
      "INSERT INTO backend30_b.audit (tenant_id, actor, action, allowed) VALUES (1, 'alice', 'update_task:2', $1)",
      [!denied],
    );
    return denied;
  });
  const audit = (await c.query("SELECT allowed FROM backend30_b.audit WHERE actor = 'alice'")).rows[0];
  check('B08 拒绝访问写入审计记录', audit?.allowed === false, `allowed=${audit?.allowed}`);

  evidence.final = {
    tenants_seen: b01.length,
    visible_tasks: (await c.query('SELECT count(*)::int AS n FROM backend30_b.tasks')).rows[0].n,
  };
} finally {
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/rls.json', JSON.stringify(evidence, null, 2) + '\n');
  await c.end().catch(() => {});
}

const failures = results.filter((r) => !r.ok).length;
console.log(failures === 0 ? `BACKEND30-B PASS ${results.length}/${results.length}` : `BACKEND30-B FAIL ${failures}/${results.length}`);
if (failures > 0) process.exitCode = 1;
