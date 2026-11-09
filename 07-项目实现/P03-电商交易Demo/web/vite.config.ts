import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5184, proxy: { '/api': { target: 'http://127.0.0.1:8796', rewrite: (p) => p.replace(/^\/api/, '') } } },
  preview: { port: 4184, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8796', rewrite: (p) => p.replace(/^\/api/, '') } } },
});
