const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const net = require('net');
const { URL } = require('url');

const ROOT = path.join('/home/rnk/rnkstudios-site', 'dist');
// Origins allowed to read /api/* responses with credentials. Anything else
// gets no ACAO header, so the browser blocks the read — reflected-origin
// with credentials would let any site read authenticated responses.
const ALLOWED_ORIGINS = new Set([
  'https://rnkstudios.uk',
  'https://www.rnkstudios.uk',
  'https://gift.rnkstudios.uk',
]);
const API_HOST = '127.0.0.1';
const API_PORT = Number(process.env.RNK_API_PORT || 3001);
const LIVEKIT_HOST = '127.0.0.1';
const LIVEKIT_PORT = 7880;
const PORT = Number(process.env.PORT || 3003);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
};

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function contentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function readFileOrNull(filePath) {
  try {
    return await fsp.readFile(filePath);
  } catch {
    return null;
  }
}

function proxyToApi(req, res) {
  const target = new URL(req.url, `http://${API_HOST}:${API_PORT}`);
  const headers = { ...req.headers, host: `${API_HOST}:${API_PORT}` };
  delete headers['content-length'];

  const proxyReq = http.request(
    {
      hostname: API_HOST,
      port: API_PORT,
      path: target.pathname + target.search,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const proxyHeaders = { ...proxyRes.headers };
      // this proxy owns CORS for /api/* — never let a backend's own (possibly
      // permissive) headers leak past the allowlist
      delete proxyHeaders['access-control-allow-origin'];
      delete proxyHeaders['access-control-allow-credentials'];
      const origin = req.headers.origin;
      if (origin && ALLOWED_ORIGINS.has(origin)) {
        proxyHeaders['access-control-allow-origin'] = origin;
        proxyHeaders['access-control-allow-credentials'] = 'true';
        proxyHeaders.vary = proxyHeaders.vary
          ? `${proxyHeaders.vary}, Origin`
          : 'Origin';
      }
      res.writeHead(proxyRes.statusCode || 502, proxyHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (error) => {
    send(res, 502, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ ok: false, error: error.message }));
  });

  req.pipe(proxyReq);
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(requestUrl.pathname);
  const safePath = path.normalize(path.join(ROOT, pathname));

  // path.relative is the exact test: ROOT itself is '' (served as index.html
  // below), anything inside is a plain relative path, and anything outside —
  // siblings included, which a startsWith(ROOT) check lets through — comes
  // back absolute or ../-prefixed.
  const rel = path.relative(ROOT, safePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
  }

  let resolved = safePath;
  let stat = null;
  try {
    stat = await fsp.stat(resolved);
  } catch {
    stat = null;
  }

  if (!stat) {
    resolved = path.join(ROOT, 'index.html');
    stat = await fsp.stat(resolved);
  } else if (stat.isDirectory()) {
    resolved = path.join(resolved, 'index.html');
    stat = await fsp.stat(resolved);
  }

  const body = await readFileOrNull(resolved);
  if (!body) {
    const index = await readFileOrNull(path.join(ROOT, 'index.html'));
    if (!index) {
      return send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Missing built website');
    }
    return send(res, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, index);
  }

  send(res, 200, {
    'Content-Type': contentType(resolved),
    'Content-Length': body.length,
    'Cache-Control': resolved.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable',
  }, body);
}

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    const headers = {
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers.Vary = 'Origin';
    }
    res.writeHead(204, headers);
    return res.end();
  }

  if (req.url.startsWith('/api/')) {
    return proxyToApi(req, res);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Method Not Allowed');
  }

  return serveStatic(req, res);
});

// ── WebSocket upgrade — proxy /livekit to LiveKit server on port 7880 ─────────
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/livekit')) {
    socket.destroy();
    return;
  }

  // Rewrite path: /livekit → / (LiveKit expects connections at root)
  const rewrittenPath = req.url.replace(/^\/livekit/, '') || '/';

  const proxy = net.createConnection({ host: LIVEKIT_HOST, port: LIVEKIT_PORT }, () => {
    // Forward the original HTTP upgrade request with rewritten path
    const upgradeReq = [
      `${req.method} ${rewrittenPath} HTTP/1.1`,
      ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`),
      '',
      '',
    ].join('\r\n');
    proxy.write(upgradeReq);
    if (head && head.length) proxy.write(head);
  });

  proxy.on('data', (data) => socket.write(data));
  proxy.on('end', () => socket.end());
  proxy.on('error', () => socket.destroy());
  socket.on('data', (data) => proxy.write(data));
  socket.on('end', () => proxy.end());
  socket.on('error', () => proxy.destroy());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RNK Studios site listening on http://0.0.0.0:${PORT}`);
});
