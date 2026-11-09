import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const LabPanel = lazy(() => import('./lab/LabPanel'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Suspense fallback={<p>lab loading</p>}>
      <LabPanel />
    </Suspense>
  </StrictMode>,
);
