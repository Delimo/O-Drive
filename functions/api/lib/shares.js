import { addLog, encodeBase64Url, formatBytes, isReservedKey, jsonResponse, normalizeName } from './common.js';
import { handleDownloadOrPreview } from './file-reads.js';

const EXPIRED_SHARE_AUTO_DELETE_MS = 7 * 24 * 60 * 60 * 1000;
const SHARE_ACCESS_TTL_SECONDS = 12 * 60 * 60;
const SHARE_PASSWORD_ITERATIONS = 210000;

const SHARE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS share_links (
    token TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT '',
    allow_preview INTEGER NOT NULL DEFAULT 1,
    allow_download INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER NOT NULL DEFAULT 0,
    max_downloads INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    password_salt TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL DEFAULT 0
  )
`;
const SHARE_MIGRATION_SQL = [
  `ALTER TABLE share_links ADD COLUMN password_salt TEXT DEFAULT ''`,
  `ALTER TABLE share_links ADD COLUMN password_hash TEXT DEFAULT ''`,
];

async function runStatement(statement) {
  if (typeof statement.bind === 'function') return statement.bind().run();
  return statement.run();
}

export async function ensureShareTable(env) {
  if (!env?.D1) return;
  await runStatement(env.D1.prepare(SHARE_TABLE_SQL));
  for (const sql of SHARE_MIGRATION_SQL) {
    try {
      await runStatement(env.D1.prepare(sql));
    } catch {}
  }
}

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function pbkdf2Hex(password, salt, iterations = SHARE_PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function hashSharePassword(password, salt) {
  const hash = await pbkdf2Hex(password, salt);
  return `pbkdf2-sha256$${SHARE_PASSWORD_ITERATIONS}$${hash}`;
}

async function verifySharePassword(password, row) {
  const stored = String(row?.password_hash || '');
  const salt = String(row?.password_salt || '');
  if (!stored || !salt) return true;
  const parts = stored.split('$');
  if (parts[0] !== 'pbkdf2-sha256' || parts.length !== 3) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000) return false;
  const candidate = await pbkdf2Hex(password, salt, iterations);
  return candidate === parts[2];
}

function isSecureRequest(request) {
  return request && new URL(request.url).protocol === 'https:';
}

function cookieAttributes(request, maxAge = SHARE_ACCESS_TTL_SECONDS) {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function parseCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function shareAccessCookieName(token) {
  return `share_access_${token.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

async function signShareAccess(env, token, exp) {
  const value = `${token}.${exp}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_PASSWORD || 'o-drive'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return `${value}.${encodeBase64Url(String.fromCharCode(...new Uint8Array(sig)))}`;
}

async function hasShareAccess(env, request, token, row) {
  if (!row?.password_hash) return true;
  const value = parseCookie(request, shareAccessCookieName(token));
  if (!value) return false;
  const [cookieToken, exp, signature] = value.split('.');
  if (cookieToken !== token || !exp || !signature || Date.now() >= Number(exp) * 1000) return false;
  return value === await signShareAccess(env, token, Number(exp));
}

function sharePasswordRequiredResponse(item) {
  return jsonResponse({ success: false, code: 'SHARE_PASSWORD_REQUIRED', message: 'Share password required', hasPassword: true, item }, 403);
}

function shareToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(String.fromCharCode(...bytes));
}

function normalizeSharePath(path) {
  const clean = String(path || '').trim().replace(/^\/+|\/+$/g, '');
  if (!clean) throw new Error('Invalid path');
  const normalized = clean.split('/').map(normalizeName).join('/');
  if (isReservedKey(normalized)) {
    const err = new Error('Reserved system path');
    err.status = 403;
    throw err;
  }
  return normalized;
}

function ttlToExpiresAt(body) {
  const explicit = Number(body.expiresAt || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const days = Number(body.expiresInDays || body.days || 7);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Date.now() + Math.min(days, 3650) * 24 * 60 * 60 * 1000;
}

function mapShare(row) {
  const expiresAt = Number(row.expires_at || 0);
  const maxDownloads = Number(row.max_downloads || 0);
  const downloadCount = Number(row.download_count || 0);
  const autoDeleteAt = expiresAt > 0 ? expiresAt + EXPIRED_SHARE_AUTO_DELETE_MS : 0;
  return {
    token: row.token,
    path: row.path,
    name: row.name,
    size: Number(row.size || 0),
    sizeFormatted: formatBytes(Number(row.size || 0)),
    contentType: row.content_type || '',
    allowPreview: Number(row.allow_preview ?? 1) === 1,
    allowDownload: Number(row.allow_download ?? 1) === 1,
    hasPassword: Boolean(row.password_hash),
    expiresAt,
    expired: Boolean(expiresAt && expiresAt <= Date.now()),
    autoDeleteAt,
    maxDownloads,
    downloadCount,
    exhausted: Boolean(maxDownloads && downloadCount >= maxDownloads),
    createdAt: Number(row.created_at || 0),
    lastAccessedAt: Number(row.last_accessed_at || 0),
  };
}

function canAutoDeleteExpiredShare(row, now = Date.now()) {
  const expiresAt = Number(row?.expires_at || 0);
  return Boolean(expiresAt > 0 && expiresAt + EXPIRED_SHARE_AUTO_DELETE_MS <= now);
}

async function getShare(env, token) {
  await ensureShareTable(env);
  return env.D1.prepare('SELECT * FROM share_links WHERE token = ?').bind(token).first();
}

async function deleteShare(env, token) {
  await ensureShareTable(env);
  await env.D1.prepare('DELETE FROM share_links WHERE token = ?').bind(token).run();
}

async function cleanupExpiredShares(env, { now = Date.now(), manual = false } = {}) {
  await ensureShareTable(env);
  const expiryCutoff = manual ? now : now - EXPIRED_SHARE_AUTO_DELETE_MS;
  const rows = await env.D1.prepare(
    'SELECT token FROM share_links WHERE (expires_at > 0 AND expires_at <= ?) OR (max_downloads > 0 AND download_count >= max_downloads)'
  ).bind(expiryCutoff).all();
  const tokens = (rows.results || []).map(row => row.token).filter(Boolean);
  for (const token of tokens) {
    await env.D1.prepare('DELETE FROM share_links WHERE token = ?').bind(token).run();
  }
  return tokens.length;
}

async function expiredResponse(env, token, message = 'Share link expired') {
  const row = await getShare(env, token);
  const autoDeleteAt = row ? Number(row.expires_at || 0) + EXPIRED_SHARE_AUTO_DELETE_MS : 0;
  const shouldDelete = row ? canAutoDeleteExpiredShare(row) : true;
  if (shouldDelete) await deleteShare(env, token);
  return jsonResponse({ success: false, code: 'SHARE_EXPIRED', message, deleted: shouldDelete, autoDeleteAt }, 410);
}

async function exhaustedResponse(env, token) {
  await deleteShare(env, token);
  return jsonResponse({ success: false, code: 'SHARE_EXHAUSTED', message: 'Share download limit reached', deleted: true }, 410);
}

export async function handleAdminShares(env, request, method, url) {
  await ensureShareTable(env);
  if (method === 'GET') {
    await cleanupExpiredShares(env);
    const rows = await env.D1.prepare('SELECT * FROM share_links ORDER BY created_at DESC').all();
    return jsonResponse({ items: (rows.results || []).map(mapShare) });
  }

  if (method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'cleanup-expired') {
      const deleted = await cleanupExpiredShares(env, { manual: true });
      await addLog(env, request, 'SHARE_CLEANUP', `清理过期分享 ${deleted} 条`);
      return jsonResponse({ success: true, deleted });
    }

    const path = normalizeSharePath(body.path);
    const meta = await env.R2.head(path);
    if (!meta) return jsonResponse({ success: false, message: 'File not found' }, 404);

    const token = shareToken();
    const expiresAt = ttlToExpiresAt(body);
    const maxDownloads = Math.max(0, Math.min(1000000, Number(body.maxDownloads || 0) || 0));
    const allowPreview = body.allowPreview !== false ? 1 : 0;
    const allowDownload = body.allowDownload !== false ? 1 : 0;
    const password = String(body.password || body.sharePassword || '').trim();
    if (password && password.length < 4) return jsonResponse({ success: false, message: 'Share password too short' }, 400);
    const passwordSalt = password ? randomHex(16) : '';
    const passwordHash = password ? await hashSharePassword(password, passwordSalt) : '';
    const name = path.split('/').pop() || path;
    const contentType = meta.httpMetadata?.contentType || meta.contentType || '';
    await env.D1.prepare(
      `INSERT INTO share_links
       (token, path, name, size, content_type, allow_preview, allow_download, expires_at, max_downloads, download_count, password_salt, password_hash, created_at, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0)`
    ).bind(token, path, name, Number(meta.size || 0), contentType, allowPreview, allowDownload, expiresAt, maxDownloads, passwordSalt, passwordHash, Date.now()).run();
    await addLog(env, request, 'SHARE_CREATE', path);
    return jsonResponse({ success: true, item: mapShare({ token, path, name, size: Number(meta.size || 0), content_type: contentType, allow_preview: allowPreview, allow_download: allowDownload, expires_at: expiresAt, max_downloads: maxDownloads, download_count: 0, password_hash: passwordHash, created_at: Date.now(), last_accessed_at: 0 }) });
  }

  if (method === 'DELETE') {
    const token = url.searchParams.get('token');
    if (!token) return jsonResponse({ success: false, message: 'Missing token' }, 400);
    await deleteShare(env, token);
    await addLog(env, request, 'SHARE_DELETE', token);
    return jsonResponse({ success: true });
  }

  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}

export async function handlePublicShare(env, request, path) {
  const match = path.match(/^\/api\/share\/([^/]+)\/(info|preview|download|unlock)$/);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const action = match[2];
  if (action !== 'unlock' && request.method !== 'GET') return null;
  if (action === 'unlock' && request.method !== 'POST') return jsonResponse({ message: 'Method Not Allowed' }, 405);
  const row = await getShare(env, token);
  if (!row) return jsonResponse({ success: false, message: 'Share link not found' }, 404);

  const item = mapShare(row);
  if (item.expired) return expiredResponse(env, token);
  if (item.exhausted) return exhaustedResponse(env, token);
  if (action === 'unlock') {
    if (!item.hasPassword) return jsonResponse({ success: true });
    const body = await request.json().catch(() => ({}));
    if (!(await verifySharePassword(String(body.password || ''), row))) {
      return jsonResponse({ success: false, message: 'Invalid share password' }, 403);
    }
    const exp = Math.floor(Date.now() / 1000) + SHARE_ACCESS_TTL_SECONDS;
    const signed = await signShareAccess(env, token, exp);
    return jsonResponse(
      { success: true },
      200,
      { 'Set-Cookie': `${shareAccessCookieName(token)}=${signed}; ${cookieAttributes(request)}` }
    );
  }
  if (!(await hasShareAccess(env, request, token, row))) return sharePasswordRequiredResponse({ token, hasPassword: true });

  await env.D1.prepare('UPDATE share_links SET last_accessed_at = ? WHERE token = ?').bind(Date.now(), token).run();
  if (action === 'info') return jsonResponse({ success: true, item });
  if (action === 'preview' && !item.allowPreview) return jsonResponse({ success: false, message: 'Preview disabled' }, 403);
  if (action === 'download' && !item.allowDownload) return jsonResponse({ success: false, message: 'Download disabled' }, 403);

  const res = await handleDownloadOrPreview(env, request, action === 'download' ? `/api/download/${item.path}` : `/api/preview/${item.path}`, item.path);
  if (res.ok && action === 'download') {
    await env.D1.prepare('UPDATE share_links SET download_count = download_count + 1, last_accessed_at = ? WHERE token = ?')
      .bind(Date.now(), token)
      .run();
  }
  return res;
}
