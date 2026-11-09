import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const CORPUS_DIR = path.join(ROOT, '数据', 'corpus');

function listMarkdown(dir) {
  return fs
    .readdirSync(dir, { recursive: true })
    .filter((f) => String(f).endsWith('.md'))
    .map((f) => String(f).replace(/\\/g, '/'))
    .sort();
}

export function parseDocs() {
  const files = listMarkdown(CORPUS_DIR);
  return files.map((rel) => {
    const abs = path.join(CORPUS_DIR, rel);
    const raw = fs.readFileSync(abs, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!m) throw new Error(`bad front matter: ${rel}`);
    const meta = Object.fromEntries(
      m[1]
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const i = line.indexOf(':');
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
        }),
    );
    const body = m[2]
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('#'))
      .join('\n')
      .trim();
    return {
      docId: meta.id,
      tenant: meta.tenant,
      title: meta.title || '',
      version: meta.version || '',
      source: `数据/corpus/${rel}`,
      body,
    };
  });
}

export function chunkDoc(doc, maxChars = 220) {
  const sentences = doc.body
    .split(/[。！？\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && buf.length + s.length + 1 > maxChars) {
      chunks.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf}。${s}` : s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.map((content, ordinal) => ({ ...doc, ordinal, content }));
}

export function snapshotHash() {
  const h = crypto.createHash('sha256');
  for (const f of listMarkdown(CORPUS_DIR)) {
    h.update(f);
    h.update(fs.readFileSync(path.join(CORPUS_DIR, f)));
  }
  return h.digest('hex');
}

export function loadGolden() {
  return fs
    .readFileSync(path.join(ROOT, '数据', 'golden.jsonl'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
