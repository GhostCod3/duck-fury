import { defineConfig } from 'vite';

export default defineConfig({
  base: '/duck-fury/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1600, rollupOptions: { input: ['index.html', 'classic.html'] } },
});
