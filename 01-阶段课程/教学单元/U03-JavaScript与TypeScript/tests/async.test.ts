import test from 'node:test';
import assert from 'node:assert/strict';

test('事件循环顺序：同步 -> 微任务 -> await -> 定时器', async () => {
  const order: string[] = [];
  setTimeout(() => order.push('timeout'), 0);
  queueMicrotask(() => order.push('microtask'));
  order.push('sync');
  await Promise.resolve();
  order.push('after-await');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  order.push('after-timeout');

  assert.deepEqual(order, ['sync', 'microtask', 'after-await', 'timeout', 'after-timeout']);
});

test('Promise 失败必须被 await/catch 接住', async () => {
  const failing = Promise.reject(new Error('boom'));
  await assert.rejects(failing, /boom/);
});

test('AbortSignal 协作取消：底层必须自己检查 signal', async () => {
  const controller = new AbortController();
  const work = async (signal: AbortSignal): Promise<string> => {
    for (let i = 0; i < 10; i += 1) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return 'done';
  };

  const promise = work(controller.signal);
  controller.abort();
  await assert.rejects(promise, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
});

test('并发上限：结果数量与顺序由调度决定', async () => {
  const limit = 2;
  let running = 0;
  let peak = 0;
  const jobs = Array.from({ length: 6 }, (_, i) =>
    (async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return i;
    })(),
  );

  // 这个例子没有池，只是证明 Promise 本身不限制并发；真正的上限需要队列。
  const results = await Promise.all(jobs);
  assert.equal(results.length, 6);
  assert.equal(peak, 6);
  assert.ok(peak > limit);
});