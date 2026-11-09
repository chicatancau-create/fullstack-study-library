import { useState } from 'react';
import type { Filter, Item } from './types';

export type Snapshot = { now: number; requestId: string };

/** 服务端与客户端各自取时间/随机数，作为 hydration 反例。 */
export function Clock({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div aria-label="clock">
      <time dateTime={new Date(snapshot.now).toISOString()}>{new Date(snapshot.now).toLocaleString('zh-CN')}</time>
      <span data-testid="request-id">{snapshot.requestId}</span>
    </div>
  );
}

export function BadHydration() {
  return <Clock snapshot={{ now: Date.now(), requestId: Math.random().toString(36).slice(2) }} />;
}

/** 修复：时间与随机 ID 由服务端序列化后注入，客户端首帧复用同一快照。 */
export function GoodHydration({ snapshot }: { snapshot: Snapshot }) {
  return <Clock snapshot={snapshot} />;
}

export function serverSnapshot(now = Date.now(), requestId = Math.random().toString(36).slice(2)): Snapshot {
  return { now, requestId };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 真实路由切换的最小复现：A 慢、B 快，先点 A 再点 B。 */
export function RouteRace() {
  const [filter, setFilter] = useState<Filter>('a');
  const [items, setItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [controller, setController] = useState<AbortController | null>(null);
  const [loading, setLoading] = useState(false);

  async function go(next: Filter) {
    controller?.abort();
    const current = new AbortController();
    setController(current);
    setFilter(next);
    setLoading(true);
    setEvents((prev) => [...prev, `start:${next}`]);
    try {
      const res = await fetch(`/api/items?filter=${next}`, { signal: current.signal });
      const data = (await res.json()) as Item[];
      if (current.signal.aborted) return;
      setItems(data);
      setEvents((prev) => [...prev, `apply:${next}`]);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setEvents((prev) => [...prev, `error:${next}`]);
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }

  return (
    <section aria-label="route-race">
      <h2>路由切换竞态</h2>
      <div role="group" aria-label="路由">
        <button type="button" aria-pressed={filter === 'a'} onClick={() => void go('a')}>路由 A</button>
        <button type="button" aria-pressed={filter === 'b'} onClick={() => void go('b')}>路由 B</button>
      </div>
      {loading && <p role="status">加载中…</p>}
      <ul aria-label="route-items">
        {items.map((item) => <li key={item.id}>{item.title}</li>)}
      </ul>
      <ol aria-label="route-events">
        {events.map((event, index) => <li key={`${event}-${index}`}>{event}</li>)}
      </ol>
    </section>
  );
}

export async function fakeLoad(filter: Filter, ms: number): Promise<Item[]> {
  await delay(ms);
  return filter === 'a' ? [{ id: 1, title: 'A 记录' }] : [{ id: 2, title: 'B 记录' }];
}
