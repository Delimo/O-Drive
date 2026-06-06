/**
 * @typedef {import('./common.js').Env} Env
 * @typedef {{ success: boolean, message?: string, code?: string }} ApiError
 * @typedef {ApiError & { completed?: number, failed?: Array<{path: string, message: string}> }} BatchResult
 */

import { jsonResponse, normalizeName, addLog, isReservedKey, listR2Objects, assertCompleteListing } from './common.js';
import { deleteFileIndexKey, deleteFileIndexPrefix, upsertFileIndex } from './file-index.js';
import { copyR2Object, copyTree, mapWithConcurrency } from './r2-tree.js';
import { checkQuota, formatBytes as formatQuotaBytes } from './storage-quota.js';

const TRASH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS trash (
    id TEXT PRIMARY KEY,
    original_key TEXT NOT NULL,
    trash_key TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    trashed_at INTEGER NOT NULL
  )
`;

const SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

/**
 * Ensure the trash and settings D1 tables exist.
 * @param {Env} env
 * @returns {Promise<void>}
 */
async function ensureTrashTable(env) {
  const stmt = env.D1.prepare(TRASH_TABLE_SQL);
  if (typeof stmt.bind === 'function') {
    await stmt.bind().run();
    return;
  }
  await stmt.run();
}

async function ensureSettingsTable(env) {
  const stmt = env.D1.prepare(SETTINGS_TABLE_SQL);
  if (typeof stmt.bind === 'function') {
    await stmt.bind().run();
    return;
  }
  await stmt.run();
}

/** Generate a unique trash record ID. @returns {string} */
function createTrashId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Throw if the key targets a reserved system path.
 * @param {string} key
 * @throws {Error}
 */
function assertUserKey(key) {
  if (isReservedKey(key)) throw new Error('Reserved system path');
}

function normalizeDir(path) {
  const clean = String(path || '').trim().replace(/^\/+|\/+$/g, '');
  return clean ? clean.split('/').map(normalizeName).join('/') : '';
}

function normalizeUserKey(key) {
  const clean = String(key || '').trim().replace(/^\/+|\/+$/g, '');
  if (!clean) throw new Error('Invalid path');
  return clean.split('/').map(normalizeName).join('/');
}

function assertPathList(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 100) {
    throw new Error('Invalid paths');
  }
  return paths.map(normalizeUserKey);
}

function estimatePathList(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 100) {
    throw new Error('Invalid paths');
  }
  return paths.map(normalizeUserKey);
}

/**
 * Check if a key exists in R2 (as object or prefix).
 * @param {Env} env
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function keyExists(env, key) {
  if (await env.R2.head(key)) return true;
  const listed = await env.R2.list({ prefix: key + '/', limit: 1 });
  return Boolean((listed.objects || []).length || (listed.delimitedPrefixes || []).length);
}

async function assertTargetAvailable(env, key) {
  if (await keyExists(env, key)) {
    const err = new Error('Target already exists');
    err.status = 409;
    throw err;
  }
}

/**
 * Resolve upload filename conflict.
 * @param {Env} env
 * @param {string} key - Target R2 key
 * @param {'error'|'overwrite'|'rename'|'skip'} mode
 * @returns {Promise<{key: string, skipped: boolean, conflict: boolean}>}
 */
async function resolveUploadConflict(env, key, mode = 'error') {
  const conflictMode = ['error', 'overwrite', 'rename', 'skip'].includes(mode) ? mode : 'error';
  if (!(await keyExists(env, key))) return { key, skipped: false, conflict: false };
  if (conflictMode === 'skip') return { key, skipped: true, conflict: true };
  if (conflictMode === 'overwrite') return { key, skipped: false, conflict: true };
  if (conflictMode !== 'rename') {
    const err = new Error('Target already exists');
    err.status = 409;
    throw err;
  }

  const slash = key.lastIndexOf('/');
  const dir = slash >= 0 ? key.slice(0, slash + 1) : '';
  const name = slash >= 0 ? key.slice(slash + 1) : key;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i <= 999; i++) {
    const candidate = `${dir}${base} (${i})${ext}`;
    if (!(await keyExists(env, candidate))) return { key: candidate, skipped: false, conflict: true };
  }
  throw new Error('Unable to generate unique filename');
}

async function softDeleteTree(env, sourceKey, request) {
  const exact = await env.R2.get(sourceKey);
  const listed = await listR2Objects(env.R2, { prefix: sourceKey + '/' });
  assertCompleteListing(listed, `Path ${sourceKey}`);
  const entries = [];

  if (exact) entries.push({ key: sourceKey, size: exact.size || 0 });
  for (const item of listed.objects || []) entries.push({ key: item.key, size: item.size || 0 });
  if (entries.length === 0) {
    throw new Error('File or folder not found');
  }

  const trashId = createTrashId();
  const trashKey = `.trash/${trashId}/${sourceKey}`;

  await mapWithConcurrency(entries, 6, async entry => {
    const source = entry.key;
    const target = `.trash/${trashId}/${entry.key}`;
    const copied = await copyR2Object(env, source, target);
    if (copied) await env.R2.delete(source);
    if (copied) await deleteFileIndexKey(env, source);
  });

  if (!exact && entries.length === 1 && entries[0].key === `${sourceKey}/.folder`) {
    await env.R2.put(`${trashKey}/.folder`, new Uint8Array(0));
  }

  const kind = exact && listed.objects.length === 0 ? 'file' : 'folder';
  const size = exact?.size || 0;

  await ensureTrashTable(env);
  await env.D1.prepare('INSERT INTO trash (id, original_key, trash_key, name, kind, size, trashed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(trashId, sourceKey, trashKey, sourceKey.split('/').pop() || sourceKey, kind, size, Date.now())
    .run();

  await addLog(env, request, 'TRASH', sourceKey);
  return { id: trashId, originalKey: sourceKey, trashKey, kind };
}

/**
 * Handle paste (copy/move) operation.
 * @param {Env} env
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handlePaste(env, request) {
  const { action, paths, targetDir } = await request.json();
  if (!['copy', 'move'].includes(action)) return jsonResponse({ success: false, message: 'Invalid paste action' }, 400);
  const normalizedPaths = assertPathList(paths);
  let destDir = normalizeDir(targetDir);
  if (destDir !== '') destDir += '/';
  const failed = [];
  let completed = 0;

  for (const srcKey of normalizedPaths) {
    try {
      const sourceName = normalizeName(srcKey.split('/').pop());
      const destKey = destDir + sourceName;
      assertUserKey(srcKey);
      assertUserKey(destKey);
      if (srcKey === destKey) continue;
      if (!(await keyExists(env, srcKey))) throw new Error('File or folder not found');
      await assertTargetAvailable(env, destKey);
      await copyTree(env, srcKey, destKey, action === 'move');
      completed++;
    } catch (e) {
      failed.push({ path: srcKey, message: e.message || 'Failed' });
    }
  }

  await addLog(env, request, action.toUpperCase(), `Batch paste to ${targetDir}`);
  return jsonResponse({ success: failed.length === 0, completed, failed }, failed.length && !completed ? 409 : 200);
}

/**
 * Handle file/folder rename.
 * @param {Env} env
 * @param {Request} request
 * @param {string} r2Key
 * @returns {Promise<Response>}
 */
export async function handleRename(env, request, r2Key) {
  const { newName } = await request.json();
  const cleanName = normalizeName(newName);
  r2Key = normalizeUserKey(r2Key);
  const parentDir = r2Key.includes('/') ? r2Key.substring(0, r2Key.lastIndexOf('/') + 1) : '';
  const newKey = parentDir + cleanName;
  assertUserKey(r2Key);
  assertUserKey(newKey);
  if (r2Key === newKey) return jsonResponse({ success: true });
  if (r2Key !== newKey) await assertTargetAvailable(env, newKey);
  await copyTree(env, r2Key, newKey, true);
  await addLog(env, request, 'RENAME', `${r2Key} -> ${cleanName}`);
  return jsonResponse({ success: true });
}

/**
 * Handle batch soft-delete (move to trash).
 * @param {Env} env
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleBatchDelete(env, request) {
  const { paths } = await request.json();
  const normalizedPaths = assertPathList(paths);
  const failed = [];
  let completed = 0;
  for (const p of normalizedPaths) {
    try {
      assertUserKey(p);
      await softDeleteTree(env, p, request);
      completed++;
    } catch (e) {
      failed.push({ path: p, message: e.message || 'Failed', code: e.code || undefined });
    }
  }
  await addLog(env, request, 'DELETE', `Move to trash ${completed}/${normalizedPaths.length} items`);
  return jsonResponse({ success: failed.length === 0, completed, failed }, failed.length && !completed ? 400 : 200);
}

/**
 * Estimate the cost of an operation before executing it.
 * @param {Env} env
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleOperationEstimate(env, request) {
  const { paths } = await request.json();
  const normalizedPaths = estimatePathList(paths);
  const items = [];
  let totalObjects = 0;
  let truncated = false;
  const maxObjectsPerRequest = 1000;

  for (const key of normalizedPaths) {
    assertUserKey(key);
    const exact = await env.R2.head(key);
    const listed = await listR2Objects(env.R2, { prefix: key + '/' }, { maxObjects: 1001 });
    const childCount = (listed.objects || []).length;
    const isFolder = childCount > 0;
    const exists = Boolean(exact || isFolder);
    const objectCount = (exact ? 1 : 0) + childCount;
    totalObjects += objectCount;
    truncated = truncated || Boolean(listed.truncated);
    items.push({
      path: key,
      exists,
      kind: isFolder ? 'folder' : 'file',
      objectCount,
      truncated: Boolean(listed.truncated),
    });
  }

  return jsonResponse({
    success: true,
    items,
    totalObjects,
    truncated,
    large: truncated || totalObjects > 500,
    shouldBatch: truncated || totalObjects > maxObjectsPerRequest,
    recommendedBatchSize: maxObjectsPerRequest,
  });
}

/**
 * Create a new folder.
 * @param {Env} env
 * @param {Request} request
 * @param {string} r2Key
 * @returns {Promise<Response>}
 */
export async function handleMkdir(env, request, r2Key) {
  const { folderName } = await request.json();
  const cleanName = normalizeName(folderName);
  const dir = r2Key ? normalizeUserKey(r2Key) + '/' : '';
  const folderKey = dir + cleanName;
  const key = folderKey + '/.folder';
  assertUserKey(key);
  await assertTargetAvailable(env, folderKey);
  await env.R2.put(key, new Uint8Array(0));
  await addLog(env, request, 'MKDIR', cleanName);
  return jsonResponse({ success: true });
}

/**
 * Handle single-file upload to R2.
 * @param {Env} env
 * @param {Request} request
 * @param {string} r2Key
 * @returns {Promise<Response>}
 */
export async function handleUpload(env, request, r2Key) {
  const file = (await request.formData()).get('file');
  if (!file || typeof file.stream !== 'function') return jsonResponse({ success: false, message: 'Missing file' }, 400);
  const quota = await checkQuota(env, Number(file.size || 0));
  if (!quota.allowed) {
    return jsonResponse(
      { success: false, code: 'QUOTA_EXCEEDED', message: `Storage quota exceeded. Used: ${formatQuotaBytes(quota.used)}, Quota: ${formatQuotaBytes(quota.quota)}, Requested: ${formatQuotaBytes(file.size || 0)}` },
      507,
    );
  }
  const cleanName = normalizeName((file?.name || '').split(/[\/\\]/).pop());
  const key = (r2Key ? normalizeUserKey(r2Key) + '/' : '') + cleanName;
  const conflict = new URL(request.url).searchParams.get('conflict') || 'error';
  assertUserKey(key);
  const resolved = await resolveUploadConflict(env, key, conflict);
  if (resolved.skipped) return jsonResponse({ success: true, skipped: true, key });
  await env.R2.put(resolved.key, file.stream(), { httpMetadata: { contentType: file.type } });
  await upsertFileIndex(env, resolved.key, { size: file.size, contentType: file.type, uploaded: Date.now() });
  await addLog(env, request, resolved.conflict ? 'UPLOAD_CONFLICT' : 'UPLOAD', resolved.key);
  return jsonResponse({ success: true, key: resolved.key, renamed: resolved.key !== key });
}

function uploadKey(targetDir, name) {
  let destDir = normalizeDir(targetDir);
  if (destDir) destDir += '/';
  return destDir + normalizeName(String(name || '').split(/[\/\\]/).pop());
}

/**
 * Initiate a multipart upload.
 * @param {Env} env
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleMultipartCreate(env, request) {
  const { targetDir, name, type, conflict = 'error' } = await request.json();
  const key = uploadKey(targetDir, name);
  assertUserKey(key);
  const resolved = await resolveUploadConflict(env, key, conflict);
  if (resolved.skipped) return jsonResponse({ key, skipped: true });
  const upload = await env.R2.createMultipartUpload(resolved.key, {
    httpMetadata: { contentType: type || 'application/octet-stream' },
  });
  return jsonResponse({ key: upload.key, uploadId: upload.uploadId, renamed: resolved.key !== key });
}

export async function handleMultipartPart(env, request, url) {
  const key = url.searchParams.get('key');
  const uploadId = url.searchParams.get('uploadId');
  const partNumber = Number(url.searchParams.get('partNumber'));
  if (!key || !uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
    return jsonResponse({ success: false, message: 'Invalid multipart part request' }, 400);
  }
  assertUserKey(key);
  if (!request.body) return jsonResponse({ success: false, message: 'Missing request body' }, 400);
  const upload = env.R2.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);
  return jsonResponse(part);
}

export async function handleMultipartComplete(env, request) {
  const { key, uploadId, parts } = await request.json();
  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return jsonResponse({ success: false, message: 'Invalid multipart complete request' }, 400);
  }
  assertUserKey(key);
  const upload = env.R2.resumeMultipartUpload(key, uploadId);
  const object = await upload.complete(parts.sort((a, b) => a.partNumber - b.partNumber));
  const meta = await env.R2.head(key);
  await upsertFileIndex(env, key, meta || { uploaded: Date.now() });
  await addLog(env, request, 'UPLOAD', key);
  return jsonResponse({ success: true, key: object.key, etag: object.httpEtag });
}

export async function handleMultipartAbort(env, request) {
  const { key, uploadId } = await request.json();
  if (!key || !uploadId) return jsonResponse({ success: false, message: 'Invalid multipart abort request' }, 400);
  assertUserKey(key);
  const upload = env.R2.resumeMultipartUpload(key, uploadId);
  await upload.abort();
  await addLog(env, request, 'UPLOAD_ABORT', key);
  return jsonResponse({ success: true });
}

/**
 * Save text content to a file.
 * @param {Env} env
 * @param {Request} request
 * @param {string} r2Key
 * @returns {Promise<Response>}
 */
export async function handleSaveText(env, request, r2Key) {
  r2Key = normalizeUserKey(r2Key);
  assertUserKey(r2Key);
  const body = await request.json();
  if (typeof body.content !== 'string') return jsonResponse({ success: false, message: 'Invalid content' }, 400);
  await env.R2.put(r2Key, body.content, { httpMetadata: { contentType: 'text/plain' } });
  await upsertFileIndex(env, r2Key, { size: body.content.length, contentType: 'text/plain', uploaded: Date.now() });
  await addLog(env, request, 'SAVE_TEXT', r2Key);
  return jsonResponse({ success: true });
}

/**
 * List trash items with pagination and filtering.
 * @param {Env} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleTrashList(env, url) {
  await ensureTrashTable(env);
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const size = Math.max(1, Math.min(100, Number(url.searchParams.get('size') || '20')));
  const filters = [];
  const params = [];
  const q = String(url.searchParams.get('q') || '').trim();
  const kind = String(url.searchParams.get('kind') || '').trim();
  const from = Number(url.searchParams.get('from') || 0);
  const to = Number(url.searchParams.get('to') || 0);
  if (q) {
    filters.push('(original_key LIKE ? OR name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (['file', 'folder'].includes(kind)) {
    filters.push('kind = ?');
    params.push(kind);
  }
  if (Number.isFinite(from) && from > 0) {
    filters.push('trashed_at >= ?');
    params.push(from);
  }
  if (Number.isFinite(to) && to > 0) {
    filters.push('trashed_at <= ?');
    params.push(to);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  let totalStmt = env.D1.prepare(`SELECT COUNT(*) as count FROM trash ${where}`);
  if (params.length) totalStmt = totalStmt.bind(...params);
  const totalRes = await totalStmt.first();
  const rows = await env.D1.prepare(`SELECT * FROM trash ${where} ORDER BY trashed_at DESC LIMIT ? OFFSET ?`)
    .bind(...params, size, (page - 1) * size)
    .all();
  return jsonResponse({
    items: rows.results || [],
    totalPages: Math.max(1, Math.ceil((totalRes?.count || 0) / size)),
    currentPage: page,
    total: Number(totalRes?.count || 0),
  });
}

async function trashRows(env, where = '', params = []) {
  await ensureTrashTable(env);
  let stmt = env.D1.prepare(`SELECT * FROM trash ${where} ORDER BY trashed_at DESC`);
  if (params.length) stmt = stmt.bind(...params);
  const rows = await stmt.all();
  return rows.results || [];
}

async function restoreTrashRecord(env, row, request) {
  const listed = await listR2Objects(env.R2, { prefix: row.trash_key });
  assertCompleteListing(listed, `Trash item ${row.id}`);
  if (await keyExists(env, row.original_key)) {
    const err = new Error('Target already exists');
    err.status = 409;
    throw err;
  }
  await mapWithConcurrency(listed.objects || [], 6, async item => {
    const suffix = item.key.slice(row.trash_key.length);
    const target = row.original_key + suffix;
    const obj = await env.R2.get(item.key);
    if (obj) {
      await env.R2.put(target, obj.body, { httpMetadata: obj.httpMetadata });
      await upsertFileIndex(env, target, obj);
      await env.R2.delete(item.key);
    }
  });

  await env.D1.prepare('DELETE FROM trash WHERE id = ?').bind(row.id).run();
  await deleteFileIndexPrefix(env, row.trash_key);
  await addLog(env, request, 'RESTORE', row.original_key);
}

async function purgeTrashRecord(env, row, request) {
  const listed = await listR2Objects(env.R2, { prefix: row.trash_key });
  assertCompleteListing(listed, `Trash item ${row.id}`);
  await mapWithConcurrency(listed.objects || [], 8, item => env.R2.delete(item.key));
  await env.D1.prepare('DELETE FROM trash WHERE id = ?').bind(row.id).run();
  await addLog(env, request, 'PURGE', row.original_key);
}

export async function handleTrashRestore(env, request) {
  const { id } = await request.json();
  if (!id) return jsonResponse({ success: false, message: 'Invalid trash record' }, 400);
  await ensureTrashTable(env);
  const row = await env.D1.prepare('SELECT * FROM trash WHERE id = ?').bind(id).first();
  if (!row) return jsonResponse({ success: false, message: 'Trash item not found' }, 404);
  await restoreTrashRecord(env, row, request);
  return jsonResponse({ success: true });
}

export async function handleTrashDelete(env, request) {
  const { id } = await request.json();
  if (!id) return jsonResponse({ success: false, message: 'Invalid trash record' }, 400);
  await ensureTrashTable(env);
  const row = await env.D1.prepare('SELECT * FROM trash WHERE id = ?').bind(id).first();
  if (!row) return jsonResponse({ success: false, message: 'Trash item not found' }, 404);
  await purgeTrashRecord(env, row, request);
  return jsonResponse({ success: true });
}

export async function handleTrashClear(env, request) {
  const rows = await trashRows(env);
  let deleted = 0;
  const errors = [];
  for (const row of rows) {
    try {
      await purgeTrashRecord(env, row, request);
      deleted++;
    } catch (e) {
      errors.push({ id: row.id, original: row.original_key, error: e.message });
    }
  }
  await addLog(env, request, 'TRASH_CLEAR', `${deleted}/${rows.length} items`);
  return jsonResponse({ success: true, deleted, total: rows.length, errors: errors.length ? errors : undefined });
}

export async function handleTrashCleanup(env, request) {
  await ensureSettingsTable(env);
  const setting = await env.D1.prepare("SELECT value FROM settings WHERE key = 'trash_retention_days'").first();
  const days = Math.max(0, Number(setting?.value || 0));
  if (!days) return jsonResponse({ success: true, deleted: 0, retentionDays: days });
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await trashRows(env, 'WHERE trashed_at < ?', [cutoff]);
  let deleted = 0;
  const errors = [];
  const BATCH_SIZE = 10;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map(async row => {
      try {
        await purgeTrashRecord(env, row, request);
        deleted++;
      } catch (e) {
        errors.push({ id: row.id, original: row.original_key, error: e.message });
      }
    }));
  }
  await addLog(env, request, 'TRASH_CLEANUP', `${deleted}/${rows.length} items older than ${days} days`);
  return jsonResponse({ success: true, deleted, total: rows.length, retentionDays: days, errors: errors.length ? errors : undefined });
}

/**
 * Get or set trash retention period in days.
 * @param {Env} env
 * @param {Request} request
 * @param {string} method
 * @returns {Promise<Response>}
 */
export async function handleTrashRetention(env, request, method) {
  await ensureSettingsTable(env);
  if (method === 'GET') {
    const row = await env.D1.prepare("SELECT value FROM settings WHERE key = 'trash_retention_days'").first();
    return jsonResponse({ days: Number(row?.value || 0) });
  }
  if (method === 'PUT') {
    const body = await request.json();
    const days = Math.max(0, Math.min(3650, Number(body.days || 0)));
    await env.D1.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('trash_retention_days', ?)")
      .bind(String(days))
      .run();
    await addLog(env, request, 'TRASH_RETENTION', `${days} days`);
    return jsonResponse({ success: true, days });
  }
  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}
