import { useEffect, useState } from 'react';
import type { Item, Loader, Saver } from './types';

/** 乐观更新：先显示临时项，保存失败时回滚并提示。 */
export function OptimisticList({ load, save }: { load: Loader; save: Saver }) {
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    load('a', controller.signal).then(
      (data) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [load]);

  async function add() {
    const value = title.trim();
    if (!value) return;
    const temp: Item = { id: -Date.now(), title: value };
    setItems((prev) => [...prev, temp]);
    setTitle('');
    setError('');
    try {
      const saved = await save(value);
      setItems((prev) => prev.map((item) => (item.id === temp.id ? saved : item)));
    } catch (reason: unknown) {
      setItems((prev) => prev.filter((item) => item.id !== temp.id));
      setError(reason instanceof Error ? reason.message : '保存失败');
    }
  }

  return (
    <section aria-label="optimistic-list">
      <label htmlFor="new-title">新记录</label>
      <input id="new-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <button type="button" onClick={() => void add()}>添加</button>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">加载中…</p>}
      <ul>
        {items.map((item) => <li key={item.id}>{item.title}</li>)}
      </ul>
    </section>
  );
}