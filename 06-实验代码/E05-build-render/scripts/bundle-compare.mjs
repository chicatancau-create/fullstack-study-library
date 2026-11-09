// E05 bundle 对照：同一 LabPanel，静态引入 vs React.lazy 动态引入。
// 两套构建都开启 minify + sourcemap，按入口 chunk 的 raw/gzip 字节同口径比较。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = process.cwd();
const outRoot = path.join(root, '.evidence-build');
const DEAD_MARKER = 'UNUSED_MARKER_7f3a';
const ENTRY_GZIP_BUDGET = 150_000;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const gzip = (buffer) => zlib.gzipSync(buffer, { level: 9 }).length;

async function bundle(label, input, outDir) {
  await build({
    root,
    configFile: false,
    plugins: [react()],
    logLevel: 'error',
    build: { outDir, emptyOutDir: true, sourcemap: true, minify: 'esbuild', rollupOptions: { input: path.join(root, input) } },
  });
  const htmlName = fs.readdirSync(outDir).find((name) => name.endsWith('.html'));
  assert.ok(htmlName, `${label}: 未生成 HTML`);
  const html = fs.readFileSync(path.join(outDir, htmlName), 'utf8');
  const src = html.match(/src="\/?([^"]+\.js)"/)?.[1];
  assert.ok(src, `${label}: index.html 未引用 JS`);
  const files = walk(outDir).map((file) => {
    const rel = path.relative(outDir, file).replace(/\\/g, '/');
    const buffer = fs.readFileSync(file);
    return { path: rel, bytes: buffer.length, gzip: rel.endsWith('.js') ? gzip(buffer) : 0, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  });
  const js = files.filter((f) => f.path.endsWith('.js')).sort((a, b) => b.bytes - a.bytes);
  const entry = files.find((f) => f.path === src.replace(/^\//, ''));
  assert.ok(entry, `${label}: 入口文件 ${src} 不存在`);
  const allText = js.map((f) => fs.readFileSync(path.join(outDir, f.path), 'utf8')).join('\n');
  return {
    label,
    outDir: path.relative(root, outDir).replace(/\\/g, '/'),
    entry: entry.path,
    entryBytes: entry.bytes,
    entryGzip: entry.gzip,
    jsChunks: js.length,
    jsBytes: js.reduce((sum, f) => sum + f.bytes, 0),
    jsGzip: js.reduce((sum, f) => sum + f.gzip, 0),
    hasDeadMarker: allText.includes(DEAD_MARKER),
    hasSourceMap: files.some((f) => f.path === `${entry.path}.map`),
    files,
  };
}

fs.rmSync(outRoot, { recursive: true, force: true });
const baseline = await bundle('baseline', 'index.baseline.html', path.join(outRoot, 'baseline'));
const optimized = await bundle('optimized', 'index.html', path.join(outRoot, 'optimized'));

assert.equal(baseline.hasDeadMarker, false, 'baseline 产物仍含未使用导出（tree-shaking 失败）');
assert.equal(optimized.hasDeadMarker, false, 'optimized 产物仍含未使用导出（tree-shaking 失败）');
assert.ok(optimized.jsChunks > baseline.jsChunks, '动态导入没有拆出额外 chunk');
assert.ok(optimized.entryBytes <= baseline.entryBytes, '动态导入后入口 chunk 反而变大');
assert.ok(optimized.entryGzip < ENTRY_GZIP_BUDGET, `入口 gzip ${optimized.entryGzip} 超出预算 ${ENTRY_GZIP_BUDGET}`);
assert.ok(baseline.hasSourceMap && optimized.hasSourceMap, 'sourcemap 缺失');

const saving = baseline.entryBytes - optimized.entryBytes;
const savingPct = ((saving / baseline.entryBytes) * 100).toFixed(1);
const lines = [
  'E05 bundle 对照（同源、同 minify=esbuild、同 sourcemap=true）',
  `generated_at: ${new Date().toISOString()}`,
  '',
  `baseline : entry=${baseline.entry} raw=${baseline.entryBytes}B gzip=${baseline.entryGzip}B chunks=${baseline.jsChunks} total_raw=${baseline.jsBytes}B total_gzip=${baseline.jsGzip}B`,
  `optimized: entry=${optimized.entry} raw=${optimized.entryBytes}B gzip=${optimized.entryGzip}B chunks=${optimized.jsChunks} total_raw=${optimized.jsBytes}B total_gzip=${optimized.jsGzip}B`,
  `入口节省: ${saving}B（${savingPct}%）；动态 chunk: ${optimized.jsChunks - baseline.jsChunks} 个`,
  `tree-shaking: baseline/optimized 均不含 "${DEAD_MARKER}" => 未使用导出已剔除`,
  `sourcemap: baseline=${baseline.hasSourceMap} optimized=${optimized.hasSourceMap}`,
  `预算: 入口 gzip <= ${ENTRY_GZIP_BUDGET}B，实际 ${optimized.entryGzip}B => PASS`,
  '',
  '优化后 JS 文件:',
  ...optimized.files.filter((f) => f.path.endsWith('.js')).map((f) => `  ${f.path} raw=${f.bytes}B gzip=${f.gzip}B`),
];
fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/bundle-compare.txt', lines.join('\n') + '\n');
fs.writeFileSync('evidence/bundle-manifest.json', JSON.stringify({
  generated_at: new Date().toISOString(),
  budget: { entry_gzip: ENTRY_GZIP_BUDGET },
  baseline: { entry: baseline.entry, entryBytes: baseline.entryBytes, entryGzip: baseline.entryGzip, jsChunks: baseline.jsChunks, files: baseline.files.map(({ path: p, bytes, gzip: g, sha256 }) => ({ path: p, bytes, gzip: g, sha256 })) },
  optimized: { entry: optimized.entry, entryBytes: optimized.entryBytes, entryGzip: optimized.entryGzip, jsChunks: optimized.jsChunks, files: optimized.files.map(({ path: p, bytes, gzip: g, sha256 }) => ({ path: p, bytes, gzip: g, sha256 })) },
}, null, 2) + '\n');
console.log(lines.join('\n'));
