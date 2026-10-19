import { defineConfig, type Plugin } from 'vite';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';

const legacyDir = resolve(import.meta.dirname, '../public/copperlichtdata');
const assetsDir = resolve(import.meta.dirname, 'public/assets');

/**
 * Dev-only helper for tools/extract-ccb: serves the CopperLicht engine and scene
 * under /legacy/ and lets the extraction page write the converted files into public/assets.
 */
function legacyExtraction(): Plugin {
  return {
    name: 'legacy-extraction',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/legacy/', (req, res, next) => {
        const file = normalize(join(legacyDir, decodeURIComponent(req.url ?? '').split('?')[0]));
        if (!file.startsWith(legacyDir) || !existsSync(file)) return next();
        createReadStream(file).pipe(res);
      });
      server.middlewares.use('/__save', (req, res) => {
        const target = normalize(join(assetsDir, new URL(req.url ?? '', 'http://x').searchParams.get('path') ?? ''));
        if (req.method !== 'POST' || !target.startsWith(assetsDir)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [legacyExtraction()],
  server: { host: '127.0.0.1' },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), radio: resolve(import.meta.dirname, 'radio.html') },
    },
  },
});
