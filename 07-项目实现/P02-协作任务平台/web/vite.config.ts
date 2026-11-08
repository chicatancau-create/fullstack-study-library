import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:3102', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  preview: {
    port: 4183, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3102', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
});
