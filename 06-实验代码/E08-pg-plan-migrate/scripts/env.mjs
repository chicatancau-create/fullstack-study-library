import { connect } from '../src/db.mjs';

const client = await connect();
try {
  const version = await client.query('SELECT version() AS v');
  console.log(version.rows[0].v);
} finally {
  await client.end();
}