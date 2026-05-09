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
    return requestJson(path === '/' ? '/api/files' : `/api/files${path.replace(/\/$/, '')}`);
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
    return requestJson(`/api/files/${encodeURIComponent(fullKey)}`, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ newName }) });
  },
  mkdir(path, folderName) {
    return requestJson(`/api/mkdir${path.replace(/\/$/, '')}`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ folderName }) });
  },
  saveText(path, content) {
    return requestJson(`/api/save-text/${path.replace(/^\//, '')}`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ content }) });
  },
  preview(path) { return fetch(`/api/preview${path}`); },
  download(path) { return `/api/download${path}`; },
  adminLogs(page, size) { return requestJson(`/api/admin/logs?page=${page}&size=${size}`); },
  hiddenPaths() { return requestJson('/api/admin/settings/hidden'); },
  addHiddenPath(targetPath) {
    return requestJson('/api/admin/settings/hidden', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ targetPath }) });
  },
  removeHiddenPath(path) {
    return requestJson(`/api/admin/settings/hidden?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  },
};
