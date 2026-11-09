import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildLabApp } from '../src/security_lab.mjs';
import { labReset } from '../src/lab_db.mjs';

const ZAP_HOME = process.env.ZAP_HOME || 'D:/ZAP/ZAP_2.17.0';
const PORT = Number(process.env.ZAP_TARGET_PORT || 4789);
const OUT = 'evidence/zap-report.xml';
fs.mkdirSync('evidence', { recursive: true });

await labReset();
const app = buildLabApp();
await app.listen({ port: PORT, host: '127.0.0.1' });
const target = `http://127.0.0.1:${PORT}/scan`;

try {
  console.log(`zap target=${target}`);
  const result = spawnSync(`${ZAP_HOME}/zap.bat`, [
    '-cmd', '-quickurl', target, '-quickout', OUT, '-quickprogress',
  ], { cwd: ZAP_HOME, encoding: 'utf8', timeout: 420000, windowsHide: true });
  console.log(`zap exit=${result.status}`);
  if (result.status !== 0 && !fs.existsSync(OUT)) {
    console.error(String(result.stderr).slice(0, 1000));
    process.exitCode = 1;
  }
} finally {
  await app.close();
}

if (!fs.existsSync(OUT)) {
  console.error('ZAP report missing');
  process.exit(1);
}
const xml = fs.readFileSync(OUT, 'utf8');
const items = [...xml.matchAll(/<alertitem>([\s\S]*?)<\/alertitem>/g)].map((match) => {
  const body = match[1];
  const name = (body.match(/<alert>([\s\S]*?)<\/alert>/) || [])[1] || 'unknown';
  const risk = (body.match(/<riskcode>([\s\S]*?)<\/riskcode>/) || [])[1] || '?';
  return { name: name.trim(), risk };
});
const byRisk = items.reduce((acc, item) => {
  acc[item.risk] = (acc[item.risk] || 0) + 1;
  return acc;
}, {});
const unique = [...new Set(items.map((item) => `${item.risk}:${item.name}`))].sort();
const lines = [
  `captured_at: ${new Date().toISOString()}`,
  `zap_home: ${ZAP_HOME}`,
  `target: ${target}`,
  `alerts: ${items.length}`,
  `by_risk: ${JSON.stringify(byRisk)}`,
  `unique: ${unique.join(' | ') || '(none)'}`,
  `report: ${OUT}`,
];
fs.writeFileSync('evidence/zap.txt', lines.join('\n') + '\n');
console.log(lines.join('\n'));
if (items.length === 0) {
  console.error('ZAP found no alerts; scan may not have covered the target');
  process.exitCode = 1;
} else {
  console.log('ZAP PASS');
}
