import { useEffect, useState } from 'react';
import type { Filter, Loader, Record } from './types';

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '进行中' },
  { value: 'done', label: '已完成' },
];

export function RecordApp({ loadRecords }: { loadRecords: Loader }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [records, setRecords] = useState<Record[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setState('loading');
    setError('');

    loadRecords(filter, controller.signal).then(
      (data) => {
        if (cancelled) return; // 旧请求晚到也不能覆盖新状态
        setRecords(data);
        setState('ready');
      },
      (reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : '加载失败');
        setState('error');
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filter, reload, loadRecords]);

  return (
    <section aria-label="学习记录">
      <div role="group" aria-label="筛选">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {state === 'loading' && <p role="status">加载中…</p>}
      {state === 'error' && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            重试
          </button>
        </div>
      )}
      {state === 'ready' && records.length === 0 && <p role="status">没有记录</p>}
      {state === 'ready' && records.length > 0 && (
        <ul>
          {records.map((record) => (
            <li key={record.id}>
              <strong>{record.title}</strong> — {record.minutes} 分钟 —{' '}
              {record.status === 'done' ? '已完成' : '进行中'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}