import pg from 'pg';

export const pgConfig = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'study_lab',
};

export async function labConnect() {
  if (!pgConfig.password) throw new Error('缺少 PGPASSWORD');
  const client = new pg.Client(pgConfig);
  await client.connect();
  return client;
}

export async function labReset() {
  const client = await labConnect();
  try {
    await client.query('DROP SCHEMA IF EXISTS e11 CASCADE');
    await client.query('CREATE SCHEMA e11');
    await client.query(`
      CREATE TABLE e11.items (
        id serial PRIMARY KEY,
        tenant text NOT NULL,
        owner text NOT NULL,
        title text NOT NULL
      );
      CREATE TABLE e11.comments (
        id bigserial PRIMARY KEY,
        tenant text NOT NULL,
        body text NOT NULL
      );
      CREATE TABLE e11.audit (
        id bigserial PRIMARY KEY,
        event text NOT NULL,
        detail text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO e11.items (tenant, owner, title) VALUES
        ('t1', 'u1', 'A item'),
        ('t1', 'u2', 'A second'),
        ('t2', 'u3', 'B secret');
    `);
  } finally {
    await client.end();
  }
}
