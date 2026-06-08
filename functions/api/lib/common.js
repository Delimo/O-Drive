import { ensureCoreTables } from './schema.js';

export { ensureCoreTables } from './schema.js';

const SYSTEM_WARNING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SYSTEM_WARNING_RETENTION_ROWS = 100;
const LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const LOG_RETENTION_ROWS = 2000;

/**
 * Cloudflare Workers environment bindings.
 * @typedef {Object} Env
 * @property {D1Database} D1 - D1 SQL database binding
 * @property {R2Bucket} R2 - R2 object storage bucket binding
 * @property {string} [ADMIN_PASSWORD] - Admin password
 * @property {string} [TOKEN_SECRET] - HMAC signing secret
 */

/**
 * Create a JSON HTTP response.
 * @param {any} data - Response body (will be JSON-serialized)
 * @param {number} [status=200] - HTTP status code
 * @param {Record<string,string>} [headers={}] - Additional response headers
 * @returns {Response}
 */
export const jsonResponse = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export function apiError(code, message, status = 400, extra = {}, headers = {}) {
  return jsonResponse({ success: false, code, message, ...extra }, status, headers);
}

/**
 * Format a byte count into a human-readable string.
 * @param {number} bytes
 * @param {number} [decimals=2]
 * @returns {string}
 */
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

const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
const MAX_NAME_BYTES = 255;

/**
 * Validate and normalize a file/folder name.
 * Rejects path traversal, control characters, Windows reserved names, and overlong names.
 * @param {string} name
 * @returns {string} The cleaned name
 * @throws {Error} If the name is invalid
 */
export function normalizeName(name) {
  const clean = String(name || '').trim();
  if (!clean || clean === '.' || clean === '..' || /[\/\\\0]/.test(clean) || /[\u0000-\u001f\u007f]/.test(clean)) {
    throw new Error('Invalid name');
  }
  if (WINDOWS_RESERVED.test(clean)) throw new Error('Invalid name: reserved name');
  const encoder = new TextEncoder();
  if (encoder.encode(clean).byteLength > MAX_NAME_BYTES) throw new Error('Invalid name: too long');
  return clean;
}

export function normalizeHiddenPath(path) {
  const clean = String(path || '').trim().replace(/^\/+|\/+$/g, '');
  if (!clean) throw new Error('Invalid path');
  return clean.split('/').map(normalizeName).join('/');
}

/**
 * Check if a key matches any hidden path prefix.
 * @param {string} key - R2 object key
 * @param {string[]} hiddenPaths - List of hidden path prefixes
 * @returns {boolean}
 */
export function isHiddenKey(key, hiddenPaths) {
  return hiddenPaths.some(hp => key === hp || key.startsWith(hp + '/'));
}

export const RESERVED_PREFIXES = ['.trash', '.thumbs', '.meta', '.system'];

/**
 * Check if a key targets a reserved system path (.trash, .thumbs, .meta, .system).
 * @param {string} key
 * @returns {boolean}
 */
export function isReservedKey(key) {
  const clean = String(key || '').replace(/^\/+|\/+$/g, '');
  return RESERVED_PREFIXES.some(prefix => clean === prefix || clean.startsWith(prefix + '/'));
}

export function isTrashKey(key) {
  const clean = String(key || '').replace(/^\/+|\/+$/g, '');
  return clean === '.trash' || clean.startsWith('.trash/');
}

/**
 * Insert an audit log entry into D1.
 * Errors are silently swallowed to avoid breaking the main operation.
 * @param {Env} env
 * @param {Request} request
 * @param {string} action - Action type (e.g. 'UPLOAD', 'DELETE')
 * @param {string} details - Human-readable details
 * @returns {Promise<void>}
 */
export async function addLog(env, request, action, details) {
  await ensureCoreTables(env);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const detailText = typeof details === 'object' && details !== null
    ? String(details.details || details.message || details.targetPath || '')
    : String(details || '');
  const meta = typeof details === 'object' && details !== null ? details : {};
  try {
    await env.D1.prepare(
      `INSERT INTO logs (action, details, ip, actor, status, duration_ms, target_path, error_code, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      action,
      detailText,
      ip,
      String(meta.actor || meta.role || ''),
      String(meta.status || ''),
      Number(meta.durationMs || meta.duration_ms || 0),
      String(meta.targetPath || meta.path || ''),
      String(meta.errorCode || meta.code || ''),
      meta.metadata ? JSON.stringify(meta.metadata).slice(0, 4000) : '',
    ).run();
    await cleanupLogs(env);
  } catch (e) {
    try {
      await env.D1.prepare('INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)').bind(action, detailText, ip).run();
      await cleanupLogs(env);
    } catch (_) {}
  }
}

export async function cleanupLogs(env, now = Date.now()) {
  await ensureCoreTables(env);
  const cutoff = new Date(now - LOG_RETENTION_MS).toISOString().replace('T', ' ').slice(0, 19);
  const beforeCount = await env.D1.prepare('SELECT COUNT(*) as count FROM logs').first().catch(() => ({ count: 0 }));
  await env.D1.prepare('DELETE FROM logs WHERE timestamp < ?').bind(cutoff).run();
  await env.D1.prepare(
    'DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY timestamp DESC, id DESC LIMIT ?)'
  ).bind(LOG_RETENTION_ROWS).run();
  const afterCount = await env.D1.prepare('SELECT COUNT(*) as count FROM logs').first().catch(() => ({ count: 0 }));
  return Math.max(0, Number(beforeCount?.count || 0) - Number(afterCount?.count || 0));
}

export async function recordSystemWarning(env, source, message, level = 'warning') {
  if (!env?.D1) return;
  try {
    await ensureCoreTables(env);
    const createdAt = Date.now();
    const cleanLevel = ['error', 'warning', 'info'].includes(level) ? level : 'warning';
    await env.D1.prepare('INSERT INTO system_warnings (source, message, level, acknowledged_at, created_at) VALUES (?, ?, ?, 0, ?)')
      .bind(String(source || 'system'), String(message || 'Unknown warning').slice(0, 1000), cleanLevel, createdAt)
      .run();
    await cleanupSystemWarnings(env, createdAt);
  } catch (_) {}
}

async function cleanupSystemWarnings(env, now = Date.now()) {
  const cutoff = now - SYSTEM_WARNING_RETENTION_MS;
  await env.D1.prepare('DELETE FROM system_warnings WHERE created_at < ?').bind(cutoff).run();
  await env.D1.prepare(
    'DELETE FROM system_warnings WHERE id NOT IN (SELECT id FROM system_warnings ORDER BY created_at DESC, id DESC LIMIT ?)'
  ).bind(SYSTEM_WARNING_RETENTION_ROWS).run();
}

const MAX_BODY_SIZE = 512 * 1024; // 512 KB for JSON/regular requests
const MAX_UPLOAD_BODY_SIZE = 100 * 1024 * 1024; // 100 MB for file uploads

export function getMaxBodySize(isUpload = false) {
  return isUpload ? MAX_UPLOAD_BODY_SIZE : MAX_BODY_SIZE;
}

/**
 * Assert that the request body size does not exceed the configured limit.
 * @param {Request} request
 * @param {boolean} [isUpload=false] - Whether this is a file upload (higher limit)
 * @throws {Error} With status 413 if body is too large
 */
export function assertBodySize(request, isUpload = false) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  const limit = getMaxBodySize(isUpload);
  if (contentLength > limit) {
    const err = new Error(`Request body too large (${contentLength} > ${limit})`);
    err.status = 413;
    throw err;
  }
}

/**
 * Assert that an R2 list operation completed without truncation.
 * @param {{ truncated?: boolean }} listed - R2 list result
 * @param {string} [details='Object listing'] - Context for the error message
 * @throws {Error} With status 413 if the listing was truncated
 */
export function assertCompleteListing(listed, details = 'Object listing') {
  if (!listed?.truncated) return;
  const err = new Error(`${details} is too large to process in one request`);
  err.status = 413;
  err.code = 'LISTING_TRUNCATED';
  throw err;
}

/**
 * Paginate through R2 list results until complete or maxObjects reached.
 * @param {R2Bucket} bucket - R2 bucket instance
 * @param {Object} [options={}] - R2 list options (prefix, delimiter, cursor, etc.)
 * @param {{ maxObjects?: number }} [{ maxObjects = 10000 }={}] - Safety cap on total objects
 * @returns {Promise<{ objects: R2Object[], delimitedPrefixes: string[], truncated: boolean, cursor?: string }>}
 */
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
