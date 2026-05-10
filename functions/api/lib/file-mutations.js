import { jsonResponse, normalizeName, addLog } from './common.js';

async function copyTree(env, sourceKey, targetKey, request, move = false) {
  const obj = await env.R2_BUCKET.get(sourceKey);
  if (obj) {
    await env.R2_BUCKET.put(targetKey, obj.body, { httpMetadata: obj.httpMetadata });
    if (move) await env.R2_BUCKET.delete(sourceKey);
  }

  const listed = await env.R2_BUCKET.list({ prefix: sourceKey + '/' });
  for (const item of listed.objects) {
    const nextKey = targetKey + item.key.slice(sourceKey.length);
    const subObj = await env.R2_BUCKET.get(item.key);
    if (subObj) {
      await env.R2_BUCKET.put(nextKey, subObj.body, { httpMetadata: subObj.httpMetadata });
      if (move) await env.R2_BUCKET.delete(item.key);
    }
  }
}

export async function handlePaste(env, request) {
  const { action, paths, targetDir } = await request.json();
  let destDir = targetDir.replace(/^\/|\/$/g, '');
  if (destDir !== '') destDir += '/';

  for (const srcKey of paths) {
    const sourceName = normalizeName(srcKey.split('/').pop());
    const destKey = destDir + sourceName;
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
  await copyTree(env, r2Key, newKey, request, true);
  await addLog(env, request, 'RENAME', `${r2Key} -> ${cleanName}`);
  return jsonResponse({ success: true });
}

export async function handleBatchDelete(env, request) {
  const { paths } = await request.json();
  for (const p of paths) {
    const listed = await env.R2_BUCKET.list({ prefix: p + '/' });
    for (const o of listed.objects) await env.R2_BUCKET.delete(o.key);
    await env.R2_BUCKET.delete(p);
  }
  await addLog(env, request, 'DELETE', `Batch delete ${paths.length} items`);
  return jsonResponse({ success: true });
}

export async function handleMkdir(env, request, r2Key) {
  const { folderName } = await request.json();
  const cleanName = normalizeName(folderName);
  await env.R2_BUCKET.put((r2Key ? r2Key + '/' : '') + cleanName + '/.folder', new Uint8Array(0));
  await addLog(env, request, 'MKDIR', cleanName);
  return jsonResponse({ success: true });
}

export async function handleUpload(env, request, r2Key) {
  const file = (await request.formData()).get('file');
  const cleanName = normalizeName((file?.name || '').split(/[\/\\]/).pop());
  await env.R2_BUCKET.put((r2Key ? r2Key + '/' : '') + cleanName, file.stream(), { httpMetadata: { contentType: file.type } });
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
  const upload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
  const object = await upload.complete(parts.sort((a, b) => a.partNumber - b.partNumber));
  await addLog(env, request, 'UPLOAD', key);
  return jsonResponse({ success: true, key: object.key, etag: object.httpEtag });
}

export async function handleMultipartAbort(env, request) {
  const { key, uploadId } = await request.json();
  if (!key || !uploadId) return jsonResponse({ success: false, message: 'Invalid multipart abort request' }, 400);
  const upload = env.R2_BUCKET.resumeMultipartUpload(key, uploadId);
  await upload.abort();
  await addLog(env, request, 'UPLOAD_ABORT', key);
  return jsonResponse({ success: true });
}

export async function handleSaveText(env, request, r2Key) {
  await env.R2_BUCKET.put(r2Key, (await request.json()).content, { httpMetadata: { contentType: 'text/plain' } });
  await addLog(env, request, 'SAVE_TEXT', r2Key);
  return jsonResponse({ success: true });
}
