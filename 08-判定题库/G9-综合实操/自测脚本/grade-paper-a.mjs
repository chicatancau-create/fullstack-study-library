// A 卷自测：13 条断言，全部由种子与手工构造的边界样本驱动。
// 用法：node 自测脚本/grade-paper-a.mjs <候选实现>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const implPath = process.argv[2];
if (!implPath) {
  console.error('用法: node 自测脚本/grade-paper-a.mjs <实现文件>');
  process.exit(2);
}
const mod = await import(pathToFileURL(path.resolve(implPath)).href);
const { applyBookings, utilization, releaseExpired } = mod;
if (typeof applyBookings !== 'function' || typeof utilization !== 'function' || typeof releaseExpired !== 'function') {
  console.error('FAIL: 必须导出 applyBookings / utilization / releaseExpired');
  process.exit(2);
}

const seed = JSON.parse(readFileSync(new URL('../paperA/种子.json', import.meta.url), 'utf8'));

let checks = 0;
let fails = 0;
const eq = (name, actual, expected) => {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    fails += 1;
    console.error(`FAIL ${name}: ${a} != ${e}`);
  } else console.log(`ok ${name}`);
};

// A1 主流程：accepted 集合
{
  const r = applyBookings(seed);
  eq('A1 已接受预约', r.accepted.map((b) => b.id).sort(), ['b1', 'b5', 'b7', 'b8', 'b9']);
  eq('A2 冲突被拒', r.rejected.filter((x) => x.reason === 'conflict').map((x) => x.id).sort(), ['b2', 'b3']);
  eq('A3 超容量被拒', r.rejected.filter((x) => x.reason === 'capacity').map((x) => x.id), ['b4']);
  eq('A4 跨租户被拒', r.rejected.filter((x) => x.reason === 'cross_tenant').map((x) => x.id), ['b6']);
  eq('A5 过期 hold 被拒', r.rejected.filter((x) => x.reason === 'hold_expired').map((x) => x.id), ['b10']);
}

// A6 时区：+08:00 与 Z 表示同一时刻时必须冲突
{
  const rooms = [{ id: 'r', tenantIds: ['t'], capacity: 4, openMinutes: 600, dailyLimit: 9 }];
  const r = applyBookings({
    tenantId: 't',
    rooms,
    now: '2026-03-01T00:00:00Z',
    bookings: [
      { id: 'x1', roomId: 'r', seats: 1, start: '2026-03-01T10:00:00+08:00', end: '2026-03-01T11:00:00+08:00', createdAt: 1 },
      { id: 'x2', roomId: 'r', seats: 1, start: '2026-03-01T02:30:00Z', end: '2026-03-01T03:00:00Z', createdAt: 2 },
    ],
  });
  eq('A6 时区换算后判冲突', r.rejected.map((x) => `${x.id}:${x.reason}`), ['x2:conflict']);
}

// A7 并发：createdAt 相同，按 id 定序，先到者赢
{
  const rooms = [{ id: 'r', tenantIds: ['t'], capacity: 9, openMinutes: 600, dailyLimit: 9 }];
  const r = applyBookings({
    tenantId: 't',
    rooms,
    now: '2026-03-01T00:00:00Z',
    bookings: [
      { id: 'zz', roomId: 'r', seats: 1, start: '2026-03-01T01:00:00Z', end: '2026-03-01T02:00:00Z', createdAt: 7 },
      { id: 'aa', roomId: 'r', seats: 1, start: '2026-03-01T01:30:00Z', end: '2026-03-01T02:30:00Z', createdAt: 7 },
    ],
  });
  eq('A7 并发按 id 定序', r.accepted.map((b) => b.id), ['aa']);
}

// A8 候补：当日上限 1 → 最早的一条接受，其余进 waitlist 且按 createdAt 升序
{
  const rooms = [{ id: 'r', tenantIds: ['t'], capacity: 9, openMinutes: 600, dailyLimit: 1 }];
  const day = '2026-03-01';
  const r = applyBookings({
    tenantId: 't',
    rooms,
    now: `${day}T00:00:00Z`,
    bookings: [
      { id: 'w3', roomId: 'r', seats: 1, start: `${day}T09:00:00Z`, end: `${day}T09:30:00Z`, createdAt: 30 },
      { id: 'w1', roomId: 'r', seats: 1, start: `${day}T10:00:00Z`, end: `${day}T10:30:00Z`, createdAt: 10 },
      { id: 'w2', roomId: 'r', seats: 1, start: `${day}T11:00:00Z`, end: `${day}T11:30:00Z`, createdAt: 20 },
    ],
  });
  eq('A8 候补按 createdAt', r.waitlist.map((b) => b.id), ['w2', 'w3']);
  eq('A9 上限内只接受最早一条', r.accepted.map((b) => b.id), ['w1']);
}

// A10 依赖排程：依赖未接受则 blocked
{
  const rooms = [{ id: 'r', tenantIds: ['t'], capacity: 9, openMinutes: 600, dailyLimit: 9 }];
  const r = applyBookings({
    tenantId: 't',
    rooms,
    now: '2026-03-01T00:00:00Z',
    bookings: [
      { id: 'dep', roomId: 'r', seats: 1, start: '2026-03-01T01:00:00Z', end: '2026-03-01T02:00:00Z', createdAt: 1, dependsOn: ['missing'] },
      { id: 'ok', roomId: 'r', seats: 1, start: '2026-03-01T03:00:00Z', end: '2026-03-01T04:00:00Z', createdAt: 2, dependsOn: ['dep'] },
    ],
  });
  eq('A10 依赖未满足被拒', r.rejected.map((x) => `${x.id}:${x.reason}`).sort(), ['dep:blocked', 'ok:blocked']);
}

// A11 权限：viewer 被拒
{
  const rooms = [{ id: 'r', tenantIds: ['t'], capacity: 9, openMinutes: 600, dailyLimit: 9 }];
  const r = applyBookings({
    tenantId: 't',
    rooms,
    now: '2026-03-01T00:00:00Z',
    bookings: [{ id: 'v', roomId: 'r', seats: 1, role: 'viewer', start: '2026-03-01T01:00:00Z', end: '2026-03-01T02:00:00Z', createdAt: 1 }],
  });
  eq('A11 viewer 被拒', r.rejected.map((x) => `${x.id}:${x.reason}`), ['v:forbidden']);
}

// A12 非法区间
{
  const rooms = [{ id: 'r', tenantIds: ['t'], capacity: 9, openMinutes: 600, dailyLimit: 9 }];
  const r = applyBookings({
    tenantId: 't',
    rooms,
    now: '2026-03-01T00:00:00Z',
    bookings: [{ id: 'bad', roomId: 'r', seats: 1, start: '2026-03-01T02:00:00Z', end: '2026-03-01T01:00:00Z', createdAt: 1 }],
  });
  eq('A12 非法区间被拒', r.rejected.map((x) => `${x.id}:${x.reason}`), ['bad:invalid_range']);
}

// A13 利用率与释放过期 hold
{
  const rooms = [
    { id: 'r1', tenantIds: ['t'], capacity: 9, openMinutes: 60, dailyLimit: 9 },
    { id: 'r2', tenantIds: ['t'], capacity: 9, openMinutes: 120, dailyLimit: 9 },
  ];
  const accepted = [
    { id: 'a', roomId: 'r1', start: 0, end: 30 * 60_000 },
    { id: 'b', roomId: 'r2', start: 0, end: 60 * 60_000, holdUntil: 1000 },
  ];
  eq('A13 利用率', utilization({ rooms, accepted }), { r1: 0.5, r2: 0.5 });
  const rel = releaseExpired({ accepted, now: 2000 });
  eq('A14 释放过期 hold', { kept: rel.accepted.map((x) => x.id), released: rel.released }, { kept: ['a'], released: ['b'] });
}

console.log(`checks=${checks} fails=${fails}`);
process.exit(fails === 0 ? 0 : 1);
