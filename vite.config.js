import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Dev-зеркало для public/redirects.nginx.conf: читает redirects.json и
// 301-редиректит /product/<oldSlug> → /product/<newSlug> в vite-сервере.
// Прод-инстанс это делает через nginx include — эта обёртка нужна, чтобы
// в локальной разработке поведение совпадало.
function productRedirects() {
  const redirectsFile = path.resolve(process.cwd(), 'public/redirects.json');
  let cache = { mtime: 0, map: {} };
  function load() {
    try {
      const stat = fs.statSync(redirectsFile);
      if (stat.mtimeMs === cache.mtime) return cache.map;
      const raw = fs.readFileSync(redirectsFile, 'utf-8');
      cache = { mtime: stat.mtimeMs, map: JSON.parse(raw) || {} };
    } catch {
      cache = { mtime: 0, map: {} };
    }
    return cache.map;
  }
  return {
    name: 'product-redirects',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        const match = /^\/product\/([^/?#]+)/.exec(url);
        if (!match) return next();
        const target = load()[match[1]];
        if (!target) return next();
        const rest = url.slice(match[0].length);
        res.statusCode = 301;
        res.setHeader('Location', `/product/${target}${rest}`);
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), productRedirects()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
});
