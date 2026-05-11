import { apiFileUrl } from './file-paths.js';

const jsonHeaders = { 'Content-Type': 'application/json' };
let csrfToken = '';

function rememberCsrf(data) {
  if (data?.csrf) csrfToken = data.csrf;
}

function csrfHeaders(headers = {}) {
  return csrfToken ? { ...headers, 'X-CSRF-Token': csrfToken } : headers;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  rememberCsrf(data);
  return { res, data };
}

export const api = {
  getRole() { return requestJson('/api/auth/role'); },
  login(username, password) {
    return requestJson('/api/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ username, password }) });
  },
  logout() { return requestJson('/api/logout'); },
  listFiles(path) {
    return requestJson(apiFileUrl('/api/files', path));
  },
  searchFiles(q, scope, cursor = '') {
    const params = new URLSearchParams({ q, scope, limit: '50' });
    if (cursor) params.set('cursor', cursor);
    return requestJson(`/api/search?${params.toString()}`);
  },
  batchDelete(paths) {
    return requestJson('/api/batch-delete', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ paths }) });
  },
  operationEstimate(paths) {
    return requestJson('/api/operation-estimate', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ paths }) });
  },
  trashList(page = 1, size = 20, filters = {}) {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (filters.q) params.set('q', filters.q);
    if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
    if (filters.from) params.set('from', String(filters.from));
    if (filters.to) params.set('to', String(filters.to));
    return requestJson(`/api/trash?${params.toString()}`);
  },
  restoreTrash(id) {
    return requestJson('/api/trash/restore', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ id }) });
  },
  deleteTrash(id) {
    return requestJson('/api/trash/delete', { method: 'DELETE', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ id }) });
  },
  clearTrash() {
    return requestJson('/api/trash/clear', { method: 'DELETE', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({}) });
  },
  cleanupTrash() {
    return requestJson('/api/trash/cleanup', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({}) });
  },
  unlockPath(path, password) {
    return requestJson('/api/access/unlock', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ path, password }) });
  },
  paste(payload) {
    return requestJson('/api/paste', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify(payload) });
  },
  multipartCreate(payload) {
    return requestJson('/api/upload-multipart/create', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify(payload) });
  },
  multipartPart({ key, uploadId, partNumber, chunk }) {
    return requestJson(`/api/upload-multipart/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`, {
      method: 'PUT',
      headers: csrfHeaders(),
      body: chunk,
    });
  },
  multipartComplete(payload) {
    return requestJson('/api/upload-multipart/complete', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify(payload) });
  },
  multipartAbort(payload) {
    return requestJson('/api/upload-multipart/abort', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify(payload) });
  },
  renameFile(fullKey, newName) {
    return requestJson(apiFileUrl('/api/files', fullKey), { method: 'PUT', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ newName }) });
  },
  mkdir(path, folderName) {
    return requestJson(apiFileUrl('/api/mkdir', path), { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ folderName }) });
  },
  saveText(path, content) {
    return requestJson(apiFileUrl('/api/save-text', path), { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ content }) });
  },
  preview(path) { return fetch(apiFileUrl('/api/preview', path)); },
  previewUrl(path) { return apiFileUrl('/api/preview', path); },
  thumbnailUrl(path) { return apiFileUrl('/api/thumbnail', path); },
  download(path) { return apiFileUrl('/api/download', path); },
  adminLogs(page, size) { return requestJson(`/api/admin/logs?page=${page}&size=${size}`); },
  adminStats() { return requestJson('/api/admin/stats'); },
  maintenance() { return requestJson('/api/admin/maintenance'); },
  maintenanceAction(action) {
    return requestJson('/api/admin/maintenance', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ action }) });
  },
  adminHealth() { return requestJson('/api/admin/health'); },
  hiddenPaths() { return requestJson('/api/admin/settings/hidden'); },
  addHiddenPath(targetPath) {
    return requestJson('/api/admin/settings/hidden', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ targetPath }) });
  },
  removeHiddenPath(path) {
    return requestJson(`/api/admin/settings/hidden?path=${encodeURIComponent(path)}`, { method: 'DELETE', headers: csrfHeaders() });
  },
  protectedPaths() { return requestJson('/api/admin/settings/protected'); },
  addProtectedPath(payload) {
    return requestJson('/api/admin/settings/protected', { method: 'POST', headers: csrfHeaders(jsonHeaders), body: JSON.stringify(payload) });
  },
  removeProtectedPath(path) {
    return requestJson(`/api/admin/settings/protected?path=${encodeURIComponent(path)}`, { method: 'DELETE', headers: csrfHeaders() });
  },
  trashRetention() { return requestJson('/api/admin/settings/trash-retention'); },
  setTrashRetention(days) {
    return requestJson('/api/admin/settings/trash-retention', { method: 'PUT', headers: csrfHeaders(jsonHeaders), body: JSON.stringify({ days }) });
  },
  csrfHeaders,
};
