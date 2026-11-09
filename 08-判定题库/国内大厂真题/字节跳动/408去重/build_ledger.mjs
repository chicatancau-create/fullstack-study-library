import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCsv, toObjects } from './parse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..', '..');
const EXT = path.join(ROOT, '05-外部资料库', '题库', '公司高频题');
const INDEX = path.join(ROOT, '08-判定题库', '国内大厂真题', '字节跳动', '题目索引.json');

const SOURCES = [
  {
    name: 'krishnadey30',
    repo: 'https://github.com/krishnadey30/LeetCode-Questions-CompanyWise',
    dir: path.join(EXT, 'krishnadey30', 'LeetCode-Questions-CompanyWise'),
    match: (f) => /^bytedance.*\.csv$/i.test(f) || /^bytedancetoutiao.*\.csv$/i.test(f),
  },
  {
    name: 'liquidslr',
    repo: 'https://github.com/liquidslr/leetcode-company-wise-problems',
    dir: path.join(EXT, 'liquidslr', 'leetcode-company-wise-problems', 'ByteDance'),
    match: (f) => f.toLowerCase().endsWith('.csv'),
  },
  {
    name: 'snehasishroy',
    repo: 'https://github.com/snehasishroy/leetcode-companywise-interview-questions',
    dir: path.join(EXT, 'snehasishroy', 'leetcode-companywise-interview-questions', 'bytedance'),
    match: (f) => f.toLowerCase().endsWith('.csv'),
  },
];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function readSnapshot(metaPath) {
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

function pick(obj, keys) {
  for (const k of keys) if (obj[k]) return obj[k];
  return '';
}

function extractSlug(url) {
  const m = url.match(/leetcode(?:\.cn|\.com)\/problems\/([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : '';
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/[\s_\-.,:;!?'"()（）[\]【】/\\]+/g, '')
    .replace(/(缓存机制|缓存)/g, 'cache')
    .replace(/(链表)/g, 'list')
    .trim();
}

const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const indexBySlug = new Map();
const indexById = new Map();
for (const q of index) {
  const slug = extractSlug(q.leetcode || '');
  if (slug) indexBySlug.set(slug, q.id);
  const m = String(q.title).match(/^\s*(\d+)\./);
  if (m) indexById.set(m[1], q.id);
}

const ledger = [];
const manifestFiles = [];
const canonicalSeen = new Map();
let valid = 0;

for (const src of SOURCES) {
  if (!fs.existsSync(src.dir)) throw new Error(`源目录不存在: ${src.dir}`);
  const files = fs.readdirSync(src.dir).filter(src.match).sort();
  const snapshot = readSnapshot(path.join(src.dir, '..', '.source.json')) || readSnapshot(path.join(src.dir, '.source.json'));
  for (const file of files) {
    const abs = path.join(src.dir, file);
    const buf = fs.readFileSync(abs);
    const rows = toObjects(parseCsv(buf.toString('utf8')));
    manifestFiles.push({
      source: src.name,
      upstream: src.repo,
      file: path.relative(ROOT, abs).replace(/\\/g, '/'),
      snapshot: snapshot?.archive_sha256 || null,
      fetched: snapshot?.fetched || null,
      rows: rows.length,
      sha256: sha256(buf),
    });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const title = pick(r, ['Title', 'title', '题目']);
      const url = pick(r, ['Leetcode Question Link', 'Link', 'URL', 'url']);
      const rawId = pick(r, ['ID', 'Id', 'id']);
      const slug = extractSlug(url);
      const lcId = /^\d+$/.test(rawId) ? rawId : (slug ? '' : '');
      const canonical = lcId ? `lc:${lcId}` : slug ? `lc:${slug}` : title ? `title:${normalizeTitle(title)}` : '';
      const matchType = lcId ? 'leetcode-id' : slug ? 'slug' : title ? 'title-normalized' : 'none';
      if (canonical) valid++;
      const duplicateOf = canonical && canonicalSeen.has(canonical) ? canonicalSeen.get(canonical) : '';
      if (canonical && !canonicalSeen.has(canonical)) canonicalSeen.set(canonical, `${src.name}/${file}:${i + 2}`);
      const localId = (slug && indexBySlug.get(slug)) || (lcId && indexById.get(lcId)) || '';
      const decision = !canonical ? 'excluded' : duplicateOf ? 'excluded' : 'included';
      const reason = !canonical ? 'missing-title-and-id' : duplicateOf ? 'duplicate-of-earlier-record' : '';
      ledger.push({
        'raw-source': src.name,
        snapshot: snapshot?.archive_sha256 || '',
        file: path.relative(ROOT, abs).replace(/\\/g, '/'),
        row: i + 2,
        'raw-title': title,
        'leetcode-id': lcId || (slug ? '' : ''),
        slug,
        'canonical-id': canonical,
        'match-type': matchType,
        'duplicate-of': duplicateOf,
        'local-question-id': localId,
        'current-codetop-id': localId,
        decision,
        'exclusion-reason': reason,
      });
    }
  }
}

const unique = new Set(ledger.map((r) => r['canonical-id']).filter(Boolean));
const localHits = new Set(ledger.filter((r) => r['local-question-id']).map((r) => r['canonical-id']));
const matchedCurrent = new Set(ledger.map((r) => r['local-question-id']).filter(Boolean));
const unmatchedCurrent = index.filter((q) => !matchedCurrent.has(q.id)).map((q) => q.id);

// possible_alias：规范化标题相同但 canonical 不同的组
const byNorm = new Map();
for (const r of ledger) {
  if (!r['raw-title']) continue;
  const key = normalizeTitle(r['raw-title']);
  if (!byNorm.has(key)) byNorm.set(key, new Set());
  byNorm.get(key).add(r['canonical-id']);
}
const aliasGroups = [...byNorm.entries()].filter(([, set]) => set.size > 1);
const conflictGroups = [];
const byIdTitles = new Map();
for (const r of ledger) {
  if (!r['leetcode-id']) continue;
  const key = r['leetcode-id'];
  if (!byIdTitles.has(key)) byIdTitles.set(key, new Set());
  if (r['raw-title']) byIdTitles.get(key).add(normalizeTitle(r['raw-title']));
}
for (const [id, titles] of byIdTitles) if (titles.size > 1) conflictGroups.push({ id, titles: [...titles] });

const summary = {
  generated_at: new Date().toISOString(),
  scope: '字节跳动（bytedance）三个公开 CSV 集合，含各时间窗口文件；不含其他公司',
  five_counts: {
    raw_records: ledger.length,
    valid_records: valid,
    local_hit_rows: ledger.filter((r) => r['local-question-id']).length,
    unique_canonical: unique.size,
    evidence_backed_questions: 0,
    evidence_note: '尚无逐题牛客原始面经证据，当前全部为第三方聚合统计',
  },
  relation_to_codetop100: {
    already_present: [...localHits].length,
    new_from_csv: [...unique].filter((c) => !localHits.has(c)).length,
    possible_alias: aliasGroups.length,
    conflict: conflictGroups.length,
    unmatched_current: unmatchedCurrent.length,
    unmatched_csv: [...unique].filter((c) => !localHits.has(c)).length,
  },
  detail: { unmatched_current_ids: unmatchedCurrent, alias_samples: aliasGroups.slice(0, 5), conflicts: conflictGroups.slice(0, 5) },
  files: manifestFiles,
};

fs.mkdirSync(path.join(here, 'evidence'), { recursive: true });
const csvHeader = ['raw-source', 'snapshot', 'file', 'row', 'raw-title', 'leetcode-id', 'slug', 'canonical-id', 'match-type', 'duplicate-of', 'local-question-id', 'current-codetop-id', 'decision', 'exclusion-reason'];
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(here, 'dedupe-ledger.csv'), [csvHeader.join(','), ...ledger.map((r) => csvHeader.map((h) => esc(r[h])).join(','))].join('\n') + '\n');
fs.writeFileSync(path.join(here, 'input-manifest.json'), JSON.stringify({ generated_at: summary.generated_at, files: manifestFiles }, null, 2) + '\n');
fs.writeFileSync(path.join(here, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

console.log(`RAW=${ledger.length} VALID=${valid} UNIQUE=${unique.size} LOCAL_HITS=${localHits.size} UNMATCHED_CURRENT=${unmatchedCurrent.length}`);
console.log(`LEDGER_OK ${ledger.length === summary.five_counts.raw_records ? 'rows-match' : 'MISMATCH'}`);
