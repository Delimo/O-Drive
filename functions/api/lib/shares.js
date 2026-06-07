import { addLog, encodeBase64Url, formatBytes, isReservedKey, jsonResponse, normalizeName } from './common.js';
import { handleDownloadOrPreview } from './file-reads.js';

const EXPIRED_SHARE_AUTO_DELETE_MS = 7 * 24 * 60 * 60 * 1000;

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
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER NOT NULL DEFAULT 0
  )
`;

async function runStatement(statement) {
  if (typeof statement.bind === 'function') return statement.bind().run();
  return statement.run();
}

export async function ensureShareTable(env) {
  if (!env?.D1) return;
  await runStatement(env.D1.prepare(SHARE_TABLE_SQL));
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
    const name = path.split('/').pop() || path;
    const contentType = meta.httpMetadata?.contentType || meta.contentType || '';
    await env.D1.prepare(
      `INSERT INTO share_links
       (token, path, name, size, content_type, allow_preview, allow_download, expires_at, max_downloads, download_count, created_at, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)`
    ).bind(token, path, name, Number(meta.size || 0), contentType, allowPreview, allowDownload, expiresAt, maxDownloads, Date.now()).run();
    await addLog(env, request, 'SHARE_CREATE', path);
    return jsonResponse({ success: true, item: mapShare({ token, path, name, size: Number(meta.size || 0), content_type: contentType, allow_preview: allowPreview, allow_download: allowDownload, expires_at: expiresAt, max_downloads: maxDownloads, download_count: 0, created_at: Date.now(), last_accessed_at: 0 }) });
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
  const match = path.match(/^\/api\/share\/([^/]+)\/(info|preview|download)$/);
  if (!match || request.method !== 'GET') return null;
  const token = decodeURIComponent(match[1]);
  const action = match[2];
  const row = await getShare(env, token);
  if (!row) return jsonResponse({ success: false, message: 'Share link not found' }, 404);

  const item = mapShare(row);
  if (item.expired) return expiredResponse(env, token);
  if (item.exhausted) return exhaustedResponse(env, token);

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
