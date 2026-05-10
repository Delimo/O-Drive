export const jsonResponse = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function base64UrlToUint8Array(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeBase64Url(value) {
  return btoa(value).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function decodeBase64UrlJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(value)));
}

export function normalizeName(name) {
  const clean = String(name || '').trim();
  if (!clean || clean === '.' || clean === '..' || /[\/\\\0]/.test(clean) || /[\u0000-\u001f\u007f]/.test(clean)) {
    throw new Error('Invalid name');
  }
  return clean;
}

export function normalizeHiddenPath(path) {
  const clean = String(path || '').trim().replace(/^\/+|\/+$/g, '');
  if (!clean) throw new Error('Invalid path');
  return clean.split('/').map(normalizeName).join('/');
}

export function isHiddenKey(key, hiddenPaths) {
  return hiddenPaths.some(hp => key === hp || key.startsWith(hp + '/'));
}

export const RESERVED_PREFIXES = ['.trash', '.thumbs', '.meta', '.system'];

export function isReservedKey(key) {
  const clean = String(key || '').replace(/^\/+|\/+$/g, '');
  return RESERVED_PREFIXES.some(prefix => clean === prefix || clean.startsWith(prefix + '/'));
}

export function isTrashKey(key) {
  const clean = String(key || '').replace(/^\/+|\/+$/g, '');
  return clean === '.trash' || clean.startsWith('.trash/');
}

export async function addLog(env, request, action, details) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try { await env.DB.prepare('INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)').bind(action, details, ip).run(); } catch (e) {}
}

export async function listR2Objects(bucket, options = {}, { maxObjects = 10000 } = {}) {
  const objects = [];
  const delimitedPrefixes = [];
  let cursor = options.cursor;

  do {
    const listed = await bucket.list({ ...options, cursor });
    objects.push(...(listed.objects || []));
    delimitedPrefixes.push(...(listed.delimitedPrefixes || []));
    cursor = listed.truncated ? listed.cursor : undefined;
    if (objects.length >= maxObjects) break;
  } while (cursor);

  return {
    objects: objects.slice(0, maxObjects),
    delimitedPrefixes,
    truncated: Boolean(cursor),
    cursor,
  };
}
