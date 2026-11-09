// 参考答案：把 fixture 工作副本修到能通过 自测脚本/grade-repo.mjs。
// 只修该修的四件事：脏工作区、合并冲突、缺陷代码、提交。
// 用法：node 参考答案/solve-repo.mjs <工作副本目录>
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

export const FIXED_SUM = `export function rollingSum(values) {
  const out = [];
  let total = 0;
  for (const value of values) {
    total += value;
    out.push(total);
  }
  return out;
}
`;

function makeGit(work) {
  return (args) => execFileSync('git', [
    '-c', 'user.name=Learner', '-c', 'user.email=learner@example.test',
    '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args,
  ], {
    cwd: work,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  });
}

/** 解析可合并的 feature 引用：干净 clone 后只有远端分支，本地可能没有。 */
function resolveFeatureRef(git, preferred = 'feature/timeout') {
  const exists = (ref) => {
    try {
      git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  };
  if (exists(`refs/heads/${preferred}`)) return preferred;
  if (exists(`refs/remotes/origin/${preferred}`)) return `origin/${preferred}`;
  throw new Error(`找不到分支 ${preferred}（本地与 origin 都没有）`);
}

/** @param {string} work 工作副本目录 */
export function solveRepo(work) {
  const cwd = path.resolve(work);
  const git = makeGit(cwd);

  // 1) 脏工作区：丢弃“改到一半”的追踪文件改动，删掉未跟踪的临时目录
  git(['checkout', '--', 'README.md']);
  if (existsSync(path.join(cwd, 'scratch'))) {
    rmSync(path.join(cwd, 'scratch'), { recursive: true, force: true });
  }

  // 2) 合并 feature/timeout；冲突是预期结果，按“双方都要”手工解
  const featureRef = resolveFeatureRef(git);
  let conflicted = false;
  try {
    git(['merge', '--no-edit', featureRef]);
  } catch {
    conflicted = git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean).length > 0;
    if (!conflicted) throw new Error(`merge ${featureRef} 失败但不是冲突，需要人工判断`);
  }

  const merged = ['LOG_LEVEL=debug', 'TIMEOUT_MS=60000', 'RETRY=5'].join('\n') + '\n';
  writeFileSync(path.join(cwd, 'config/app.env'), merged, 'utf8');
  git(['add', 'config/app.env']);

  // 3) 修缺陷：滚动和在最后一位被漏掉（length - 1 的 off-by-one）
  const sumFile = path.join(cwd, 'src/rolling_sum.js');
  if (!readFileSync(sumFile, 'utf8').includes('values.length - 1')) {
    throw new Error('src/rolling_sum.js 与预期缺陷不符，不做猜测性修改');
  }
  writeFileSync(sumFile, FIXED_SUM, 'utf8');
  git(['add', 'src/rolling_sum.js']);

  // 4) 冲突解完 + 缺陷修复一起进合并提交，保证 HEAD 有两个父提交
  git(['commit', '-q', '--no-edit']);

  return {
    head: git(['rev-parse', 'HEAD']).trim(),
    parents: git(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(/\s+/).slice(1),
    status: git(['status', '--porcelain']).trim(),
  };
}

if (import.meta.main) {
  const target = process.argv[2];
  if (!target) {
    console.error('用法: node 参考答案/solve-repo.mjs <工作副本目录>');
    process.exit(2);
  }
  console.log(JSON.stringify(solveRepo(target), null, 2));
}
