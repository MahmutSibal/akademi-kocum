// Flutter web derlemesini (build/web) yerelde sunar:  node tools/serve-web.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'build', 'web');
const port = Number(process.env.PORT || process.argv[2] || 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.otf': 'font/otf', '.ttf': 'font/ttf' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '');
  const file = join(root, path || 'index.html');
  try {
    const body = await readFile(file.startsWith(root) ? file : join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(await readFile(join(root, 'index.html')));
  }
}).listen(port, () => console.log(`Akademi Koçum web: http://localhost:${port}`));
