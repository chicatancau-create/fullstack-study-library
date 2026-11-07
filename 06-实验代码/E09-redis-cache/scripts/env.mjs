import { command } from '../src/redis.mjs';

const port = Number(process.env.REDIS_PORT || 6379);
const pong = await command(port, 'PING');
const info = await command(port, 'INFO', 'server');
const version = String(info).split('\n').find((line) => line.startsWith('redis_version:')) || 'unknown';
console.log(`ping=${pong}`);
console.log(version.trim());
console.log(`port=${port} db=15`);