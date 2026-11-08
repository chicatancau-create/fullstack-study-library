import assert from 'node:assert/strict';
import { fork } from 'node:child_process';

const child = fork(new URL('../src/cancel-child.mjs', import.meta.url));
const messages = [];
let checks = 0;
let fails = 0;

function check(name, condition) {
  checks++;
  if (!condition) { fails++; console.log(`not ok - ${name}`); }
}

function waitFor(predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const found = messages.find(predicate);
      if (found) { clearInterval(timer); resolve(found); }
      else if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
    }, 20);
  });
}

child.on('message', (message) => messages.push(message));

try {
  await waitFor((m) => m.type === 'ready');
  check('child ready', messages.some((m) => m.type === 'ready'));

  child.send({ type: 'run', id: 'slow', ms: 5000 });
  await new Promise((r) => setTimeout(r, 80));
  child.send({ type: 'cancel', id: 'slow' });
  const cancelled = await waitFor((m) => m.id === 'slow');
  check('slow task cancelled across process', cancelled.status === 'cancelled');

  child.send({ type: 'run', id: 'fast', ms: 50 });
  const done = await waitFor((m) => m.id === 'fast');
  check('fast task completes', done.status === 'done');

  check('two results only', messages.filter((m) => m.id).length === 2);
} catch (error) {
  fails++;
  console.log('not ok - ' + error.message);
} finally {
  child.kill();
  console.log(`checks=${checks} fails=${fails} : ${fails === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(fails === 0 ? 0 : 1);
}
