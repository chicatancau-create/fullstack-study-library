import pg from 'pg';

export const config = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'study',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'study_lab',
};

if (!config.password) throw new Error('缺少 PGPASSWORD');

export async function connect() {
  const client = new pg.Client(config);
  await client.connect();
  return client;
}

export const PG_BIN = process.env.PGBIN || 'D:/PostgreSQL/18/bin';