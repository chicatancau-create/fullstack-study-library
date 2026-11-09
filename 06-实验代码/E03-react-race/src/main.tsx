import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoodList } from './GoodList';
import { RouteRace } from './Hydration';
import type { Loader } from './types';

const demoLoader: Loader = async (filter, signal) => {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  return filter === 'a'
    ? [{ id: 1, title: 'A 记录' }]
    : [{ id: 2, title: 'B 记录' }];
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1>E03 React 竞态与缓存</h1>
    <GoodList load={demoLoader} />
    <RouteRace />
  </StrictMode>,
);
