import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1' },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), radio: resolve(import.meta.dirname, 'radio.html') },
    },
  },
});
