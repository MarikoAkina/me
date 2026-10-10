const path = require('node:path');
const fs = require('node:fs/promises');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

function isInternalURL(value) {
  try { const u = new URL(value); return u.protocol === 'sqllab:' && u.hostname === 'app' && !u.port && !u.username && !u.password; }
  catch { return false; }
}
function isExternalURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; }
  catch { return false; }
}
function resolveAsset(root, value) {
  if (!isInternalURL(value)) return null;
  try {
    const raw = decodeURIComponent(new URL(value).pathname);
    if (raw.includes('\0') || raw.includes('\\')) return null;
    const relative = raw === '/' ? 'index.html' : raw.slice(1);
    const file = path.resolve(root, relative);
    const check = path.relative(root, file);
    if (!check || check.startsWith('..') || path.isAbsolute(check) || !MIME[path.extname(file).toLowerCase()]) return null;
    return file;
  } catch { return null; }
}
function createHandler(root) {
  return async request => {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405});
    const file = resolveAsset(root, request.url);
    if (!file) return new Response('Not found', {status: 404});
    try {
      const data = await fs.readFile(file);
      return new Response(request.method === 'HEAD' ? null : data, {headers: {
        'Content-Type': MIME[path.extname(file).toLowerCase()],
        'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff',
      }});
    } catch { return new Response('Not found', {status: 404}); }
  };
}
module.exports = {isInternalURL, isExternalURL, resolveAsset, createHandler};
