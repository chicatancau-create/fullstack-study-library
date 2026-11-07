import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RecordApp } from './RecordApp';
import type { Loader, Record } from './types';
import './styles.css';

const DATA: Record[] = [
  { id: 1, title: '读 HTTP 缓存', minutes: 25, status: 'done' },
  { id: 2, title: '用键盘走主路径', minutes: 30, status: 'draft' },
  { id: 3, title: 'gdb 定位越界', minutes: 20, status: 'done' },
];

const demoLoader: Loader = async (filter, signal) => {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  return filter === 'all' ? DATA : DATA.filter((record) => record.status === filter);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RecordApp loadRecords={demoLoader} />
  </StrictMode>,
);