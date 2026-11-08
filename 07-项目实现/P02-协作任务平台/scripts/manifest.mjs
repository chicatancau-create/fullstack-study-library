#!/usr/bin/env node
/**
 * 统一证据 manifest：生成与校验。
 *
 *   node _template/manifest.mjs make --experiment E01 \
 *     --output evidence/manifest.json \
 *     --files=evidence/test_run.txt,evidence/fault_inject.txt \
 *     --command="bash scripts/run_tests.sh|0" \
 *     --command="bash scripts/selftest_gate.sh|0" \
 *     --unverified="ASan/Valgrind 不可用"
 *
 *   node _template/manifest.mjs verify evidence/manifest.json
 *
 * 只记录实际存在的证据文件与 SHA-256；不生成、不推断、不伪造结果。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function tryVersion(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim();
  } catch {
    return null;
  }
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function parseFlags(args) {
  const flags = { files: [], commands: [], unverified: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const m = arg.match(/^--([a-z-]+)=(.*)$/);
    if (m) {
      const [, key, value] = m;
      if (key === 'files') flags.files.push(...value.split(',').filter(Boolean));
      else if (key === 'command') {
        const [cmd, exit] = value.split('|');
        flags.commands.push({ cmd, exit: Number(exit) });
      } else if (key === 'unverified') flags.unverified.push(value);
      else flags[key] = value;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value !== undefined && !value.startsWith('--')) {
        flags[key] = value;
        i++;
      }
    }
  }
  return flags;
}

function make(args) {
  const flags = parseFlags(args);
  if (!flags.experiment || !flags.output) {
    console.error('make 需要 --experiment 与 --output');
    process.exit(2);
  }
  const root = process.cwd();
  const artifacts = flags.files.map((rel) => {
    const abs = path.resolve(root, rel);
    if (!fs.existsSync(abs)) {
      console.error(`证据文件不存在: ${rel}`);
      process.exit(1);
    }
    return { path: rel.replace(/\\/g, '/'), bytes: fs.statSync(abs).size, sha256: sha256(abs) };
  });
  if (artifacts.length === 0) {
    console.error('至少需要一个 --files 证据文件');
    process.exit(2);
  }
  const manifest = {
    schema: 1,
    experiment: flags.experiment,
    generated_at: new Date().toISOString(),
    commit: gitCommit(),
    runtime: {
      platform: `${process.platform} ${process.arch}`,
      os_release: tryVersion('cmd', ['/c', 'ver']) || null,
      node: process.version,
      gcc: tryVersion('gcc', ['--version']),
      gdb: tryVersion('gdb', ['--version']),
    },
    commands: flags.commands,
    artifacts,
    unverified: flags.unverified,
  };
  fs.mkdirSync(path.dirname(path.resolve(root, flags.output)), { recursive: true });
  fs.writeFileSync(path.resolve(root, flags.output), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest: ${flags.output} (${artifacts.length} artifacts, commit ${manifest.commit || 'unknown'})`);
}

function verify(file) {
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) {
    console.error(`manifest 不存在: ${file}`);
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!manifest.experiment || !Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    console.error('manifest 缺 experiment 或 artifacts');
    process.exit(2);
  }
  const base = path.dirname(abs);
  let bad = 0;
  for (const artifact of manifest.artifacts) {
    const artifactAbs = path.resolve(base, '..', artifact.path);
    if (!fs.existsSync(artifactAbs)) {
      console.error(`MISSING ${artifact.path}`);
      bad++;
      continue;
    }
    const actual = sha256(artifactAbs);
    if (actual !== artifact.sha256) {
      console.error(`HASH MISMATCH ${artifact.path}`);
      bad++;
    }
  }
  if (bad) {
    console.error(`manifest verify failed: ${bad} problem(s)`);
    process.exit(1);
  }
  console.log(`manifest OK: ${manifest.experiment}, ${manifest.artifacts.length} artifacts, commit ${manifest.commit || 'unknown'}`);
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'make') make(rest);
else if (mode === 'verify' && rest[0]) verify(rest[0]);
else {
  console.error('用法: manifest.mjs make --experiment E01 --output evidence/manifest.json --files=a,b --command="cmd|0"');
  console.error('      manifest.mjs verify evidence/manifest.json');
  process.exit(2);
}