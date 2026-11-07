import { useEffect, useState } from 'react';
import type { Filter, Item, Loader } from './types';

/** 反例：没有 cleanup/版本校验，旧请求晚到会覆盖新筛选结果。 */
export function BadList({ load }: { load: Loader }) {
  const [filter, setFilter] = useState<Filter>('a');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    load(filter)
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter, load]);

  return (
    <section aria-label="bad-list">
      <div role="group" aria-label="筛选">
        <button type="button" aria-pressed={filter === 'a'} onClick={() => setFilter('a')}>A</button>
        <button type="button" aria-pressed={filter === 'b'} onClick={() => setFilter('b')}>B</button>
      </div>
      {loading && <p role="status">加载中…</p>}
      <ul>
        {items.map((item) => <li key={item.id}>{item.title}</li>)}
      </ul>
    </section>
  );
}