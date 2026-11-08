import Redis from 'ioredis';

const TOKEN_BUCKET = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillPerSec = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local delta = math.max(0, now - ts) / 1000
tokens = math.min(capacity, tokens + delta * refillPerSec)
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, 60000)
return { allowed, tostring(tokens) }
`;

export function createRedis(url = process.env.REDIS_URL || 'redis://127.0.0.1:6379') {
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
}

export function createLoginLimiter(redis, { capacity = 20, refillPerSec = 0.2, prefix = 'p04:login' } = {}) {
  return async (identity) => {
    const key = `${prefix}:${identity}`;
    const [allowed, tokens] = await redis.eval(TOKEN_BUCKET, 1, key, String(capacity), String(refillPerSec), String(Date.now()));
    return { allowed: Number(allowed) === 1, remaining: Number(tokens) };
  };
}
