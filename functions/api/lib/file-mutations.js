/**
 * @typedef {import('./common.js').Env} Env
 * @typedef {{ success: boolean, message?: string, code?: string }} ApiError
 * @typedef {ApiError & { completed?: number, failed?: Array<{path: string, message: string}> }} BatchResult
 */

import { formatBytes as formatQuotaBytes, jsonResponse, normalizeName, addLog, isReservedKey } from './common.js';
import { getFileIndexEntry, upsertFileIndex } from './file-index.js';
import { copyTree, mapWithConcurrency } from './r2-tree.js';
import {
  checkStorageQuota,
  chooseUploadStorage,
  loadStorageConfig,
  resolveStorageIdForPath,
  resolveExistingStorageId,
  saveStorageConfig,
  storageAbortMultipartUpload,
  storageCompleteMultipartUpload,
  storageCreateMultipartUpload,
  storageHead,
  storageList,
  storagePut,
  storageUploadPart,
} from './storage.js';
import { softDeleteTree } from './trash.js';

export {
  handleTrashList,
  handleTrashRestore,
  handleTrashDelete,
  handleTrashClear,
  handleTrashCleanup,
  handleTrashRetention,
} from './trash.js';

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

/**
 * Check if a key exists in R2 (as object or prefix).
 * @param {Env} env
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function keyExists(env, key) {
  if (await getFileIndexEntry(env, key)) return true;
  const storageId = await resolveExistingStorageId(env, key);
  if (await storageHead(env, storageId, key)) return true;
  const listed = await storageList(env, storageId, { prefix: key + '/', limit: 1 });
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

const PATH_BATCH_CONCURRENCY = 4;

async function mapPathResults(paths, worker, concurrency = PATH_BATCH_CONCURRENCY) {
  const work = paths.map((path, index) => ({ path, index }));
  const results = new Array(paths.length);
  await mapWithConcurrency(work, concurrency, async ({ path, index }) => {
    results[index] = await worker(path, index);
  });
  return results;
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
  const primaryTasks = [];
  const aliases = [];
  const firstByDest = new Map();
  const immediateResults = new Array(normalizedPaths.length);

  for (let index = 0; index < normalizedPaths.length; index++) {
    const srcKey = normalizedPaths[index];
    try {
      const sourceName = normalizeName(srcKey.split('/').pop());
      const destKey = destDir + sourceName;
      assertUserKey(srcKey);
      assertUserKey(destKey);
      if (srcKey === destKey) {
        immediateResults[index] = { ok: true, skipped: true };
        continue;
      }
      const firstIndex = firstByDest.get(destKey);
      if (firstIndex != null) {
        aliases.push({ index, srcKey, destKey, firstIndex, sameSource: normalizedPaths[firstIndex] === srcKey });
        continue;
      }
      firstByDest.set(destKey, index);
      primaryTasks.push({ srcKey, destKey, index });
    } catch (e) {
      immediateResults[index] = { ok: false, message: e.message || 'Failed' };
    }
  }

  const primaryResults = await mapPathResults(primaryTasks, async task => {
    try {
      if (!(await keyExists(env, task.srcKey))) throw new Error('File or folder not found');
      await assertTargetAvailable(env, task.destKey);
      await copyTree(env, task.srcKey, task.destKey, action === 'move');
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message || 'Failed' };
    }
  });

  const results = [...immediateResults];
  for (let i = 0; i < primaryTasks.length; i++) {
    results[primaryTasks[i].index] = primaryResults[i];
  }
  for (const alias of aliases) {
    const prior = results[alias.firstIndex];
    if (prior?.ok && prior?.skipped) {
      results[alias.index] = { ok: true, skipped: true };
      continue;
    }
    if (prior?.ok) {
      results[alias.index] = {
        ok: false,
        message: alias.sameSource && action === 'move' ? 'File or folder not found' : 'Target already exists',
      };
      continue;
    }
    results[alias.index] = { ok: false, message: prior?.message || 'Failed' };
  }

  const failed = [];
  let completed = 0;
  for (let index = 0; index < normalizedPaths.length; index++) {
    const result = results[index];
    if (result?.ok) {
      if (!result.skipped) completed++;
      continue;
    }
    failed.push({ path: normalizedPaths[index], message: result?.message || 'Failed' });
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
  if (!(await keyExists(env, r2Key))) {
    const err = new Error('File or folder not found');
    err.status = 404;
    throw err;
  }
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
  const firstByPath = new Map();
  const uniquePaths = [];
  const results = new Array(normalizedPaths.length);

  for (let index = 0; index < normalizedPaths.length; index++) {
    const path = normalizedPaths[index];
    const firstIndex = firstByPath.get(path);
    if (firstIndex != null) {
      results[index] = { duplicateOf: firstIndex };
      continue;
    }
    firstByPath.set(path, index);
    uniquePaths.push(path);
  }

  const uniqueResults = await mapPathResults(uniquePaths, async path => {
    try {
      assertUserKey(path);
      await softDeleteTree(env, path, request);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message || 'Failed', code: e.code || undefined };
    }
  });

  for (let i = 0; i < uniquePaths.length; i++) {
    results[firstByPath.get(uniquePaths[i])] = uniqueResults[i];
  }
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (!result?.duplicateOf && result?.duplicateOf !== 0) continue;
    const prior = results[result.duplicateOf];
    results[index] = prior?.ok
      ? { ok: false, message: 'File or folder not found' }
      : { ok: false, message: prior?.message || 'Failed', code: prior?.code };
  }

  const failed = [];
  let completed = 0;
  for (let index = 0; index < normalizedPaths.length; index++) {
    const result = results[index];
    if (result?.ok) {
      completed++;
      continue;
    }
    failed.push({ path: normalizedPaths[index], message: result?.message || 'Failed', code: result?.code || undefined });
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
  const normalizedPaths = assertPathList(paths);
  const items = [];
  let totalObjects = 0;
  let truncated = false;
  const maxObjectsPerRequest = 1000;

  for (const key of normalizedPaths) {
    assertUserKey(key);
    const storageId = await resolveExistingStorageId(env, key);
    const exact = await storageHead(env, storageId, key);
    const listed = await storageList(env, storageId, { prefix: key + '/' }, { maxObjects: 1001 });
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
  const { folderName, storageId: requestedStorageId = 'r2' } = await request.json();
  const cleanName = normalizeName(folderName);
  const dir = r2Key ? normalizeUserKey(r2Key) + '/' : '';
  const folderKey = dir + cleanName;
  const key = folderKey + '/.folder';
  assertUserKey(key);
  await assertTargetAvailable(env, folderKey);
  const storageId = String(requestedStorageId || 'r2').trim().toLowerCase() || 'r2';
  const config = await loadStorageConfig(env);
  const allowed = new Set(['r2', ...(config.spaces || []).filter(item => item.enabled !== false).map(item => item.id)]);
  if (!allowed.has(storageId)) return jsonResponse({ success: false, message: '目标存储桶不可用' }, 400);
  const inheritedStorageId = await resolveStorageIdForPath(env, folderKey);
  const bindingApplied = storageId !== inheritedStorageId;
  if (storageId !== inheritedStorageId) {
    const bindings = [...(config.bindings || []).filter(item => item.path !== folderKey), { path: folderKey, storageId }];
    await saveStorageConfig(env, { ...config, bindings });
  }
  await storagePut(env, storageId, key, new Uint8Array(0));
  await addLog(env, request, 'MKDIR', cleanName);
  return jsonResponse({ success: true, key: folderKey, path: `/${folderKey}/`, storageId, bindingApplied });
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
  const cleanName = normalizeName((file?.name || '').split(/[\/\\]/).pop());
  const key = (r2Key ? normalizeUserKey(r2Key) + '/' : '') + cleanName;
  const conflict = new URL(request.url).searchParams.get('conflict') || 'error';
  assertUserKey(key);
  const resolved = await resolveUploadConflict(env, key, conflict);
  if (resolved.skipped) return jsonResponse({ success: true, skipped: true, key });
  const selected = await chooseUploadStorage(env, resolved.key, Number(file.size || 0));
  const quota = await checkStorageQuota(env, selected.storageId, Number(file.size || 0));
  if (!quota.allowed) {
    return jsonResponse(
      { success: false, code: 'QUOTA_EXCEEDED', storageId: selected.storageId, message: `${quota.storageName} 空间配额不足。已使用 ${formatQuotaBytes(quota.used)} / ${formatQuotaBytes(quota.quota)}，本次需要 ${formatQuotaBytes(file.size || 0)}。` },
      507,
    );
  }
  await storagePut(env, selected.storageId, resolved.key, file.stream(), { httpMetadata: { contentType: file.type } });
  await upsertFileIndex(env, resolved.key, { size: file.size, contentType: file.type, uploaded: Date.now(), storageId: selected.storageId });
  await addLog(env, request, resolved.conflict ? 'UPLOAD_CONFLICT' : 'UPLOAD', resolved.key);
  return jsonResponse({ success: true, key: resolved.key, renamed: resolved.key !== key, storageId: selected.storageId, overflowed: selected.overflowed, warning: selected.warning || '' });
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
  const { targetDir, name, type, totalSize, size, conflict = 'error' } = await request.json();
  const key = uploadKey(targetDir, name);
  assertUserKey(key);
  const resolved = await resolveUploadConflict(env, key, conflict);
  if (resolved.skipped) return jsonResponse({ key, skipped: true });
  const incomingBytes = Number(totalSize || size || 0);
  const selected = await chooseUploadStorage(env, resolved.key, incomingBytes);
  if (incomingBytes > 0) {
    const quota = await checkStorageQuota(env, selected.storageId, incomingBytes);
    if (!quota.allowed) {
      return jsonResponse(
        { success: false, code: 'QUOTA_EXCEEDED', storageId: selected.storageId, message: `${quota.storageName} 空间配额不足。剩余 ${formatQuotaBytes(quota.remaining)} / ${formatQuotaBytes(quota.quota)}。` },
        507,
      );
    }
  }
  const upload = await storageCreateMultipartUpload(env, selected.storageId, resolved.key, {
    httpMetadata: { contentType: type || 'application/octet-stream' },
  });
  return jsonResponse({ key: upload.key, uploadId: upload.uploadId, storageId: selected.storageId, renamed: resolved.key !== key, overflowed: selected.overflowed, warning: selected.warning || '' });
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
  const storageId = url.searchParams.get('storageId') || await resolveExistingStorageId(env, key);
  const part = await storageUploadPart(env, storageId, key, uploadId, partNumber, request.body);
  return jsonResponse(part);
}

export async function handleMultipartComplete(env, request) {
  const { key, uploadId, parts, storageId: bodyStorageId } = await request.json();
  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return jsonResponse({ success: false, message: 'Invalid multipart complete request' }, 400);
  }
  assertUserKey(key);
  const storageId = bodyStorageId || await resolveExistingStorageId(env, key);
  const object = await storageCompleteMultipartUpload(env, storageId, key, uploadId, parts);
  const meta = await storageHead(env, storageId, key);
  await upsertFileIndex(env, key, { ...(meta || { uploaded: Date.now() }), storageId });
  await addLog(env, request, 'UPLOAD', key);
  return jsonResponse({ success: true, key: object.key, etag: object.httpEtag, storageId });
}

export async function handleMultipartAbort(env, request) {
  const { key, uploadId, storageId: bodyStorageId } = await request.json();
  if (!key || !uploadId) return jsonResponse({ success: false, message: 'Invalid multipart abort request' }, 400);
  assertUserKey(key);
  const storageId = bodyStorageId || await resolveExistingStorageId(env, key);
  await storageAbortMultipartUpload(env, storageId, key, uploadId);
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
  const storageId = await resolveExistingStorageId(env, r2Key);
  await storagePut(env, storageId, r2Key, body.content, { httpMetadata: { contentType: 'text/plain' } });
  await upsertFileIndex(env, r2Key, { size: body.content.length, contentType: 'text/plain', uploaded: Date.now(), storageId });
  await addLog(env, request, 'SAVE_TEXT', r2Key);
  return jsonResponse({ success: true });
}
