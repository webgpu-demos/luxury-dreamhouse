import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative URLs: the built site works under /luxury-dreamhouse/ on GitHub Pages
  server: { host: '127.0.0.1', port: 5290 },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
