import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, 'evidence', 'interview-evidence.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const soft404 = ['页面不存在', '内容不存在', '仅作者可见', '该内容已被删除'];

let failures = 0;
for (const r of data.records) {
  const res = await fetch(r.url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const html = await res.text();
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const hit = soft404.filter((k) => html.includes(k));
  const ok = res.status === 200 && title.includes(r.title) && hit.length === 0;
  r.link_check = {
    checked_at: new Date().toISOString(),
    http_status: res.status,
    title_seen: title,
    soft404_markers: hit,
    ok,
  };
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${r.id} http=${res.status} title=${title}`);
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(failures === 0 ? `EVIDENCE-LINKCHECK PASS ${data.records.length}/${data.records.length}` : `EVIDENCE-LINKCHECK FAIL ${failures}/${data.records.length}`);
if (failures > 0) process.exitCode = 1;
