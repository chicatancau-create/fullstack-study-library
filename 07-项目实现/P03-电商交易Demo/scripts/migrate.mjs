import fs from 'node:fs';
import path from 'node:path';
import { createPool } from '../src/db.mjs';

const dir = path.resolve('migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const pool = createPool();
try {
  await pool.query('CREATE SCHEMA IF NOT EXISTS p03');
  await pool.query(`CREATE TABLE IF NOT EXISTS p03.schema_migrations (
    filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM p03.schema_migrations WHERE filename = $1', [file]);
    if (done.rowCount > 0) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO p03.schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'p03' ORDER BY tablename");
  console.log(`p03 tables=${tables.rows.map((r) => r.tablename).join(',')}`);
} finally {
  await pool.end();
}
