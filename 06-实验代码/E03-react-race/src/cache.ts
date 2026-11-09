export type CacheKeyInput = { filter: string; locale?: string; schemaVersion?: number };
export type Entry<T> = { value: T; storedAt: number };

export function cacheKey({ filter, locale = 'zh-CN', schemaVersion = 1 }: CacheKeyInput): string {
  return [filter, locale, `v${schemaVersion}`].join('|');
}

/** 反例：只用 filter 做 key，locale/版本变化时会命中错误数据。 */
export function badCacheKey({ filter }: CacheKeyInput): string {
  return filter;
}

export class QueryCache {
  private store = new Map<string, Entry<unknown>>();

  set<T>(key: string, value: T, now = Date.now()): void {
    this.store.set(key, { value, storedAt: now });
  }

  get<T>(key: string, { now = Date.now(), maxAge = 5_000 } = {}): { value: T; stale: boolean } | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    return { value: hit.value as T, stale: now - hit.storedAt > maxAge };
  }

  invalidate(keyOrPrefix: string): void {
    for (const key of this.store.keys()) {
      if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}|`)) this.store.delete(key);
    }
  }

  size(): number {
    return this.store.size;
  }
}

export async function readWithSWR<T>(
  cache: QueryCache,
  key: string,
  load: () => Promise<T>,
  { now = Date.now(), maxAge = 5_000 }: { now?: number; maxAge?: number } = {},
): Promise<{ data: T; source: 'fresh' | 'stale' | 'network'; refresh?: Promise<T> }> {
  const hit = cache.get<T>(key, { now, maxAge });
  if (!hit) {
    const data = await load();
    cache.set(key, data, now);
    return { data, source: 'network' };
  }
  if (!hit.stale) return { data: hit.value, source: 'fresh' };
  const refresh = load().then((data) => {
    cache.set(key, data, now);
    return data;
  });
  return { data: hit.value, source: 'stale', refresh };
}
