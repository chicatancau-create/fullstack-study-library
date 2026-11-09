import crypto from 'node:crypto';
import { command } from './redis.mjs';

const DRIFT_MS = 2;
const CLOCK_DRIFT = 0.01;
const RELEASE_LUA = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
const EXTEND_LUA = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end';

export class Redlock {
  constructor(ports, quorum = Math.floor(ports.length / 2) + 1) {
    this.ports = ports;
    this.quorum = quorum;
  }

  async acquire(key, ttlMs = 10000) {
    const token = crypto.randomUUID();
    const started = performance.now();
    const results = await Promise.allSettled(
      this.ports.map((port) => command(port, 'SET', key, token, 'NX', 'PX', String(ttlMs))),
    );
    const okCount = results.filter((r) => r.status === 'fulfilled' && r.value === 'OK').length;
    const elapsed = performance.now() - started;
    const validity = ttlMs - elapsed - DRIFT_MS - ttlMs * CLOCK_DRIFT;
    if (okCount >= this.quorum && validity > 0) {
      return { key, token, ttlMs, validity: Number(validity.toFixed(1)), okCount };
    }
    await this.release({ key, token });
    return null;
  }

  async release(lock) {
    const results = await Promise.allSettled(
      this.ports.map((port) => command(port, 'EVAL', RELEASE_LUA, '1', lock.key, lock.token)),
    );
    return results.filter((r) => r.status === 'fulfilled' && Number(r.value) === 1).length;
  }

  async extend(lock, ttlMs = lock.ttlMs) {
    const started = performance.now();
    const results = await Promise.allSettled(
      this.ports.map((port) => command(port, 'EVAL', EXTEND_LUA, '1', lock.key, lock.token, String(ttlMs))),
    );
    const okCount = results.filter((r) => r.status === 'fulfilled' && Number(r.value) === 1).length;
    const validity = ttlMs - (performance.now() - started) - DRIFT_MS;
    if (okCount >= this.quorum && validity > 0) {
      return { ...lock, ttlMs, validity: Number(validity.toFixed(1)), okCount };
    }
    return null;
  }

  async holders(key) {
    const values = await Promise.allSettled(this.ports.map((port) => command(port, 'GET', key)));
    return values.map((r) => (r.status === 'fulfilled' ? r.value : null));
  }
}
