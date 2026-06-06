/**
 * Cloudflare Workers environment bindings.
 * @typedef {Object} Env
 * @property {D1Database} D1 - D1 SQL database binding
 * @property {R2Bucket} R2 - R2 object storage bucket binding
 * @property {string} [ADMIN_PASS] - Admin password
 * @property {string} [JWT_SECRET] - JWT signing secret
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

const CORE_TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    ip TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS kv_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS api_rate_limits (
    key TEXT PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL DEFAULT 0
  )`,
];
const initializedCoreTables = new WeakSet();

async function runStatement(statement) {
  if (typeof statement.bind === 'function') return statement.bind().run();
  return statement.run();
}

/**
 * Initialize core D1 tables (settings, logs, login_attempts, kv_config, api_rate_limits).
 * Uses WeakSet to avoid re-initializing in the same request context.
 * @param {Env} env
 * @returns {Promise<void>}
 */
export async function ensureCoreTables(env) {
  if (!env?.D1) return;
  if (initializedCoreTables.has(env)) return;
  for (const sql of CORE_TABLE_SQL) {
    await runStatement(env.D1.prepare(sql));
  }
  initializedCoreTables.add(env);
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
  try { await env.D1.prepare('INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)').bind(action, details, ip).run(); } catch (e) {}
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
