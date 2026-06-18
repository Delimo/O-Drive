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
    search(query, scope) {
      return request(`/api/search?q=${encodeURIComponent(query)}&scope=${encodeURIComponent(scope)}&limit=60`);
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
    uploadWithProgress(targetDir, file, targetName, onProgress) {
      const route = targetDir ? `/api/files/${encodeRouteKey(targetDir)}?conflict=rename` : '/api/files?conflict=rename';
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
  };

  return {
    apiClient,
    request,
    authApi,
    fileApi,
    trashApi,
    shareApi,
    adminApi,
  };
}
