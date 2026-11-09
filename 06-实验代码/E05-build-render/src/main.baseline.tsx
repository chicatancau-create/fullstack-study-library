import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppLab } from './AppLab';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppLab />
  </StrictMode>,
);
