import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5185, proxy: { '/api': { target: 'http://127.0.0.1:8797', rewrite: (p) => p.replace(/^\/api/, '') } } },
  preview: { port: 4185, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8797', rewrite: (p) => p.replace(/^\/api/, '') } } },
});
