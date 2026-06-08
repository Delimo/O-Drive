const PART_SIZE = 8 * 1024 * 1024;
const MULTIPART_THRESHOLD = 16 * 1024 * 1024;
const PART_RETRIES = 3;

const batches = new Map();
let running = false;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'ODRIVE_UPLOAD_BATCH') return;
  const batch = {
    id: data.batchId,
    taskId: data.taskId,
    csrfHeaders: data.csrfHeaders || {},
    conflictMode: data.conflictMode || 'error',
    files: Array.isArray(data.files) ? data.files : [],
    completed: 0,
    failed: 0,
    uploadedBytes: 0,
    totalBytes: (data.files || []).reduce((sum, item) => sum + Number(item.file?.size || 0), 0),
  };
  batches.set(batch.id, batch);
  event.waitUntil(runQueue());
});

function jsonHeaders(batch) {
  return { 'Content-Type': 'application/json', ...batch.csrfHeaders };
}

function uploadHeaders(batch) {
  return { ...batch.csrfHeaders };
}

function encodePath(path) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return '';
  return clean.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data || {};
}

async function patchTask(batch, patch) {
  if (!batch.taskId) return;
  try {
    await fetch(`/api/tasks?id=${encodeURIComponent(batch.taskId)}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: jsonHeaders(batch),
      body: JSON.stringify(patch),
    });
  } catch (_) {}
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
}

async function reportBatch(batch, status = 'running', extra = {}) {
  const progressPct = batch.totalBytes
    ? Math.round((Math.min(batch.uploadedBytes, batch.totalBytes) / batch.totalBytes) * 100)
    : Math.round(((batch.completed + batch.failed) / Math.max(batch.files.length, 1)) * 100);
  const result = {
    progressPct,
    uploadedBytes: batch.uploadedBytes,
    totalBytes: batch.totalBytes,
    currentFile: extra.currentFile || '',
  };
  await patchTask(batch, {
    status,
    total: batch.files.length,
    completed: batch.completed,
    failed: batch.failed,
    result,
    error: extra.error || '',
  });
  await broadcast({
    type: 'ODRIVE_UPLOAD_BATCH_STATUS',
    batchId: batch.id,
    taskId: batch.taskId,
    status,
    completed: batch.completed,
    failed: batch.failed,
    total: batch.files.length,
    result,
  });
}

async function reportFile(batch, fileItem, status, progressPct = 0, message = '') {
  await broadcast({
    type: 'ODRIVE_UPLOAD_FILE_STATUS',
    batchId: batch.id,
    taskId: batch.taskId,
    fileId: fileItem.id,
    status,
    progressPct,
    message,
  });
}

async function uploadSmall(batch, item) {
  const target = encodePath(item.targetDir);
  const suffix = target ? `/${target}` : '';
  const fd = new FormData();
  fd.append('file', item.file, item.uploadName || item.file.name);
  const data = await requestJson(`/api/files${suffix}?conflict=${encodeURIComponent(batch.conflictMode)}`, {
    method: 'POST',
    headers: uploadHeaders(batch),
    body: fd,
  });
  return data;
}

async function uploadPart(batch, item, partNumber, chunk, params) {
  const query = new URLSearchParams({
    key: params.key,
    uploadId: params.uploadId,
    partNumber: String(partNumber),
  });
  if (params.storageId) query.set('storageId', params.storageId);
  for (let attempt = 1; attempt <= PART_RETRIES; attempt++) {
    try {
      return await requestJson(`/api/upload-multipart/part?${query.toString()}`, {
        method: 'PUT',
        headers: uploadHeaders(batch),
        body: chunk,
      });
    } catch (err) {
      if (attempt === PART_RETRIES) throw err;
      await reportFile(batch, item, 'running', 0, `retry part ${partNumber}`);
      await new Promise(resolve => setTimeout(resolve, 800 * attempt));
    }
  }
}

async function uploadMultipart(batch, item) {
  const created = await requestJson('/api/upload-multipart/create', {
    method: 'POST',
    headers: jsonHeaders(batch),
    body: JSON.stringify({
      targetDir: item.targetDir,
      name: item.uploadName || item.file.name,
      type: item.file.type,
      totalSize: item.file.size,
      conflict: batch.conflictMode,
    }),
  });
  if (created.skipped) return created;

  const params = {
    key: created.key,
    uploadId: created.uploadId,
    storageId: created.storageId || '',
  };
  const partCount = Math.ceil(item.file.size / PART_SIZE);
  const parts = [];
  for (let i = 0; i < partCount; i++) {
    const start = i * PART_SIZE;
    const end = Math.min(start + PART_SIZE, item.file.size);
    const chunk = item.file.slice(start, end);
    const part = await uploadPart(batch, item, i + 1, chunk, params);
    parts.push(part);
    const filePct = Math.round((end / item.file.size) * 100);
    batch.uploadedBytes += chunk.size;
    await reportFile(batch, item, 'running', filePct, `${i + 1}/${partCount}`);
    await reportBatch(batch, 'running', { currentFile: item.displayName || item.file.name });
  }

  return requestJson('/api/upload-multipart/complete', {
    method: 'POST',
    headers: jsonHeaders(batch),
    body: JSON.stringify({ ...params, parts }),
  });
}

async function uploadOne(batch, item) {
  const name = item.displayName || item.file?.name || item.uploadName || 'file';
  await reportFile(batch, item, 'running', 0, 'uploading');
  await reportBatch(batch, 'running', { currentFile: name });
  const before = batch.uploadedBytes;
  const data = item.file.size >= MULTIPART_THRESHOLD
    ? await uploadMultipart(batch, item)
    : await uploadSmall(batch, item);
  if (item.file.size < MULTIPART_THRESHOLD) batch.uploadedBytes += Number(item.file.size || 0);
  else batch.uploadedBytes = Math.max(batch.uploadedBytes, before + Number(item.file.size || 0));
  batch.completed++;
  const label = data.warning || (data.skipped ? 'skipped' : data.renamed ? 'renamed' : 'done');
  await reportFile(batch, item, 'completed', 100, label);
  await reportBatch(batch, 'running', { currentFile: name });
}

async function runBatch(batch) {
  await reportBatch(batch, 'running');
  for (const item of batch.files) {
    try {
      await uploadOne(batch, item);
    } catch (err) {
      batch.failed++;
      await reportFile(batch, item, 'failed', 0, err?.message || 'upload failed');
      await reportBatch(batch, 'running', { currentFile: item.displayName || item.file?.name || '', error: err?.message || '' });
    }
  }
  const status = batch.failed
    ? (batch.completed > 0 ? 'partial' : 'failed')
    : 'completed';
  await reportBatch(batch, status);
  await broadcast({ type: 'ODRIVE_UPLOAD_BATCH_DONE', batchId: batch.id, taskId: batch.taskId, status });
  batches.delete(batch.id);
}

async function runQueue() {
  if (running) return;
  running = true;
  try {
    while (batches.size) {
      const batch = batches.values().next().value;
      if (!batch) break;
      await runBatch(batch);
    }
  } finally {
    running = false;
  }
}
