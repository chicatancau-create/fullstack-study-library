import fs from 'node:fs';
import { connect } from './db.mjs';

const QUERY = `
  SELECT id, tenant, kind, amount, created_at
  FROM e08.events
  WHERE tenant = 't1' AND kind = 'click'
  ORDER BY created_at DESC
  LIMIT 20
`;

const client = await connect();
try {
  const before = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${QUERY}`);
  const beforePlan = before.rows[0]['QUERY PLAN'][0];
  fs.writeFileSync('evidence/explain-before.json', JSON.stringify(beforePlan, null, 2) + '\n');

  await client.query('CREATE INDEX e08_events_tenant_kind_created_idx ON e08.events (tenant, kind, created_at DESC)');
  await client.query('ANALYZE e08.events');

  const after = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${QUERY}`);
  const afterPlan = after.rows[0]['QUERY PLAN'][0];
  fs.writeFileSync('evidence/explain-after.json', JSON.stringify(afterPlan, null, 2) + '\n');

  const beforeText = JSON.stringify(beforePlan);
  const afterText = JSON.stringify(afterPlan);
  const beforeSeq = /"Node Type":\s*"Seq Scan"/.test(beforeText);
  const afterIndex = afterText.includes('"Index Scan"') || afterText.includes('"Bitmap Heap Scan"') || afterText.includes('"Index Only Scan"');

  console.log(`before: seq_scan=${beforeSeq} execution_ms=${beforePlan['Execution Time']}`);
  console.log(`after: index_scan=${afterIndex} execution_ms=${afterPlan['Execution Time']}`);
  if (!beforeSeq || !afterIndex) {
    console.error('PLAN FAIL: 索引前后计划不符合预期');
    process.exitCode = 1;
  } else {
    console.log('PLAN PASS');
  }
} finally {
  await client.end();
}