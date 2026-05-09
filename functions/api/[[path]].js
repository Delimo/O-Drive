import { jsonResponse } from './lib/common.js';
import { verifyAuth, handleLogin, handleLogout } from './lib/auth.js';
import { handleAdminLogs, handleHiddenSettings } from './lib/admin.js';
import {
  handlePaste,
  handleRename,
  handleBatchDelete,
  handleMkdir,
  handleUpload,
  handleSaveText,
  handleSearch,
  handleListFiles,
  handleDownloadOrPreview,
} from './lib/files.js';
import { isHiddenKey } from './lib/common.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    if (path === '/api/login' && method === 'POST') return await handleLogin(request, env);
    if (path === '/api/logout') return handleLogout();

    const auth = await verifyAuth(request, env);
    if (!auth) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
    if (path === '/api/auth/role') return jsonResponse({ role: auth.role });

    let hiddenPaths = [];
    try {
      const res = await env.DB.prepare('SELECT key FROM settings').all();
      hiddenPaths = res.results.map(r => r.key);
    } catch (e) {}

    let r2Key = '';
    if (path.startsWith('/api/files/')) r2Key = decodeURIComponent(path.slice(11));
    else if (path.startsWith('/api/download/')) r2Key = decodeURIComponent(path.slice(14));
    else if (path.startsWith('/api/preview/')) r2Key = decodeURIComponent(path.slice(13));
    else if (path.startsWith('/api/mkdir/')) r2Key = decodeURIComponent(path.slice(11));
    else if (path.startsWith('/api/save-text/')) r2Key = decodeURIComponent(path.slice(15));

    if (isHiddenKey(r2Key, hiddenPaths) && auth.role !== 'admin') return jsonResponse({ success: false, message: 'Forbidden' }, 403);

    if (auth.role === 'admin') {
      if (path === '/api/admin/logs') return await handleAdminLogs(env, url);
      if (path === '/api/admin/settings/hidden') return await handleHiddenSettings(env, request, method, url, hiddenPaths);
      if (path === '/api/paste' && method === 'POST') return await handlePaste(env, request);
      if (path.startsWith('/api/files/') && method === 'PUT') return await handleRename(env, request, r2Key);
      if (path === '/api/batch-delete') return await handleBatchDelete(env, request);
      if (path.startsWith('/api/mkdir') && method === 'POST') return await handleMkdir(env, request, r2Key);
      if (path.startsWith('/api/files') && method === 'POST') return await handleUpload(env, request, r2Key);
      if (path.startsWith('/api/save-text/') && method === 'POST') return await handleSaveText(env, request, r2Key);
    }

    if (path === '/api/search') return await handleSearch(env, request, url, hiddenPaths, auth);
    if (path.startsWith('/api/files') && method === 'GET') return await handleListFiles(env, hiddenPaths, auth, r2Key);
    if (path.startsWith('/api/download/') || path.startsWith('/api/preview/')) return await handleDownloadOrPreview(env, path, r2Key);

    return jsonResponse({ message: 'Not Found' }, 404);
  } catch (err) {
    return jsonResponse({ success: false, message: err.message }, 500);
  }
}
