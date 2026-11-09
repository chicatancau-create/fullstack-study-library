import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

export const REDIS_BIN = process.env.REDIS_BIN
  || 'D:/Redis8/Redis-8.10.3-Windows-x64-msys2/redis-server.exe';
export const PORTS = (process.env.REDLOCK_PORTS || '7001,7002,7003').split(',').map(Number);

export function redisVersion() {
  try {
    return execFileSync(REDIS_BIN, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch (error) {
    return `unavailable: ${error.message}`;
  }
}

export function ping(port, timeout = 300) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);
    socket.on('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'));
    socket.on('data', (chunk) => {
      clearTimeout(timer);
      const ok = chunk.toString().includes('PONG');
      socket.destroy();
      resolve(ok);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export async function startCluster(ports = PORTS) {
  const procs = [];
  const started = [];
  for (const port of ports) {
    if (await ping(port, 200)) continue;
    const proc = spawn(
      REDIS_BIN,
      ['--port', String(port), '--save', '', '--appendonly', 'no', '--bind', '127.0.0.1'],
      { cwd: path.dirname(REDIS_BIN), stdio: 'ignore', windowsHide: true },
    );
    procs.push(proc);
    started.push(port);
    let ready = false;
    for (let i = 0; i < 50 && !ready; i += 1) {
      ready = await ping(port, 200);
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Redis ${port} 未就绪`);
  }
  return {
    ports,
    started,
    version: redisVersion(),
    stop: async () => {
      for (const proc of procs) proc.kill();
      await new Promise((resolve) => setTimeout(resolve, 300));
    },
  };
}
