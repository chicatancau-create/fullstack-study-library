import { connect } from './db.mjs';

const client = await connect();
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
};

const schemas = {
  'N-1': { name: 'e08c_n1', ddl: 'CREATE TABLE e08c_n1.users (id serial PRIMARY KEY, name text NOT NULL)' },
  N: { name: 'e08c_n', ddl: 'CREATE TABLE e08c_n.users (id serial PRIMARY KEY, name text NOT NULL, email text)' },
  'N+1': { name: 'e08c_n1p', ddl: 'CREATE TABLE e08c_n1p.users (id serial PRIMARY KEY, name text NOT NULL, email text, email_norm text)' },
};

const apps = {
  old: {
    read: (table) => `SELECT id, name FROM ${table} ORDER BY id LIMIT 1`,
    write: (table, tag) => [`INSERT INTO ${table} (name) VALUES ($1)`, [`old-${tag}`]],
  },
  new: {
    read: (table) => `SELECT id, name, email FROM ${table} ORDER BY id LIMIT 1`,
    write: (table, tag) => [
      `INSERT INTO ${table} (name, email) VALUES ($1, $2)`,
      [`new-${tag}`, `new-${tag}@example.test`],
    ],
  },
};

// 预期：新应用读 N-1 的 email 列必然 42703；其余 10 个格子在兼容窗口内可用。
const expected = {
  old: { 'N-1': ['OK', 'OK'], N: ['OK', 'OK'], 'N+1': ['OK', 'OK'] },
  new: { 'N-1': ['42703', '42703'], N: ['OK', 'OK'], 'N+1': ['OK', 'OK'] },
};

try {
  for (const [version, schema] of Object.entries(schemas)) {
    await client.query(`DROP SCHEMA IF EXISTS ${schema.name} CASCADE`);
    await client.query(`CREATE SCHEMA ${schema.name}`);
    await client.query(schema.ddl);
    await client.query(`INSERT INTO ${schema.name}.users (name) VALUES ('seed-${version}')`);
  }

  let cells = 0;
  for (const appName of ['old', 'new']) {
    for (const [version, schema] of Object.entries(schemas)) {
      const table = `${schema.name}.users`;
      const outcome = [];
      for (const op of ['read', 'write']) {
        try {
          if (op === 'read') {
            await client.query(apps[appName].read(table));
          } else {
            const [sql, params] = apps[appName].write(table, version.replace('+', 'p'));
            await client.query(sql, params);
          }
          outcome.push('OK');
        } catch (error) {
          outcome.push(error.code || 'ERR');
        }
      }
      cells += 2;
      const ok = JSON.stringify(outcome) === JSON.stringify(expected[appName][version]);
      check(ok, `${appName} app vs schema ${version}: read=${outcome[0]} write=${outcome[1]}`);
    }
  }

  console.log(`matrix cells=${cells}`);
  console.log(failures === 0 ? 'COMPAT PASS' : 'COMPAT FAIL');
  if (failures > 0) process.exitCode = 1;
} finally {
  await client.end();
}
