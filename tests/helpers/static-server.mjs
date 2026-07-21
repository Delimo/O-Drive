import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(modulePath, '../../..', 'public');

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json;charset=utf-8',
};

export function createStaticServer({ root = defaultRoot, port = 8788 } = {}) {
  const server = http.createServer((req, res) => {
    const requestPath = req.url.split('?')[0];
    const filePath = path.join(root, requestPath === '/' ? 'index.html' : requestPath);
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA fallback: for /admin serve admin.html
        const fallback = req.url.startsWith('/admin') || req.url.startsWith('/admin?') ? 'admin.html' : 'share.html';
        const fbPath = path.join(root, fallback);
        fs.readFile(fbPath, (err2, data2) => {
          if (err2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
          res.end(data2);
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

export async function closeStaticServer(server) {
  if (!server?.listening) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 1000);
    server.close(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const port = parseInt(process.env.PORT || '8788', 10);
  const server = await createStaticServer({ port });
  console.log(`Static server ready on http://127.0.0.1:${port}`);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, async () => {
      await closeStaticServer(server);
      process.exit(0);
    });
  }
}
