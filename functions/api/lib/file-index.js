import { formatBytes, isReservedKey, listR2Objects } from './common.js';

const FILE_INDEX_SQL = `
  CREATE TABLE IF NOT EXISTS file_index (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT '',
    uploaded_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )
`;

export function indexedFileKind(key) {
  const ext = String(key || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'audio';
  if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log', 'yml', 'yaml'].includes(ext)) return 'text';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['exe', 'msi', 'app', 'deb', 'dmg'].includes(ext)) return 'exe';
  return 'other';
}

function nameOf(path) {
  return String(path || '').split('/').pop() || '';
}

function parentOf(path) {
  const parts = String(path || '').split('/');
  parts.pop();
  return parts.join('/');
}

function uploadedMs(value) {
  if (!value) return Date.now();
  if (typeof value.getTime === 'function') return value.getTime();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function indexableKey(key) {
  return Boolean(key && !isReservedKey(key) && !String(key).endsWith('/.folder'));
}

async function runStatement(statement) {
  if (typeof statement.bind === 'function') return statement.bind().run();
  return statement.run();
}

export async function ensureFileIndexTable(env) {
  if (!env?.DB) return false;
  try {
    await runStatement(env.DB.prepare(FILE_INDEX_SQL));
    return true;
  } catch (_) {
    return false;
  }
}

export async function upsertFileIndex(env, key, meta = {}) {
  if (!indexableKey(key) || !(await ensureFileIndexTable(env))) return;
  const size = Number(meta.size || 0);
  const contentType = meta.httpMetadata?.contentType || meta.contentType || '';
  const uploadedAt = uploadedMs(meta.uploaded);
  try {
    await env.DB.prepare(
      `INSERT INTO file_index (path, name, parent, kind, size, content_type, uploaded_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         name = excluded.name,
         parent = excluded.parent,
         kind = excluded.kind,
         size = excluded.size,
         content_type = excluded.content_type,
         uploaded_at = excluded.uploaded_at,
         updated_at = excluded.updated_at`
    ).bind(key, nameOf(key), parentOf(key), indexedFileKind(key), size, contentType, uploadedAt, Date.now()).run();
  } catch (_) {}
}

export async function deleteFileIndexKey(env, key) {
  if (!(await ensureFileIndexTable(env))) return;
  try {
    await env.DB.prepare('DELETE FROM file_index WHERE path = ?').bind(key).run();
  } catch (_) {}
}

export async function deleteFileIndexPrefix(env, prefix) {
  if (!(await ensureFileIndexTable(env))) return;
  const clean = String(prefix || '').replace(/^\/+|\/+$/g, '');
  try {
    await env.DB.prepare('DELETE FROM file_index WHERE path = ? OR path LIKE ?').bind(clean, `${clean}/%`).run();
  } catch (_) {}
}

export async function indexedFileCount(env) {
  if (!(await ensureFileIndexTable(env))) return 0;
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) as count FROM file_index').first();
    return Number(row?.count || 0);
  } catch (_) {
    return 0;
  }
}

export async function syncFileIndexFromR2(env, { maxObjects = 20000 } = {}) {
  if (!(await ensureFileIndexTable(env))) return { synced: 0, truncated: false };
  const listed = await listR2Objects(env.R2_BUCKET, {}, { maxObjects });
  let synced = 0;
  for (const obj of listed.objects || []) {
    if (!indexableKey(obj.key)) continue;
    await upsertFileIndex(env, obj.key, obj);
    synced++;
  }
  return { synced, truncated: Boolean(listed.truncated) };
}

export async function rebuildFileIndex(env, { maxObjects = 50000 } = {}) {
  if (!(await ensureFileIndexTable(env))) return { synced: 0, truncated: false };
  try {
    await env.DB.prepare('DELETE FROM file_index').run();
  } catch (_) {}
  return syncFileIndexFromR2(env, { maxObjects });
}

export function mapIndexRow(row) {
  const size = Number(row.size || 0);
  const time = Number(row.uploaded_at || row.updated_at || 0);
  return {
    name: row.name,
    path: '/' + row.path,
    fullKey: row.path,
    sizeFormatted: formatBytes(size),
    rawSize: size,
    time,
  };
}

export async function searchFileIndex(env, { q, scope, limit, cursor }, hiddenPaths, auth) {
  const count = await indexedFileCount(env);
  if (!count) return null;
  const offset = Math.max(0, Number(cursor || 0));
  const cleanScope = String(scope || '').replace(/^\/+|\/+$/g, '');
  const like = `%${String(q || '').toLowerCase()}%`;
  const params = cleanScope ? [like, cleanScope, `${cleanScope}/%`, limit + 1, offset] : [like, limit + 1, offset];
  const sql = cleanScope
    ? `SELECT * FROM file_index WHERE lower(name) LIKE ? AND (path = ? OR path LIKE ?) ORDER BY path ASC LIMIT ? OFFSET ?`
    : `SELECT * FROM file_index WHERE lower(name) LIKE ? ORDER BY path ASC LIMIT ? OFFSET ?`;
  try {
    const rows = await env.DB.prepare(sql).bind(...params).all();
    const items = (rows.results || [])
      .map(mapIndexRow)
      .filter(f => auth.role === 'admin' || !hiddenPaths.some(hp => f.fullKey === hp || f.fullKey.startsWith(hp + '/')));
    const page = items.slice(0, limit);
    return {
      files: page,
      nextCursor: items.length > limit ? String(offset + limit) : '',
      scanned: page.length,
      scanLimitReached: false,
    };
  } catch (_) {
    return null;
  }
}

export async function getIndexedStats(env) {
  const count = await indexedFileCount(env);
  if (!count) return null;
  try {
    const rows = await env.DB.prepare('SELECT * FROM file_index ORDER BY uploaded_at DESC LIMIT 20000').all();
    const objects = rows.results || [];
    const breakdown = {
      image: { count: 0, size: 0 },
      video: { count: 0, size: 0 },
      audio: { count: 0, size: 0 },
      text: { count: 0, size: 0 },
      archive: { count: 0, size: 0 },
      exe: { count: 0, size: 0 },
      other: { count: 0, size: 0 },
    };
    let totalSize = 0;
    for (const obj of objects) {
      const size = Number(obj.size || 0);
      const kind = obj.kind || indexedFileKind(obj.path);
      totalSize += size;
      if (!breakdown[kind]) breakdown[kind] = { count: 0, size: 0 };
      breakdown[kind].count++;
      breakdown[kind].size += size;
    }
    return {
      files: {
        count: objects.length,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        folderMarkers: 0,
        truncated: objects.length < count,
      },
      breakdown: Object.fromEntries(Object.entries(breakdown).map(([kind, value]) => [
        kind,
        { ...value, sizeFormatted: formatBytes(value.size) },
      ])),
      latest: objects.slice(0, 10).map(row => ({
        key: row.path,
        size: Number(row.size || 0),
        sizeFormatted: formatBytes(row.size || 0),
        uploaded: Number(row.uploaded_at || row.updated_at || 0),
      })),
    };
  } catch (_) {
    return null;
  }
}
