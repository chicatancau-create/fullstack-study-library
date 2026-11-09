import pg from 'pg';

export const config = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'study_lab',
};

if (!config.password) {
  throw new Error('缺少 PGPASSWORD（本地合成库凭据只从环境变量读取）');
}

export async function connect() {
  const client = new pg.Client(config);
  await client.connect();
  return client;
}

export async function reset() {
  const client = await connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS e07 CASCADE');
    await client.query('CREATE SCHEMA e07');
    await client.query(`
      CREATE TABLE e07.workspaces (
        id serial PRIMARY KEY,
        name text NOT NULL
      );
      CREATE TABLE e07.members (
        workspace_id integer NOT NULL REFERENCES e07.workspaces(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        role text NOT NULL CHECK (role IN ('owner', 'member')),
        PRIMARY KEY (workspace_id, user_id)
      );
      CREATE TABLE e07.inventory (
        sku text PRIMARY KEY,
        qty integer NOT NULL CHECK (qty >= 0)
      );
      CREATE TABLE e07.on_call (
        name text PRIMARY KEY,
        on_call boolean NOT NULL
      );
    `);
    await client.query("INSERT INTO e07.workspaces (name) VALUES ('demo')");
    await client.query(
      "INSERT INTO e07.members (workspace_id, user_id, role) VALUES (1, 'alice', 'owner'), (1, 'bob', 'owner')",
    );
    await client.query("INSERT INTO e07.inventory (sku, qty) VALUES ('x', 1), ('y', 1)");
    await client.query("INSERT INTO e07.on_call (name, on_call) VALUES ('alice', true), ('bob', true)");
  } finally {
    await client.end();
  }
}

export async function ownerCount(workspaceId = 1) {
  const client = await connect();
  try {
    const result = await client.query(
      "SELECT count(*)::int AS n FROM e07.members WHERE workspace_id = $1 AND role = 'owner'",
      [workspaceId],
    );
    return result.rows[0].n;
  } finally {
    await client.end();
  }
}

export async function inventoryQty(sku = 'x') {
  const client = await connect();
  try {
    const result = await client.query('SELECT qty FROM e07.inventory WHERE sku = $1', [sku]);
    return result.rows[0]?.qty ?? null;
  } finally {
    await client.end();
  }
}