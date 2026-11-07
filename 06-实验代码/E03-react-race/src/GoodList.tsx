import { useEffect, useState } from 'react';
import type { Filter, Item, Loader } from './types';

/** 修复：AbortController + cancelled 版本校验，旧请求晚到不得写入。 */
export function GoodList({ load }: { load: Loader }) {
  const [filter, setFilter] = useState<Filter>('a');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError('');

    load(filter, controller.signal).then(
      (data) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false);
      },
      (reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : '加载失败');
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filter, load]);

  return (
    <section aria-label="good-list">
      <div role="group" aria-label="筛选">
        <button type="button" aria-pressed={filter === 'a'} onClick={() => setFilter('a')}>A</button>
        <button type="button" aria-pressed={filter === 'b'} onClick={() => setFilter('b')}>B</button>
      </div>
      {loading && <p role="status">加载中…</p>}
      {error && <p role="alert">{error}</p>}
      <ul>
        {items.map((item) => <li key={item.id}>{item.title}</li>)}
      </ul>
    </section>
  );
}