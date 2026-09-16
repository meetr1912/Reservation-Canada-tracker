/* Dependency-free static server for the production build.
 * Serves ./build under the GitHub Pages path (/Reservation-Canada-tracker/)
 * so e2e tests exercise the real URL/asset structure, with an SPA fallback. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 4173);
const PREFIX = '/Reservation-Canada-tracker';
const ROOT = path.resolve(__dirname, '..', 'build');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, filePath) {
  if (filePath) {
    res.writeHead(status, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(status));
  }
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  if (url === '/' || url === PREFIX) {
    res.writeHead(302, { Location: `${PREFIX}/` });
    return res.end();
  }
  if (!url.startsWith(`${PREFIX}/`)) return send(res, 404);

  const rel = url.slice(PREFIX.length + 1);
  const candidate = path.resolve(ROOT, rel);
  if (!candidate.startsWith(ROOT)) return send(res, 403);

  fs.stat(candidate, (err, stat) => {
    if (!err && stat.isFile()) return send(res, 200, candidate);
    // SPA fallback: unknown route -> index.html
    const index = path.join(ROOT, 'index.html');
    fs.access(index, fs.constants.R_OK, (indexErr) => {
      if (indexErr) return send(res, 404);
      send(res, 200, index);
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Static server ready at http://127.0.0.1:${PORT}${PREFIX}/`);
});
