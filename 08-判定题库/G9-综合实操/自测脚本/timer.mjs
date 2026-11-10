// 12 小时自测计时器（公开）。学习者自己计时、自己记录 checkpoint。
// 用法：
//   node 自测脚本/timer.mjs start            开始计时（生成 .g9-timer.json）
//   node 自测脚本/timer.mjs status           查看当前阶段与剩余时间
//   node 自测脚本/timer.mjs pause            暂停
//   node 自测脚本/timer.mjs resume           继续
//   node 自测脚本/timer.mjs checkpoint A1    标记某阶段完成（写 git 哈希可选）
//   node 自测脚本/timer.mjs finalize         结算并打印总表
//
// 阶段（分钟）：读题与拆解 60 · A 卷实现 300 · B 卷实现 120 · 交叉复测 90 · 自评 90 · 复盘 60 = 720
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PLAN = [
  { id: 'read', label: '读题与拆解', minutes: 60 },
  { id: 'A', label: 'A 卷实现', minutes: 300 },
  { id: 'B', label: 'B 卷实现', minutes: 120 },
  { id: 'cross', label: '交叉复测', minutes: 90 },
  { id: 'self', label: '自评', minutes: 90 },
  { id: 'retro', label: '复盘', minutes: 60 },
];

const stateFile = path.resolve('.g9-timer.json');
const now = () => Date.now();
const mmss = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
};
const load = () => (existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null);
const save = (s) => writeFileSync(stateFile, JSON.stringify(s, null, 2) + '\n', 'utf8');

function headHash() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const cmd = process.argv[2] ?? 'status';
const arg = process.argv[3];

if (cmd === 'start') {
  const started = now();
  const state = {
    startedAt: started,
    stageIndex: 0,
    stageStart: started,
    paused: false,
    pausedAt: null,
    elapsed: 0,
    checkpoint: [],
  };
  save(state);
  console.log(`started stage=${PLAN[0].id} budget=${PLAN[0].minutes}m 总预算=${PLAN.reduce((s, p) => s + p.minutes, 0)}m`);
  process.exit(0);
}

const state = load();
if (!state) {
  console.error('没有计时状态，先 `node 自测脚本/timer.mjs start`');
  process.exit(2);
}

const stage = PLAN[state.stageIndex];
const spentOnStage = () => {
  if (state.paused) return state.elapsed;
  return state.elapsed + (now() - state.stageStart);
};

if (cmd === 'status') {
  const spent = spentOnStage();
  const budget = stage.minutes * 60_000;
  const left = budget - spent;
  console.log(`stage=${stage.id}(${stage.label}) spent=${mmss(spent)} budget=${stage.minutes}m ${left >= 0 ? 'left' : 'over'}=${mmss(Math.abs(left))}${state.paused ? ' [paused]' : ''}`);
  console.log(`checkpoints=${state.checkpoint.length}`);
  process.exit(left >= 0 ? 0 : 1);
}

if (cmd === 'pause') {
  if (state.paused) { console.log('already paused'); process.exit(0); }
  state.elapsed = spentOnStage();
  state.paused = true;
  state.pausedAt = now();
  save(state);
  console.log(`paused at stage=${stage.id} spent=${mmss(state.elapsed)}`);
  process.exit(0);
}

if (cmd === 'resume') {
  if (!state.paused) { console.log('not paused'); process.exit(0); }
  state.paused = false;
  state.pausedAt = null;
  state.stageStart = now();
  save(state);
  console.log(`resumed stage=${stage.id}`);
  process.exit(0);
}

if (cmd === 'checkpoint') {
  if (!arg) { console.error('用法: timer.mjs checkpoint <名称>'); process.exit(2); }
  const entry = { at: new Date().toISOString(), stage: stage.id, name: arg, spentMs: spentOnStage(), head: headHash() };
  state.checkpoint.push(entry);
  save(state);
  console.log(`checkpoint ${arg} stage=${stage.id} spent=${mmss(entry.spentMs)} head=${entry.head ?? 'n/a'}`);
  process.exit(0);
}

if (cmd === 'finalize') {
  const total = state.elapsed + (state.paused ? 0 : now() - state.stageStart);
  const rows = PLAN.map((p, i) => {
    const doneMs = i < state.stageIndex ? p.minutes * 60_000 : i === state.stageIndex ? total : 0;
    return { stage: p.id, label: p.label, budgetMin: p.minutes, spent: mmss(doneMs) };
  });
  console.log('阶段\t预算\t实际');
  for (const r of rows) console.log(`${r.stage}\t${r.budgetMin}m\t${r.spent}`);
  console.log(`总预算=${PLAN.reduce((s, p) => s + p.minutes, 0)}m 实际=${mmss(total)} checkpoints=${state.checkpoint.length}`);
  process.exit(0);
}

console.error(`未知命令 ${cmd}。可用：start/status/pause/resume/checkpoint/finalize`);
process.exit(2);
