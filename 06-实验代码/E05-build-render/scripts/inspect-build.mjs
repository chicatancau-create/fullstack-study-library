import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIST = 'dist';
const EVIDENCE = 'evidence';
fs.mkdirSync(EVIDENCE, { recursive: true });

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('BUILD FAIL: dist/index.html 不存在');
  process.exit(1);
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const match = html.match(/src="(\/assets\/[^"]+\.js)"/);
if (!match) {
  console.error('BUILD FAIL: index.html 未引用 hashed JS');
  process.exit(1);
}
const assetRel = match[1].replace(/^\//, '');
if (!fs.existsSync(path.join(DIST, assetRel))) {
  console.error(`BUILD FAIL: 引用的 assets 不存在 ${assetRel}`);
  process.exit(1);
}
if (!/-[A-Za-z0-9_-]{6,}\.js$/.test(assetRel)) {
  console.error(`BUILD FAIL: asset 名称不含 hash: ${assetRel}`);
  process.exit(1);
}

const files = walk(DIST).map((file) => {
  const buffer = fs.readFileSync(file);
  return {
    path: path.relative(DIST, file).replace(/\\/g, '/'),
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
});

const secret = process.env.E05_SECRET;
let secretLeak = false;
if (secret) {
  secretLeak = files.some((file) => fs.readFileSync(path.join(DIST, file.path), 'utf8').includes(secret))
    || html.includes(secret);
}
if (secretLeak) {
  console.error('BUILD FAIL: 非 VITE_ 环境变量泄漏进产物');
  process.exit(1);
}

const manifest = {
  captured_at: new Date().toISOString(),
  entry: assetRel,
  files,
  total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
  secret_leak: secretLeak,
};
fs.writeFileSync(path.join(EVIDENCE, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(
  path.join(EVIDENCE, 'build-inspect.txt'),
  [`entry: ${assetRel}`, `total_bytes: ${manifest.total_bytes}`, `files: ${files.length}`, `secret_leak: ${secretLeak}`].join('\n') + '\n',
);
console.log(`INSPECT PASS entry=${assetRel} total_bytes=${manifest.total_bytes} secret_leak=${secretLeak}`);