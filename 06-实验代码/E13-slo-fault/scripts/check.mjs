import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EVIDENCE = path.resolve('evidence');
const STATE = path.join(EVIDENCE, 'state.json');
fs.mkdirSync(EVIDENCE, { recursive: true });
fs.rmSync(STATE, { force: true });

const results = [];
function assert(name, condition, detail = '') {
  results.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? 'ok' : 'not ok'} - ${name}${condition ? '' : ` :: ${detail}`}`);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/server.mjs'], {
      env: { ...process.env, PORT: '0', STATE_FILE: STATE },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.resume();
    let buffer = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('服务启动超时')); }, 10000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const match = buffer.match(/READY (\d+)/);
      if (match) { clearTimeout(timer); resolve({ child, port: Number(match[1]) }); }
    });
    child.on('error', reject);
  });
}

async function stopServer(server) {
  const exited = new Promise((resolve) => server.child.on('exit', resolve));
  server.child.kill('SIGTERM');
  await exited;
}

async function main() {
  let server = await startServer();
  let base = `http://127.0.0.1:${server.port}`;

  // 100 个请求：95 成功 + 5 个 500
  let good = 0;
  let bad = 0;
  for (let i = 0; i < 100; i += 1) {
    const response = await fetch(`${base}${i < 95 ? '/ok' : '/fail'}`);
    if (response.status === 200) good += 1;
    else bad += 1;
  }
  assert('95 个 200', good === 95, `good=${good}`);
  assert('5 个 500', bad === 5, `bad=${bad}`);

  const sli = good / 100;
  const target = 0.99;
  const allowedBad = Math.floor(100 * (1 - target));
  const slo = {
    window_requests: 100,
    good,
    bad,
    sli,
    target,
    allowed_bad: allowedBad,
    consumed_bad: bad,
    exceeded: bad > allowedBad,
    note: '合成窗口；只用于训练 SLO/错误预算口径，不是生产 SLO',
  };
  assert('SLI=0.95', Math.abs(sli - 0.95) < 1e-9, `sli=${sli}`);
  assert('错误预算被超出', slo.exceeded === true);

  // 慢响应：客户端 50ms 超时，服务端 200ms 后仍完成；随后健康检查仍通过
  let timeoutName = '';
  try {
    await fetch(`${base}/slow?ms=200`, { signal: AbortSignal.timeout(50) });
  } catch (error) {
    timeoutName = error.name;
  }
  assert('慢响应触发客户端超时', timeoutName === 'TimeoutError' || timeoutName === 'AbortError', timeoutName);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const healthAfterSlow = await fetch(`${base}/health`);
  assert('超时后服务仍健康', healthAfterSlow.status === 200);

  // 进程宕机
  await stopServer(server);
  let downError = '';
  try {
    await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) });
  } catch (error) {
    downError = error.name;
  }
  assert('进程停止后请求失败', downError !== '', downError);

  // 重启并从状态文件恢复
  server = await startServer();
  base = `http://127.0.0.1:${server.port}`;
  const recovered = await fetch(`${base}/state`).then((response) => response.json());
  assert('重启后 health=200', (await fetch(`${base}/health`)).status === 200);
  assert('状态文件恢复 ok=95', recovered.ok === 95, JSON.stringify(recovered));

  fs.writeFileSync(path.join(EVIDENCE, 'slo.json'), JSON.stringify(slo, null, 2) + '\n');
  fs.writeFileSync(
    path.join(EVIDENCE, 'recovery.txt'),
    [
      `timeout_error=${timeoutName}`,
      `down_error=${downError}`,
      `recovered_ok=${recovered.ok}`,
      'recovery: restart -> health 200 -> state.ok == 95',
    ].join('\n') + '\n',
  );

  await stopServer(server);
}

try {
  await main();
} finally {
  const failed = results.filter((item) => !item.pass);
  console.log(`checks=${results.length} fails=${failed.length} : ${failed.length === 0 ? 'PASS' : 'FAIL'}`);
  if (failed.length) process.exitCode = 1;
}