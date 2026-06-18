export function createApiLayer(deps) {
  const {
    fetchImpl,
    getState,
    encodeRouteKey,
    normalizeKey,
    FormDataImpl,
    HeadersImpl,
    XhrImpl,
  } = deps;

  const apiClient = {
    async json(pathname, options = {}) {
      const state = getState();
      const headers = new HeadersImpl(options.headers || {});
      const requestOptions = { ...options };
      if (requestOptions.json) {
        headers.set('Content-Type', 'application/json');
        requestOptions.body = JSON.stringify(requestOptions.json);
      }
      if (requestOptions.csrf && state.app.csrf) {
        headers.set('X-CSRF-Token', state.app.csrf);
      }
      delete requestOptions.json;
      const response = await fetchImpl(pathname, {
        ...requestOptions,
        headers,
        credentials: 'same-origin',
      });
      const isJson = (response.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await response.json().catch(() => ({})) : null;
      return { response, data };
    },
    async text(pathname, options = {}) {
      const state = getState();
      const headers = new HeadersImpl(options.headers || {});
      if (options.csrf && state.app.csrf) {
        headers.set('X-CSRF-Token', state.app.csrf);
      }
      const response = await fetchImpl(pathname, {
        ...options,
        headers,
        credentials: 'same-origin',
      });
      const text = await response.text();
      return { response, text };
    },
    previewUrl(path) {
      const key = encodeRouteKey(path || '');
      return key ? `/api/preview/${key}` : '';
    },
    thumbnailUrl(path, width = 320, height = 240) {
      const key = encodeRouteKey(path || '');
      return key ? `/api/thumbnail/${key}?w=${width}&h=${height}` : '';
    },
    downloadUrl(path) {
      const key = encodeRouteKey(path || '');
      return key ? `/api/download/${key}` : '';
    },
  };

  const request = (pathname, options = {}) => apiClient.json(pathname, options);

  const authApi = {
    loadRole() {
      return request('/api/auth/role');
    },
    login(credentials) {
      return request('/api/login', {
        method: 'POST',
        json: credentials,
      });
    },
    logout() {
      return request('/api/logout');
    },
    unlockProtectedPath(path, password) {
      return request('/api/access/unlock', {
        method: 'POST',
        json: { path: `/${normalizeKey(path)}`, password },
      });
    },
  };

  const fileApi = {
    list(path) {
      const route = path ? `/api/files/${encodeRouteKey(path)}` : '/api/files';
      return request(route);
    },
    search(query, scope, cursor = '', filters = {}) {
      const params = new URLSearchParams({ q: query, scope, limit: '60' });
      if (cursor) params.set('cursor', cursor);
      if (filters.kind) params.set('kind', filters.kind);
      if (filters.minSize) params.set('minSize', filters.minSize);
      if (filters.maxSize) params.set('maxSize', filters.maxSize);
      if (filters.modifiedAfter) params.set('modifiedAfter', filters.modifiedAfter);
      if (filters.modifiedBefore) params.set('modifiedBefore', filters.modifiedBefore);
      return request(`/api/search?${params.toString()}`);
    },
    createFolder(parentPath, folderName, storageId) {
      const route = parentPath ? `/api/mkdir/${encodeRouteKey(parentPath)}` : '/api/mkdir';
      return request(route, {
        method: 'POST',
        json: { folderName, storageId },
        csrf: true,
      });
    },
    upload(targetDir, file, targetName) {
      const route = targetDir ? `/api/files/${encodeRouteKey(targetDir)}?conflict=rename` : '/api/files?conflict=rename';
      const form = new FormDataImpl();
      form.append('file', file, targetName);
      return request(route, {
        method: 'POST',
        body: form,
        csrf: true,
      });
    },
    uploadWithProgress(targetDir, file, targetName, onProgress, conflict = 'rename') {
      const route = targetDir ? `/api/files/${encodeRouteKey(targetDir)}?conflict=${conflict}` : `/api/files?conflict=${conflict}`;
      const form = new FormDataImpl();
      form.append('file', file, targetName);
      const csrf = getState().app.csrf;

      return new Promise(resolve => {
        const xhr = new XhrImpl();
        xhr.open('POST', route);
        xhr.withCredentials = true;
        if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);

        xhr.upload.onprogress = event => {
          if (typeof onProgress === 'function' && event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          const isJson = (xhr.getResponseHeader('content-type') || '').includes('application/json');
          let data = null;
          if (isJson) {
            try { data = JSON.parse(xhr.responseText); } catch (_) { data = {}; }
          }
          resolve({ response: { ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status }, data });
        };

        xhr.onerror = () => {
          resolve({ response: { ok: false, status: xhr.status || 0 }, data: null });
        };

        xhr.send(form);
      });
    },
    previewText(path) {
      return apiClient.text(apiClient.previewUrl(path));
    },
    saveText(path, content) {
      return request(`/api/save-text/${encodeRouteKey(path)}`, {
        method: 'POST',
        json: { content },
        csrf: true,
      });
    },
    rename(path, newName) {
      return request(`/api/files/${encodeRouteKey(path)}`, {
        method: 'PUT',
        json: { newName },
        csrf: true,
      });
    },
    batchDelete(paths) {
      return request('/api/batch-delete', {
        method: 'POST',
        json: { paths },
        csrf: true,
      });
    },
    paste(action, paths, targetDir) {
      return request('/api/paste', {
        method: 'POST',
        json: { action, paths, targetDir },
        csrf: true,
      });
    },
  };

  const trashApi = {
    list(query) {
      return request(`/api/trash?page=1&size=100&q=${encodeURIComponent(query)}`);
    },
    restore(id) {
      return request('/api/trash/restore', {
        method: 'POST',
        json: { id },
        csrf: true,
      });
    },
    remove(id) {
      return request('/api/trash/delete', {
        method: 'DELETE',
        json: { id },
        csrf: true,
      });
    },
    clear() {
      return request('/api/trash/clear', {
        method: 'DELETE',
        json: {},
        csrf: true,
      });
    },
  };

  const shareApi = {
    info(token) {
      return request(`/api/share/${encodeURIComponent(token)}/info`);
    },
    list() {
      return request('/api/admin/shares');
    },
    create(payload) {
      return request('/api/admin/shares', {
        method: 'POST',
        json: payload,
        csrf: true,
      });
    },
    remove(token) {
      return request(`/api/admin/shares?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
        csrf: true,
      });
    },
    cleanupExpired() {
      return request('/api/admin/shares', {
        method: 'POST',
        json: { action: 'cleanup-expired' },
        csrf: true,
      });
    },
    unlock(token, password) {
      return request(`/api/share/${encodeURIComponent(token)}/unlock`, {
        method: 'POST',
        json: { password },
      });
    },
  };

  const adminApi = {
    stats() {
      return request('/api/admin/stats');
    },
    health() {
      return request('/api/admin/health');
    },
    logs(params = {}) {
      const q = new URLSearchParams();
      if (params.page) q.set('page', params.page);
      if (params.size) q.set('size', params.size);
      if (params.q) q.set('q', params.q);
      if (params.action) q.set('action', params.action);
      if (params.from) q.set('from', params.from);
      if (params.to) q.set('to', params.to);
      return request(`/api/admin/logs?${q.toString()}`);
    },
    quota() {
      return request('/api/admin/settings/quota');
    },
    setQuota(bytes) {
      return request('/api/admin/settings/quota', {
        method: 'PUT',
        json: { bytes },
        csrf: true,
      });
    },
    protectedPaths() {
      return request('/api/admin/settings/protected');
    },
    createProtectedPath(path, password, note, showName) {
      return request('/api/admin/settings/protected', {
        method: 'POST',
        json: { path, password, note, showName },
        csrf: true,
      });
    },
    deleteProtectedPath(path) {
      return request(`/api/admin/settings/protected?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
        csrf: true,
      });
    },
    hiddenPaths() {
      return request('/api/admin/settings/hidden');
    },
    createHiddenPath(targetPath) {
      return request('/api/admin/settings/hidden', {
        method: 'POST',
        json: { targetPath },
        csrf: true,
      });
    },
    deleteHiddenPath(path) {
      return request(`/api/admin/settings/hidden?path=${encodeURIComponent(path)}`, {
        method: 'DELETE',
        csrf: true,
      });
    },
    storageConfig() {
      return request('/api/admin/settings/storage');
    },
    saveStorageConfig(config) {
      return request('/api/admin/settings/storage', {
        method: 'PUT',
        json: config,
        csrf: true,
      });
    },
    testStorageSpace(space) {
      return request('/api/admin/settings/storage/test', {
        method: 'POST',
        json: space,
        csrf: true,
      });
    },
    webhooks() {
      return request('/api/admin/settings/webhooks');
    },
    saveWebhooks(items) {
      return request('/api/admin/settings/webhooks', {
        method: 'PUT',
        json: { items },
        csrf: true,
      });
    },
    testWebhook(endpoint) {
      return request('/api/admin/settings/webhooks?test=1', {
        method: 'POST',
        json: { endpoint },
        csrf: true,
      });
    },
    webhookDeliveries() {
      return request('/api/admin/webhook-deliveries');
    },
  };

  const multipartApi = {
    create(params) {
      return request('/api/upload-multipart/create', {
        method: 'POST',
        json: params,
        csrf: true,
      });
    },
    _xhrUpload(url, blob, onProgress) {
      return new Promise(resolve => {
        const xhr = new XhrImpl();
        xhr.open('PUT', url);
        xhr.withCredentials = true;
        const csrf = getState().app.csrf;
        if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);

        if (typeof onProgress === 'function') {
          xhr.upload.onprogress = event => {
            if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
          };
        }

        xhr.onload = () => resolve({ response: { ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status }, data: xhr.responseText ? JSON.parse(xhr.responseText) : null });
        xhr.onerror = () => resolve({ response: { ok: false, status: 0 }, data: null });
        xhr.send(blob);
      });
    },
    uploadPart(key, uploadId, partNumber, blob, storageId, onProgress) {
      const params = new URLSearchParams({ key, uploadId, partNumber: String(partNumber) });
      if (storageId) params.set('storageId', storageId);
      return multipartApi._xhrUpload(`/api/upload-multipart/part?${params.toString()}`, blob, onProgress);
    },
    complete(params) {
      return request('/api/upload-multipart/complete', {
        method: 'POST',
        json: params,
        csrf: true,
      });
    },
    abort(params) {
      return request('/api/upload-multipart/abort', {
        method: 'POST',
        json: params,
        csrf: true,
      });
    },
  };

  const maintenanceApi = {
    snapshot() {
      return request('/api/admin/maintenance');
    },
    executeAction(action) {
      return request('/api/admin/maintenance', {
        method: 'POST',
        json: { action },
        csrf: true,
      });
    },
  };

  const notificationApi = {
    list(limit = 20) {
      return request(`/api/notifications?limit=${limit}`);
    },
    markRead(id) {
      return request('/api/notifications', {
        method: 'POST',
        json: { action: 'mark-read', id },
        csrf: true,
      });
    },
    markAllRead() {
      return request('/api/notifications', {
        method: 'POST',
        json: { action: 'mark-all-read' },
        csrf: true,
      });
    },
  };

  const taskApi = {
    create(type, payload) {
      return request('/api/tasks', {
        method: 'POST',
        json: { type, payload },
        csrf: true,
      });
    },
    list(limit = 20) {
      return request(`/api/tasks?limit=${limit}`);
    },
    get(id) {
      return request(`/api/tasks?id=${encodeURIComponent(id)}`);
    },
    update(id, data) {
      return request(`/api/tasks?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        json: data,
        csrf: true,
      });
    },
  };

  return {
    apiClient,
    authApi,
    fileApi,
    trashApi,
    shareApi,
    adminApi,
    multipartApi,
    maintenanceApi,
    notificationApi,
    taskApi,
  };
}
