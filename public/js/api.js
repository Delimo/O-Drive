import { apiFileUrl } from './file-paths.js';

const jsonHeaders = { 'Content-Type': 'application/json' };

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch (_) {}
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
  searchFiles(q, scope) {
    return requestJson(`/api/search?q=${encodeURIComponent(q)}&scope=${encodeURIComponent(scope)}`);
  },
  batchDelete(paths) {
    return requestJson('/api/batch-delete', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ paths }) });
  },
  paste(payload) {
    return requestJson('/api/paste', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) });
  },
  renameFile(fullKey, newName) {
    return requestJson(apiFileUrl('/api/files', fullKey), { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ newName }) });
  },
  mkdir(path, folderName) {
    return requestJson(apiFileUrl('/api/mkdir', path), { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ folderName }) });
  },
  saveText(path, content) {
    return requestJson(apiFileUrl('/api/save-text', path), { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ content }) });
  },
  preview(path) { return fetch(apiFileUrl('/api/preview', path)); },
  previewUrl(path) { return apiFileUrl('/api/preview', path); },
  download(path) { return apiFileUrl('/api/download', path); },
  adminLogs(page, size) { return requestJson(`/api/admin/logs?page=${page}&size=${size}`); },
  hiddenPaths() { return requestJson('/api/admin/settings/hidden'); },
  addHiddenPath(targetPath) {
    return requestJson('/api/admin/settings/hidden', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ targetPath }) });
  },
  removeHiddenPath(path) {
    return requestJson(`/api/admin/settings/hidden?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  },
};
