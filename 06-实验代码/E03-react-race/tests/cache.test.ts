import { describe, expect, it } from 'vitest';
import { QueryCache, badCacheKey, cacheKey, readWithSWR } from '../src/cache';

describe('缓存键', () => {
  it('反例：只用 filter 时 locale 变化命中错误数据', async () => {
    const cache = new QueryCache();
    const zh = badCacheKey({ filter: 'a', locale: 'zh-CN' });
    const en = badCacheKey({ filter: 'a', locale: 'en-US' });
    cache.set(zh, ['A-中文']);
    expect(zh).toBe(en);
    expect(cache.get<string[]>(en)?.value).toEqual(['A-中文']);
  });

  it('修复：key 含 locale 与 schemaVersion', () => {
    const zh = cacheKey({ filter: 'a', locale: 'zh-CN', schemaVersion: 1 });
    const en = cacheKey({ filter: 'a', locale: 'en-US', schemaVersion: 1 });
    const v2 = cacheKey({ filter: 'a', locale: 'zh-CN', schemaVersion: 2 });
    expect(zh).not.toBe(en);
    expect(zh).not.toBe(v2);
  });

  it('按前缀失效', () => {
    const cache = new QueryCache();
    cache.set(cacheKey({ filter: 'a' }), ['A']);
    cache.set(cacheKey({ filter: 'b' }), ['B']);
    cache.invalidate('a');
    expect(cache.get(cacheKey({ filter: 'a' }))).toBeUndefined();
    expect(cache.get(cacheKey({ filter: 'b' }))?.value).toEqual(['B']);
  });
});

describe('stale-while-revalidate', () => {
  it('首次网络、命中新鲜、过期先旧后新', async () => {
    const cache = new QueryCache();
    const key = cacheKey({ filter: 'a' });
    const first = await readWithSWR(cache, key, async () => ['v1'], { now: 0, maxAge: 100 });
    expect(first).toMatchObject({ data: ['v1'], source: 'network' });

    const fresh = await readWithSWR(cache, key, async () => ['never'], { now: 50, maxAge: 100 });
    expect(fresh).toMatchObject({ data: ['v1'], source: 'fresh' });

    const stale = await readWithSWR(cache, key, async () => ['v2'], { now: 200, maxAge: 100 });
    expect(stale).toMatchObject({ data: ['v1'], source: 'stale' });
    await stale.refresh;
    expect(cache.get<string[]>(key, { now: 200 })?.value).toEqual(['v2']);
  });
});
