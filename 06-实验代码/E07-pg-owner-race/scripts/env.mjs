import { connect } from '../src/db.mjs';

const client = await connect();
try {
  const version = await client.query('SELECT version() AS v, current_database() AS db, current_user AS usr');
  const iso = await client.query('SHOW transaction_isolation');
  console.log(version.rows[0].v);
  console.log(`db=${version.rows[0].db} user=${version.rows[0].usr} isolation=${iso.rows[0].transaction_isolation}`);
} finally {
  await client.end();
}