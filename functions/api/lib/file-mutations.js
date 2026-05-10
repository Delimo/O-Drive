import { jsonResponse, normalizeName, addLog, isReservedKey, listR2Objects } from './common.js';

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

async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function copyTree(env, sourceKey, targetKey, request, move = false) {
  const obj = await env.R2_BUCKET.get(sourceKey);
  if (obj) {
    await env.R2_BUCKET.put(targetKey, obj.body, { httpMetadata: obj.httpMetadata });
    if (move) await env.R2_BUCKET.delete(sourceKey);
  }

  const listed = await listR2Objects(env.R2_BUCKET, { prefix: sourceKey + '/' });
  await mapWithConcurrency(listed.objects, 6, async item => {
    const nextKey = targetKey + item.key.slice(sourceKey.length);
    const subObj = await env.R2_BUCKET.get(item.key);
    if (subObj) {
      await env.R2_BUCKET.put(nextKey, subObj.body, { httpMetadata: subObj.httpMetadata });
      if (move) await env.R2_BUCKET.delete(item.key);
    }
  });
}

async function ensureTrashTable(env) {
  const stmt = env.DB.prepare(TRASH_TABLE_SQL);
  if (typeof stmt.bind === 'function') {
    await stmt.bind().run();
    return;
  }
  await stmt.run();
}

function createTrashId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function assertUserKey(key) {
  if (isReservedKey(key)) throw new Error('Reserved system path');
}

async function copyR2Object(env, sourceKey, targetKey) {
  const obj = await env.R2_BUCKET.get(sourceKey);
  if (!obj) return false;
  await env.R2_BUCKET.put(targetKey, obj.body, { httpMetadata: obj.httpMetadata });
  return true;
}

async function softDeleteTree(env, sourceKey, request) {
  const exact = await env.R2_BUCKET.get(sourceKey);
  const listed = await listR2Objects(env.R2_BUCKET, { prefix: sourceKey + '/' });
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
    if (copied) await env.R2_BUCKET.delete(source);
  });

  if (!exact && entries.length === 1 && entries[0].key === `${sourceKey}/.folder`) {
    await env.R2_BUCKET.put(`${trashKey}/.folder`, new Uint8Array(0));
  }

  const kind = exact && listed.objects.length === 0 ? 'file' : 'folder';
  const size = exact?.size || 0;

  await ensureTrashTable(env);
  await env.DB.prepare('INSERT INTO trash (id, original_key, trash_key, name, kind, size, trashed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(trashId, sourceKey, trashKey, sourceKey.split('/').pop() || sourceKey, kind, size, Date.now())
    .run();

  await addLog(env, request, 'TRASH', sourceKey);
  return { id: trashId, originalKey: sourceKey, trashKey, kind };
}

export async function handlePaste(env, request) {
  const { action, paths, targetDir } = await request.json();
  let destDir = targetDir.replace(/^\/|\/$/g, '');
  if (destDir !== '') destDir += '/';

  for (const srcKey of paths) {
    const sourceName = normalizeName(srcKey.split('/').pop());
    const destKey = destDir + sourceName;
    assertUserKey(srcKey);
    assertUserKey(destKey);
    if (srcKey === destKey) continue;
    await copyTree(env, srcKey, destKey, request, action === 'move');
  }

  await addLog(env, request, action.toUpperCase(), `Batch paste to ${targetDir}`);
  return jsonResponse({ success: true });
}

export async function handleRename(env, request, r2Key) {
  const { newName } = await request.json();
  const cleanName = normalizeName(newName);
  const parentDir = r2Key.includes('/') ? r2Key.substring(0, r2Key.lastIndexOf('/') + 1) : '';
  const newKey = parentDir + cleanName;
  assertUserKey(r2Key);
  assertUserKey(newKey);
  await copyTree(env, r2Key, newKey, request, true);
  await addLog(env, request, 'RENAME', `${r2Key} -> ${cleanName}`);
  return jsonResponse({ success: true });
}

export async function handleBatchDelete(env, request) {
  const { paths } = await request.json();
  for (const p of paths) {
    assertUserKey(p);
    await softDeleteTree(env, p, request);
  }
  await addLog(env, request, 'DELETE', `Move to trash ${paths.length} items`);
  return jsonResponse({ success: true });
}

export async function handleMkdir(env, request, r2Key) {
  const { folderName } = await request.json();
  const cleanName = normalizeName(folderName);
  const key = (r2Key ? r2Key + '/' : '') + cleanName + '/.folder';
  assertUserKey(key);
  await env.R2_BUCKET.put(key, new Uint8Array(0));
  await addLog(env, request, 'MKDIR', cleanName);
  return jsonResponse({ success: true });
}

export async function handleUpload(env, request, r2Key) {
  const file = (await request.formData()).get('file');
  const cleanName = normalizeName((file?.name || '').split(/[\/\\]/).pop());
  const key = (r2Key ? r2Key + '/' : '') + cleanName;
  assertUserKey(key);
  await env.R2_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await addLog(env, request, 'UPLOAD', cleanName);
  return jsonResponse({ success: true });
}

function uploadKey(targetDir, name) {
  let destDir = String(targetDir || '').replace(/^\/+|\/+$/g, '');
  if (destDir) destDir += '/';
  return destDir + normalizeName(String(name || '').split(/[\/\\]/).pop());
}

export async function handleMultipartCreate(env, request) {
  const { targetDir, name, type } = await request.json();
  const key = uploadKey(targetDir, name);
  assertUserKey(key);
  const upload = await env.R2_BUCKET.createMultipartUpload(key, {
    httpMetadata: { contentType: type || 'application/octet-stream' },
  });
  await addLog(env, request, 'UPLOAD_START', key);
  return jsonResponse({ key: upload.key, uploadId: upload.uploadId });
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
  const upload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);
  return jsonResponse(part);
}

export async function handleMultipartComplete(env, request) {
  const { key, uploadId, parts } = await request.json();
  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return jsonResponse({ success: false, message: 'Invalid multipart complete request' }, 400);
  }
  assertUserKey(key);
  const upload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
  const object = await upload.complete(parts.sort((a, b) => a.partNumber - b.partNumber));
  await addLog(env, request, 'UPLOAD', key);
  return jsonResponse({ success: true, key: object.key, etag: object.httpEtag });
}

export async function handleMultipartAbort(env, request) {
  const { key, uploadId } = await request.json();
  if (!key || !uploadId) return jsonResponse({ success: false, message: 'Invalid multipart abort request' }, 400);
  assertUserKey(key);
  const upload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
  await upload.abort();
  await addLog(env, request, 'UPLOAD_ABORT', key);
  return jsonResponse({ success: true });
}

export async function handleSaveText(env, request, r2Key) {
  assertUserKey(r2Key);
  await env.R2_BUCKET.put(r2Key, (await request.json()).content, { httpMetadata: { contentType: 'text/plain' } });
  await addLog(env, request, 'SAVE_TEXT', r2Key);
  return jsonResponse({ success: true });
}

export async function handleTrashList(env, url) {
  await ensureTrashTable(env);
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const size = Math.max(1, Math.min(100, Number(url.searchParams.get('size') || '20')));
  const totalRes = await env.DB.prepare('SELECT COUNT(*) as count FROM trash').first();
  const rows = await env.DB.prepare('SELECT * FROM trash ORDER BY trashed_at DESC LIMIT ? OFFSET ?')
    .bind(size, (page - 1) * size)
    .all();
  return jsonResponse({
    items: rows.results || [],
    totalPages: Math.max(1, Math.ceil((totalRes?.count || 0) / size)),
    currentPage: page,
  });
}

async function restoreTrashRecord(env, row, request) {
  const listed = await listR2Objects(env.R2_BUCKET, { prefix: row.trash_key });
  await mapWithConcurrency(listed.objects || [], 6, async item => {
    const suffix = item.key.slice(row.trash_key.length);
    const target = row.original_key + suffix;
    const obj = await env.R2_BUCKET.get(item.key);
    if (obj) {
      await env.R2_BUCKET.put(target, obj.body, { httpMetadata: obj.httpMetadata });
      await env.R2_BUCKET.delete(item.key);
    }
  });

  await env.DB.prepare('DELETE FROM trash WHERE id = ?').bind(row.id).run();
  await addLog(env, request, 'RESTORE', row.original_key);
}

async function purgeTrashRecord(env, row, request) {
  const listed = await listR2Objects(env.R2_BUCKET, { prefix: row.trash_key });
  await mapWithConcurrency(listed.objects || [], 8, item => env.R2_BUCKET.delete(item.key));
  await env.DB.prepare('DELETE FROM trash WHERE id = ?').bind(row.id).run();
  await addLog(env, request, 'PURGE', row.original_key);
}

export async function handleTrashRestore(env, request) {
  const { id } = await request.json();
  if (!id) return jsonResponse({ success: false, message: 'Invalid trash record' }, 400);
  await ensureTrashTable(env);
  const row = await env.DB.prepare('SELECT * FROM trash WHERE id = ?').bind(id).first();
  if (!row) return jsonResponse({ success: false, message: 'Trash item not found' }, 404);
  await restoreTrashRecord(env, row, request);
  return jsonResponse({ success: true });
}

export async function handleTrashDelete(env, request) {
  const { id } = await request.json();
  if (!id) return jsonResponse({ success: false, message: 'Invalid trash record' }, 400);
  await ensureTrashTable(env);
  const row = await env.DB.prepare('SELECT * FROM trash WHERE id = ?').bind(id).first();
  if (!row) return jsonResponse({ success: false, message: 'Trash item not found' }, 404);
  await purgeTrashRecord(env, row, request);
  return jsonResponse({ success: true });
}
