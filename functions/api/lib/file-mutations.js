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

export async function handleSaveText(env, request, r2Key) {
  await env.R2_BUCKET.put(r2Key, (await request.json()).content, { httpMetadata: { contentType: 'text/plain' } });
  await addLog(env, request, 'SAVE_TEXT', r2Key);
  return jsonResponse({ success: true });
}
