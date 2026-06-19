import { addLog, assertCompleteListing, jsonResponse } from './common.js';
import { getFileIndexEntry, listFileIndexPrefix, upsertFileIndex } from './file-index.js';
import { copyR2Object, deletePathEntry, mapWithConcurrency } from './r2-tree.js';
import {
  resolveExistingObjectLocation,
  resolveExistingStorageId,
  storageDelete,
  storageGet,
  storageList,
  storagePut,
} from './storage.js';

const TRASH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS trash (
    id TEXT PRIMARY KEY,
    original_key TEXT NOT NULL,
    trash_key TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    trashed_at INTEGER NOT NULL
  )
`;

const SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

let _trashTableReady;
let _settingsTableReady;

async function ensureTrashTable(env) {
  if (_trashTableReady) return;
  const stmt = env.D1.prepare(TRASH_TABLE_SQL);
  if (typeof stmt.bind === 'function') {
    await stmt.bind().run();
  } else {
    await stmt.run();
  }
  try {
    await env.D1.prepare("ALTER TABLE trash ADD COLUMN storage_id TEXT NOT NULL DEFAULT 'r2'").run();
  } catch (_) {}
  _trashTableReady = true;
}

async function ensureSettingsTable(env) {
  if (_settingsTableReady) return;
  const stmt = env.D1.prepare(SETTINGS_TABLE_SQL);
  if (typeof stmt.bind === 'function') {
    await stmt.bind().run();
  } else {
    await stmt.run();
  }
  _settingsTableReady = true;
}

function createTrashId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function keyExists(env, key) {
  if (await getFileIndexEntry(env, key)) return true;
  const storageId = await resolveExistingStorageId(env, key);
  if (await storageGet(env, storageId, key)) return true;
  const listed = await storageList(env, storageId, { prefix: key + '/', limit: 1 });
  return Boolean((listed.objects || []).length || (listed.delimitedPrefixes || []).length);
}

export async function softDeleteTree(env, sourceKey, request) {
  const sourceLocation = await resolveExistingObjectLocation(env, sourceKey);
  const storageId = sourceLocation.storageId;
  const exact = await storageGet(env, sourceLocation.storageId, sourceLocation.objectKey);
  const listed = await storageList(env, storageId, { prefix: sourceKey + '/' });
  assertCompleteListing(listed, `Path ${sourceKey}`);
  const entries = new Map();

  if (exact) entries.set(sourceKey, { key: sourceKey, size: exact.size || 0, indexed: Boolean(sourceLocation.indexed) });
  for (const row of await listFileIndexPrefix(env, sourceKey)) {
    entries.set(row.path, { key: row.path, size: Number(row.size || 0), indexed: true });
  }
  const newKeys = (listed.objects || []).filter(item => !entries.has(item.key)).map(item => item.key);
  if (newKeys.length) {
    const placeholders = newKeys.map(() => '?').join(',');
    const rows = await env.D1.prepare(`SELECT path FROM file_index WHERE path IN (${placeholders})`).bind(...newKeys).all().catch(() => ({ results: [] }));
    const indexedPaths = new Set((rows.results || []).map(r => r.path));
    for (const key of newKeys) {
      const item = listed.objects.find(o => o.key === key);
      entries.set(key, { key, size: item.size || 0, indexed: indexedPaths.has(key) });
    }
  }
  const entryList = [...entries.values()];
  if (entryList.length === 0) {
    throw new Error('File or folder not found');
  }

  const trashId = createTrashId();
  const trashKey = `.trash/${trashId}/${sourceKey}`;

  await mapWithConcurrency(entryList, 6, async entry => {
    const source = entry.key;
    const target = `.trash/${trashId}/${entry.key}`;
    const copied = await copyR2Object(env, source, target);
    if (!copied) return;
    const location = await resolveExistingObjectLocation(env, source);
    if (entry.indexed || location.indexed) await deletePathEntry(env, source, location.storageId, location.objectKey);
    else await storageDelete(env, location.storageId, location.objectKey);
  });

  if (!exact && entryList.length === 1 && entryList[0].key === `${sourceKey}/.folder`) {
    await storagePut(env, storageId, `${trashKey}/.folder`, new Uint8Array(0));
  }

  const kind = exact && listed.objects.length === 0 && entryList.length === 1 ? 'file' : 'folder';
  const size = exact?.size || 0;

  await ensureTrashTable(env);
  await env.D1.prepare('INSERT INTO trash (id, original_key, trash_key, name, kind, size, storage_id, trashed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(trashId, sourceKey, trashKey, sourceKey.split('/').pop() || sourceKey, kind, size, storageId, Date.now())
    .run();

  await addLog(env, request, 'TRASH', sourceKey);
  return { id: trashId, originalKey: sourceKey, trashKey, kind };
}

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

async function mapTrashRows(rows, worker, concurrency = 4) {
  const results = new Array(rows.length);
  await mapWithConcurrency(rows.map((row, index) => ({ row, index })), concurrency, async ({ row, index }) => {
    results[index] = await worker(row, index);
  });
  return results;
}

async function restoreTrashRecord(env, row, request) {
  const storageId = row.storage_id || await resolveExistingStorageId(env, row.trash_key);
  const listed = await storageList(env, storageId, { prefix: row.trash_key });
  assertCompleteListing(listed, `Trash item ${row.id}`);
  if (await keyExists(env, row.original_key)) {
    const err = new Error('Target already exists');
    err.status = 409;
    throw err;
  }
  await mapWithConcurrency(listed.objects || [], 6, async item => {
    const suffix = item.key.slice(row.trash_key.length);
    const target = row.original_key + suffix;
    const obj = await storageGet(env, storageId, item.key);
    if (obj) {
      await storagePut(env, storageId, target, obj.body, { httpMetadata: obj.httpMetadata });
      await upsertFileIndex(env, target, { ...obj, storageId, objectKey: target });
      await storageDelete(env, storageId, item.key);
    }
  });

  await env.D1.prepare('DELETE FROM trash WHERE id = ?').bind(row.id).run();
  await addLog(env, request, 'RESTORE', row.original_key);
}

async function purgeTrashRecord(env, row, request) {
  const storageId = row.storage_id || await resolveExistingStorageId(env, row.trash_key);
  const listed = await storageList(env, storageId, { prefix: row.trash_key });
  assertCompleteListing(listed, `Trash item ${row.id}`);
  await mapWithConcurrency(listed.objects || [], 8, item => storageDelete(env, storageId, item.key));
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
  return jsonResponse({ success: true, originalKey: row.original_key });
}

export async function handleTrashClear(env, request) {
  const rows = await trashRows(env);
  let deleted = 0;
  const errors = [];
  const results = await mapTrashRows(rows, async row => {
    try {
      await purgeTrashRecord(env, row, request);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  results.forEach((result, index) => {
    if (result?.ok) deleted++;
    else errors.push({ id: rows[index].id, original: rows[index].original_key, error: result?.error || 'Failed' });
  });
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
