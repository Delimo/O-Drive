import { formatBytes, isReservedKey, listR2Objects } from './common.js';

const FILE_INDEX_SQL = `
  CREATE TABLE IF NOT EXISTS file_index (
    path TEXT PRIMARY KEY,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    object_key TEXT NOT NULL DEFAULT '',
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
  if (ext === 'pdf') return 'pdf';
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
  if (!env?.D1) return false;
  try {
    await runStatement(env.D1.prepare(FILE_INDEX_SQL));
    try {
      await runStatement(env.D1.prepare("ALTER TABLE file_index ADD COLUMN storage_id TEXT NOT NULL DEFAULT 'r2'"));
    } catch (_) {}
    try {
      await runStatement(env.D1.prepare("ALTER TABLE file_index ADD COLUMN object_key TEXT NOT NULL DEFAULT ''"));
    } catch (_) {}
    try {
      await runStatement(env.D1.prepare('CREATE INDEX IF NOT EXISTS idx_file_index_storage_id ON file_index(storage_id)'));
    } catch (_) {}
    try {
      await runStatement(env.D1.prepare('CREATE INDEX IF NOT EXISTS idx_file_index_parent ON file_index(parent)'));
    } catch (_) {}
    try {
      await runStatement(env.D1.prepare('CREATE INDEX IF NOT EXISTS idx_file_index_object ON file_index(storage_id, object_key)'));
    } catch (_) {}
    return true;
  } catch (_) {
    return false;
  }
}

const UPSERT_SQL = `INSERT INTO file_index (path, storage_id, object_key, name, parent, kind, size, content_type, uploaded_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(path) DO UPDATE SET
    storage_id = excluded.storage_id,
    object_key = excluded.object_key,
    name = excluded.name,
    parent = excluded.parent,
    kind = excluded.kind,
    size = excluded.size,
    content_type = excluded.content_type,
    uploaded_at = excluded.uploaded_at,
    updated_at = excluded.updated_at`;

export function buildUpsertParams(key, meta = {}) {
  const size = Number(meta.size || 0);
  const contentType = meta.httpMetadata?.contentType || meta.contentType || '';
  const uploadedAt = uploadedMs(meta.uploaded);
  return [
    key,
    meta.storageId || meta.storage_id || 'r2',
    meta.objectKey || meta.object_key || key,
    nameOf(key),
    parentOf(key),
    indexedFileKind(key),
    size,
    contentType,
    uploadedAt,
    Date.now(),
  ];
}

export async function upsertFileIndex(env, key, meta = {}) {
  if (!indexableKey(key) || !(await ensureFileIndexTable(env))) return;
  try {
    await env.D1.prepare(UPSERT_SQL).bind(...buildUpsertParams(key, meta)).run();
  } catch (_) {}
}

export async function batchUpsertFileIndex(env, entries) {
  if (!(await ensureFileIndexTable(env))) return 0;
  const validEntries = entries.filter(([key]) => indexableKey(key));
  if (!validEntries.length) return 0;
  const BATCH_SIZE = 50;
  let written = 0;
  for (let i = 0; i < validEntries.length; i += BATCH_SIZE) {
    const chunk = validEntries.slice(i, i + BATCH_SIZE);
    try {
      const stmts = chunk.map(([key, meta]) =>
        env.D1.prepare(UPSERT_SQL).bind(...buildUpsertParams(key, meta))
      );
      await env.D1.batch(stmts);
      written += chunk.length;
    } catch (_) {
      for (const [key, meta] of chunk) {
        try {
          await env.D1.prepare(UPSERT_SQL).bind(...buildUpsertParams(key, meta)).run();
          written++;
        } catch (_) {}
      }
    }
  }
  return written;
}

export async function deleteFileIndexKey(env, key) {
  if (!(await ensureFileIndexTable(env))) return;
  try {
    await env.D1.prepare('DELETE FROM file_index WHERE path = ?').bind(key).run();
  } catch (_) {}
}

export async function deleteFileIndexPrefix(env, prefix) {
  if (!(await ensureFileIndexTable(env))) return;
  const clean = String(prefix || '').replace(/^\/+|\/+$/g, '');
  try {
    await env.D1.prepare('DELETE FROM file_index WHERE path = ? OR path LIKE ?').bind(clean, `${clean}/%`).run();
  } catch (_) {}
}

export async function indexedFileCount(env) {
  if (!(await ensureFileIndexTable(env))) return 0;
  try {
    const row = await env.D1.prepare('SELECT COUNT(*) as count FROM file_index').first();
    return Number(row?.count || 0);
  } catch (_) {
    return 0;
  }
}

export async function fileIndexStatus(env) {
  if (!(await ensureFileIndexTable(env))) return { count: 0, totalSize: 0, latestUpdatedAt: 0 };
  try {
    const row = await env.D1.prepare('SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as totalSize, COALESCE(MAX(updated_at), 0) as latestUpdatedAt FROM file_index').first();
    return {
      count: Number(row?.count || 0),
      totalSize: Number(row?.totalSize || 0),
      latestUpdatedAt: Number(row?.latestUpdatedAt || 0),
    };
  } catch (_) {
    return { count: 0, totalSize: 0, latestUpdatedAt: 0 };
  }
}

export async function getFileIndexStorageId(env, key) {
  if (!key || !(await ensureFileIndexTable(env))) return '';
  try {
    const row = await env.D1.prepare('SELECT storage_id FROM file_index WHERE path = ?').bind(key).first();
    return row?.storage_id || 'r2';
  } catch (_) {
    return '';
  }
}

export function normalizeIndexRow(row) {
  if (!row) return null;
  return {
    ...row,
    storage_id: row.storage_id || 'r2',
    object_key: row.object_key || row.path,
  };
}

export async function getFileIndexEntry(env, key) {
  if (!key || !(await ensureFileIndexTable(env))) return null;
  try {
    const row = await env.D1.prepare('SELECT * FROM file_index WHERE path = ?').bind(key).first();
    return normalizeIndexRow(row);
  } catch (_) {
    return null;
  }
}

export async function countFileIndexObjectRefs(env, storageId = 'r2', objectKey = '') {
  if (!objectKey || !(await ensureFileIndexTable(env))) return 0;
  try {
    const row = await env.D1.prepare('SELECT COUNT(*) as count FROM file_index WHERE storage_id = ? AND COALESCE(NULLIF(object_key, \'\'), path) = ?')
      .bind(storageId || 'r2', objectKey)
      .first();
    return Number(row?.count || 0);
  } catch (_) {
    return 0;
  }
}

export async function updateFileIndexObjectKey(env, storageId = 'r2', oldObjectKey = '', newObjectKey = '') {
  if (!oldObjectKey || !newObjectKey || !(await ensureFileIndexTable(env))) return;
  try {
    await env.D1.prepare('UPDATE file_index SET object_key = ?, updated_at = ? WHERE storage_id = ? AND COALESCE(NULLIF(object_key, \'\'), path) = ?')
      .bind(newObjectKey, Date.now(), storageId || 'r2', oldObjectKey)
      .run();
  } catch (_) {}
}

export async function hasFileIndexPath(env, key) {
  return Boolean(await getFileIndexEntry(env, key));
}

export async function listFileIndexPrefix(env, prefix) {
  if (!(await ensureFileIndexTable(env))) return [];
  const clean = String(prefix || '').replace(/^\/+|\/+$/g, '');
  try {
    const rows = await env.D1.prepare('SELECT * FROM file_index WHERE path = ? OR path LIKE ? ORDER BY path ASC')
      .bind(clean, `${clean}/%`)
      .all();
    return (rows.results || []).map(normalizeIndexRow).filter(Boolean);
  } catch (_) {
    return [];
  }
}

export async function getIndexedStorageUsed(env, storageId = 'r2') {
  if (!(await ensureFileIndexTable(env))) return 0;
  try {
    const row = await env.D1.prepare(
      'SELECT COALESCE(SUM(size), 0) AS total FROM (SELECT storage_id, COALESCE(NULLIF(object_key, \'\'), path) AS object_key, MAX(size) AS size FROM file_index WHERE storage_id = ? GROUP BY storage_id, COALESCE(NULLIF(object_key, \'\'), path))'
    ).bind(storageId).first();
    return Number(row?.total || 0);
  } catch (_) {
    return 0;
  }
}

export async function syncFileIndexFromR2(env, { maxObjects = 20000 } = {}) {
  if (!(await ensureFileIndexTable(env))) return { synced: 0, truncated: false };
  const listed = await listR2Objects(env.R2, {}, { maxObjects });
  const entries = (listed.objects || [])
    .filter(obj => indexableKey(obj.key))
    .map(obj => [obj.key, { ...obj, storageId: 'r2', objectKey: obj.key }]);
  const synced = await batchUpsertFileIndex(env, entries);
  return { synced, truncated: Boolean(listed.truncated) };
}

export async function rebuildFileIndex(env, { maxObjects = 50000 } = {}) {
  if (!(await ensureFileIndexTable(env))) return { synced: 0, truncated: false };
  try {
    await env.D1.prepare('DELETE FROM file_index').run();
  } catch (_) {}
  return syncFileIndexFromR2(env, { maxObjects });
}

export function mapIndexRow(row) {
  const normalized = normalizeIndexRow(row);
  const size = Number(row.size || 0);
  const time = Number(row.uploaded_at || row.updated_at || 0);
  return {
    name: row.name,
    path: '/' + row.path,
    fullKey: row.path,
    storageId: normalized.storage_id,
    objectKey: normalized.object_key,
    isAlias: normalized.object_key !== row.path,
    sizeFormatted: formatBytes(size),
    rawSize: size,
    time,
  };
}

export async function listIndexedDirectory(env, parent = '') {
  if (!(await ensureFileIndexTable(env))) return { folders: [], files: [] };
  const cleanParent = String(parent || '').replace(/^\/+|\/+$/g, '');
  try {
    const folderSql = cleanParent
      ? 'SELECT DISTINCT parent FROM file_index WHERE parent LIKE ? ORDER BY parent ASC LIMIT 5000'
      : "SELECT DISTINCT parent FROM file_index WHERE parent != '' ORDER BY parent ASC LIMIT 5000";
    const folderParams = cleanParent ? [`${cleanParent}/%`] : [];
    const [fileRows, parentRows] = await env.D1.batch([
      env.D1.prepare('SELECT * FROM file_index WHERE parent = ? ORDER BY name ASC').bind(cleanParent),
      env.D1.prepare(folderSql).bind(...folderParams),
    ]);
    const files = (fileRows.results || []).map(mapIndexRow);
    const folderNames = new Set();
    for (const row of parentRows.results || []) {
      const indexedParent = String(row.parent || '');
      const rest = cleanParent ? indexedParent.slice(cleanParent.length + 1) : indexedParent;
      if (!rest) continue;
      const slash = rest.indexOf('/');
      folderNames.add(slash > 0 ? rest.slice(0, slash) : rest);
    }
    const folders = [...folderNames].map(name => {
      const fullKey = cleanParent ? `${cleanParent}/${name}` : name;
      return { name, path: '/' + fullKey, fullKey, indexed: true };
    });
    return { folders, files };
  } catch (_) {
    return { folders: [], files: [] };
  }
}

function searchFilterClauses(filters = {}) {
  const clauses = [];
  const params = [];
  const kind = String(filters.kind || 'all');
  if (kind && kind !== 'all') {
    if (kind === 'file') clauses.push('kind IS NOT NULL');
    else {
      clauses.push('kind = ?');
      params.push(kind);
    }
  }
  if (Number.isFinite(filters.minSize)) {
    clauses.push('size >= ?');
    params.push(filters.minSize);
  }
  if (Number.isFinite(filters.maxSize)) {
    clauses.push('size <= ?');
    params.push(filters.maxSize);
  }
  if (Number.isFinite(filters.fromTime)) {
    clauses.push('uploaded_at >= ?');
    params.push(filters.fromTime);
  }
  if (Number.isFinite(filters.toTime)) {
    clauses.push('uploaded_at <= ?');
    params.push(filters.toTime);
  }
  return { clauses, params };
}

function rowMatchesSearchFilters(row, filters = {}) {
  const kind = String(filters.kind || 'all');
  if (kind && kind !== 'all' && kind !== 'file' && row.kind !== kind) return false;
  const size = Number(row.size || 0);
  if (Number.isFinite(filters.minSize) && size < filters.minSize) return false;
  if (Number.isFinite(filters.maxSize) && size > filters.maxSize) return false;
  const uploadedAt = Number(row.uploaded_at || row.updated_at || 0);
  if (Number.isFinite(filters.fromTime) && uploadedAt < filters.fromTime) return false;
  if (Number.isFinite(filters.toTime) && uploadedAt > filters.toTime) return false;
  return true;
}

export async function searchFileIndex(env, { q, scope, limit, cursor, filters = {} }, hiddenPaths, auth) {
  const count = await indexedFileCount(env);
  if (!count) return null;
  const offset = Math.max(0, Number(cursor || 0));
  const cleanScope = String(scope || '').replace(/^\/+|\/+$/g, '');
  const like = `%${String(q || '').toLowerCase()}%`;
  const filterSql = searchFilterClauses(filters);
  const scopeClause = cleanScope ? ' AND (path = ? OR path LIKE ?)' : '';
  const extraClauses = filterSql.clauses.length ? ` AND ${filterSql.clauses.join(' AND ')}` : '';
  const sql = `SELECT * FROM file_index WHERE lower(name) LIKE ?${scopeClause}${extraClauses} ORDER BY path ASC LIMIT ? OFFSET ?`;
  try {
    const batchSize = limit + 1;
    const visible = [];
    let rawOffset = offset;
    let exhausted = false;

    while (visible.length <= limit && !exhausted) {
      const params = cleanScope
        ? [like, cleanScope, `${cleanScope}/%`, ...filterSql.params, batchSize, rawOffset]
        : [like, ...filterSql.params, batchSize, rawOffset];
      const rows = await env.D1.prepare(sql).bind(...params).all();
      const batch = rows.results || [];
      if (!batch.length) break;

      for (let i = 0; i < batch.length; i++) {
        if (!rowMatchesSearchFilters(batch[i], filters)) continue;
        const item = mapIndexRow(batch[i]);
        if (auth.role === 'admin' || !hiddenPaths.some(hp => item.fullKey === hp || item.fullKey.startsWith(hp + '/'))) {
          visible.push({ item, nextCursor: rawOffset + i + 1 });
          if (visible.length > limit) break;
        }
      }

      rawOffset += batch.length;
      exhausted = batch.length < batchSize;
    }

    const page = visible.slice(0, limit).map(entry => entry.item);
    return {
      files: page,
      nextCursor: visible.length > limit ? String(visible[limit - 1].nextCursor) : '',
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
    const [kindRows, totalRow, latestRows] = await env.D1.batch([
      env.D1.prepare('SELECT kind, COUNT(*) as count, SUM(size) as size FROM file_index GROUP BY kind'),
      env.D1.prepare('SELECT COUNT(*) as count, SUM(size) as totalSize FROM file_index'),
      env.D1.prepare('SELECT path, size, uploaded_at, updated_at FROM file_index ORDER BY uploaded_at DESC LIMIT 10'),
    ]);
    const allKinds = ['image', 'video', 'audio', 'text', 'archive', 'exe', 'other'];
    const breakdown = {};
    for (const kind of allKinds) {
      breakdown[kind] = { count: 0, size: 0, sizeFormatted: formatBytes(0) };
    }
    for (const row of (kindRows.results || [])) {
      const kind = row.kind || 'other';
      const size = Number(row.size || 0);
      breakdown[kind] = { count: Number(row.count || 0), size, sizeFormatted: formatBytes(size) };
    }
    const total = totalRow.results?.[0] || {};
    const totalSize = Number(total.totalSize || 0);
    return {
      files: {
        count: Number(total.count || 0),
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        folderMarkers: 0,
        truncated: false,
      },
      breakdown,
      latest: (latestRows.results || []).map(row => ({
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
