import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoodList } from './GoodList';
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
    <GoodList load={demoLoader} />
  </StrictMode>,
);