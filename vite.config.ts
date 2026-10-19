import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1' },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries(['index', 'radio', 'impressum', 'datenschutz'].map((page) => [page, resolve(import.meta.dirname, `${page}.html`)])),
    },
  },
});
