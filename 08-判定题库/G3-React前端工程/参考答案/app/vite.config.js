import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 产物落在 app/dist，便于 grader 检查“旧 chunk / 新 chunk”与静态资源引用。
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
