import { TaskPool } from '../src/pool.mjs';
import { check, eq, banner, summary, within } from './tapmini.mjs';
import { gate, waitUntil } from '../src/measure.mjs';

banner('E02 / 确定性乱序完成');

const settle = (p) => p.catch((error) => error);

/**
 * 用闸门把「完成顺序」变成测试可以逐拍推进的确定事件。
 * 不用随机 sleep：随机只能碰运气复现，不能叫确定性。
 */
async function runOutOfOrder(order) {
  const pool = new TaskPool({ concurrency: 2, maxQueue: 16, name: `ord-${order.join('')}` });
  const started = [];
  const finished = [];
  const gates = Object.fromEntries(['A', 'B', 'C', 'D'].map((k) => [k, gate(k)]));

  const tasks = ['A', 'B', 'C', 'D'].map((k) =>
    settle(
      pool.submit(
        async () => {
          started.push(k);
          await gates[k].promise;
          finished.push(k);
          return k;
        },
        { label: k },
      ),
    ),
  );

  await waitUntil(() => started.length === 2, { label: '前两个启动' });

  for (const key of order) {
    // 等该任务已经开始（并发 2，后面的任务要等前面的让位）
    await waitUntil(() => started.includes(key), { label: `${key} 已启动` });
    gates[key].open();
    await waitUntil(() => finished.includes(key), { label: `${key} 已结算` });
  }

  await within(2000, () => Promise.all(tasks), '全部任务结算');
  await pool.drain();
  return { started: started.join(','), finished: finished.join(','), stats: pool.stats() };
}

// ---------- 第一组：B 先于 A，D 先于 C ----------
const first = await runOutOfOrder(['B', 'A', 'D', 'C']);
eq('乱序：启动顺序仍等于提交顺序', first.started, 'A,B,C,D');
eq('乱序：完成顺序 = B,A,D,C', first.finished, 'B,A,D,C');
check('乱序：完成顺序不等于提交顺序', first.finished !== 'A,B,C,D', `finished=${first.finished}`);
eq('乱序：4 个任务全部 fulfilled', first.stats.fulfilled, 4);
eq('乱序：并发峰值不超过 2', first.stats.peakRunning, 2);

// ---------- 第二组：按提交顺序放行，完成顺序也应是 A,B,C,D ----------
// 这一组是必要的对照：说明完成顺序由闸门控制，不是任务池「总是反着来」。
const second = await runOutOfOrder(['A', 'B', 'C', 'D']);
eq('对照：按提交顺序放行则按提交顺序完成', second.finished, 'A,B,C,D');
check('对照：两组完成顺序确实不同', second.finished !== first.finished);

// ---------- 第三组：显式完全逆序（D,C,B,A） ----------
const pool3 = new TaskPool({ concurrency: 4, maxQueue: 8, name: 'rev' });
const finished3 = [];
const gates3 = Object.fromEntries(['A', 'B', 'C', 'D'].map((k) => [k, gate(k)]));
const tasks3 = ['A', 'B', 'C', 'D'].map((k) =>
  settle(
    pool3.submit(
      async () => {
        await gates3[k].promise;
        finished3.push(k);
        return k;
      },
      { label: k },
    ),
  ),
);
await waitUntil(() => pool3.stats().running === 4, { label: '4 个同时启动' });
for (const k of ['D', 'C', 'B', 'A']) {
  gates3[k].open();
  await waitUntil(() => finished3.includes(k), { label: `${k} 完成` });
}
await within(1000, () => Promise.all(tasks3), '逆序四个任务');
eq('乱序：并发 4 时可按 D,C,B,A 完成', finished3.join(','), 'D,C,B,A');

// ---------- 第四组：重复 5 次，顺序不能漂 ----------
const runs = [];
for (let i = 0; i < 5; i++) {
  const r = await runOutOfOrder(['B', 'A', 'D', 'C']);
  runs.push(r.finished);
}
eq('确定性：5 次重复得到同一完成顺序', new Set(runs).size, 1);
eq('确定性：重复值仍为 B,A,D,C', runs[0], 'B,A,D,C');

summary('test_ordering');
