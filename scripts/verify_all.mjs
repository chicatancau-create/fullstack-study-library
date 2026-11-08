import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const vault = process.cwd();
const practice = process.env.PRACTICE_ROOT || 'E:/fullstack-code';
const checks = [];

function run(label, command, args, cwd) {
  try {
    const output = execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    checks.push({ label, ok: true, output: output.trim().split(/\r?\n/).slice(-1)[0] || '' });
  } catch (error) {
    checks.push({ label, ok: false, output: (error.stdout || '') + (error.stderr || '') || error.message });
  }
}

run('source-only', 'python', ['-X', 'utf8', '05-外部资料库/_采集暂存/catalog_tool.py', 'validate', '--mode', 'source-only'], vault);

const manifests = [
  ['P01', practice, 'Web/project01-blog'],
  ['P02', practice, 'project02-collab'],
  ['B5-01', practice, 'project02-spring'],
  ['B5-03', practice, 'project02-frameworks'],
  ['P03', practice, 'project03-trade'],
  ['P04', practice, 'project04-saas'],
  ['P05', practice, 'project05-takeover'],
  ['B6-02', practice, 'project06-ai-min'],
  ['E01', vault, '06-实验代码/E01-c-memory'],
  ['E02', vault, '06-实验代码/E02-node-async'],
  ['E03', vault, '06-实验代码/E03-react-race'],
  ['E04', vault, '06-实验代码/E04-http-network'],
  ['E05', vault, '06-实验代码/E05-build-render'],
  ['E06', vault, '06-实验代码/E06-runtime-diag'],
  ['E07', vault, '06-实验代码/E07-pg-owner-race'],
  ['E08', vault, '06-实验代码/E08-pg-plan-migrate'],
  ['E09', vault, '06-实验代码/E09-redis-cache'],
  ['E11', vault, '06-实验代码/E11-authz-matrix'],
  ['E12', vault, '06-实验代码/E12-load-capacity'],
  ['E13', vault, '06-实验代码/E13-slo-fault'],
  ['E10', vault, '06-实验代码/E10-mq-outbox'],
  ['G1', vault, '06-实验代码/G1-responsive-site'],
];

for (const [label, root, dir] of manifests) {
  const cwd = path.join(root, dir);
  const local = path.join(cwd, 'scripts/manifest.mjs');
  const vaultTool = path.join(vault, '06-实验代码/_template/manifest.mjs');
  if (fs.existsSync(local)) {
    run(`manifest ${label}`, 'node', ['scripts/manifest.mjs', 'verify', 'evidence/manifest.json'], cwd);
  } else {
    run(`manifest ${label}`, 'node', [vaultTool, 'verify', path.join(cwd, 'evidence/manifest.json')], vault);
  }
}

const sensitiveNames = /(^|\/)(\.env($|\..+)|id_rsa|id_ed25519|.*\.(pem|key|p12|pfx))$|(^|\/)node_modules\/|(^|\/)target\//;
const secretPattern = /BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,}/;

for (const [label, root, exclude] of [
  ['practice secret names', practice, []],
  ['vault secret names', vault, [':!05-外部资料库', ':!90-历史归档']],
]) {
  try {
    const files = execFileSync('git', ['ls-files', '--', ...exclude], { cwd: root, encoding: 'utf8' }).split(String.fromCharCode(10)).filter(Boolean);
    const bad = files.filter((file) => sensitiveNames.test(file));
    checks.push({ label, ok: bad.length === 0, output: bad.length ? bad.join(',') : 'none' });
  } catch (error) {
    checks.push({ label, ok: false, output: error.message });
  }
}

for (const [label, root, exclude] of [
  ['practice secret patterns', practice, []],
  ['vault secret patterns', vault, [':!05-外部资料库', ':!90-历史归档']],
]) {
  try {
    execFileSync('git', ['grep', '-l', '-E', secretPattern.source, '--', '.', ...exclude], { cwd: root, encoding: 'utf8' });
    checks.push({ label, ok: false, output: 'matched tracked files' });
  } catch (error) {
    checks.push({ label, ok: error.status === 1, output: error.status === 1 ? 'none' : error.message });
  }
}

try {
  const headers = execFileSync('curl', ['-sS', '-I', '--max-time', '20', 'https://chicatancau-create.github.io/learning-blog-demo/'], { encoding: 'utf8' });
  checks.push({ label: 'pages', ok: headers.includes('200'), output: headers.split(String.fromCharCode(10))[0] });
} catch (error) {
  checks.push({ label: 'pages', ok: false, output: error.message });
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'OK  ' : 'FAIL'} ${check.label}: ${check.output}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
