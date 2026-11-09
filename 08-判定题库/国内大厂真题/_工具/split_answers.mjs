import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANSWERS } from './answers-data.mjs';
import { ANSWERS2 } from './answers-data-2.mjs';
import { ANSWERS3 } from './answers-data-3.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK = path.resolve(here, '..');
const ANSWERS_DIR = path.join(BANK, '字节跳动', '答案');
fs.mkdirSync(ANSWERS_DIR, { recursive: true });

for (const a of [...ANSWERS, ...ANSWERS2, ...ANSWERS3]) {
  fs.writeFileSync(path.join(ANSWERS_DIR, `${a.id}.json`), JSON.stringify(a, null, 2) + '\n');
}

const indexFile = path.join(BANK, '字节跳动', '题目索引.json');
const list = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
const published = new Set([...ANSWERS, ...ANSWERS2, ...ANSWERS3].map((a) => a.id));
for (const q of list) {
  if (published.has(q.id)) {
    q.answer_file = `答案/${q.id}.json`;
    q.answer_status = 'published';
  } else if (!q.answer_status) {
    q.answer_status = 'pending';
  }
}
fs.writeFileSync(indexFile, JSON.stringify(list, null, 2) + '\n');

fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
fs.writeFileSync(
  path.join(here, 'evidence', 'answers-index.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), published: ANSWERS.length + ANSWERS2.length + ANSWERS3.length, pending: list.length - ANSWERS.length, ids: [...published] }, null, 2) + '\n',
);
console.log(`ANSWERS published=${ANSWERS.length + ANSWERS2.length + ANSWERS3.length} pending=${list.length - ANSWERS.length}`);
