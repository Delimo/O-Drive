import { ensureCoreTables, jsonResponse } from './lib/common.js';
import { verifyAuth, verifyCsrf, handleLogin, handleLogout } from './lib/auth.js';
import { handleAdminHealth, handleAdminLogs, handleHiddenSettings, handleAdminStats, handleAdminRebuildIndex } from './lib/admin.js';
import {
  loadProtectedPaths,
  handleProtectedSettings,
  handleProtectedUnlock,
  checkProtectedAccess,
} from './lib/protected-paths.js';
import {
  handlePaste,
  handleRename,
  handleBatchDelete,
  handleOperationEstimate,
  handleMkdir,
  handleUpload,
  handleMultipartCreate,
  handleMultipartPart,
  handleMultipartComplete,
  handleMultipartAbort,
  handleSaveText,
  handleTrashList,
  handleTrashRestore,
  handleTrashDelete,
  handleTrashClear,
  handleTrashCleanup,
  handleTrashRetention,
  handleSearch,
  handleListFiles,
  handleDownloadOrPreview,
  handleThumbnail,
} from './lib/files.js';
import { loadHiddenPaths, getR2KeyFromPath, canReadKey, canWriteUserKey, isAdmin } from './lib/request-context.js';

const csrfProtectedRoutes = [
  ['/api/admin/settings/hidden', ['POST', 'DELETE']],
  ['/api/admin/settings/protected', ['POST', 'DELETE']],
  ['/api/admin/index/rebuild', ['POST']],
  ['/api/paste', ['POST']],
  ['/api/files', ['POST', 'PUT']],
  ['/api/batch-delete', ['POST']],
  ['/api/operation-estimate', ['POST']],
  ['/api/trash/restore', ['POST']],
  ['/api/trash/delete', ['DELETE']],
  ['/api/trash/clear', ['DELETE']],
  ['/api/trash/cleanup', ['POST']],
  ['/api/admin/settings/trash-retention', ['PUT']],
  ['/api/mkdir', ['POST']],
  ['/api/upload-multipart/create', ['POST']],
  ['/api/upload-multipart/part', ['PUT']],
  ['/api/upload-multipart/complete', ['POST']],
  ['/api/upload-multipart/abort', ['POST']],
  ['/api/save-text/', ['POST']],
];

function needsCsrf(path, method) {
  return csrfProtectedRoutes.some(([prefix, methods]) => path.startsWith(prefix) && methods.includes(method));
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    await ensureCoreTables(env);

    if (path === '/api/login' && method === 'POST') return await handleLogin(request, env);
    if (path === '/api/logout') return handleLogout(request);

    const auth = await verifyAuth(request, env);
    if (!auth) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
    if (path === '/api/auth/role') return jsonResponse({ role: auth.role, csrf: auth.role === 'admin' ? auth.csrf : undefined });

    const hiddenPaths = await loadHiddenPaths(env);
    const protectedPaths = await loadProtectedPaths(env);
    const r2Key = getR2KeyFromPath(path);

    if (!canReadKey(auth, r2Key, hiddenPaths)) return jsonResponse({ success: false, message: 'Forbidden' }, 403);
    if (isAdmin(auth) && needsCsrf(path, method) && !verifyCsrf(request, auth)) {
      return jsonResponse({ success: false, message: 'Invalid CSRF token' }, 403);
    }
    if (isAdmin(auth) && r2Key && needsCsrf(path, method) && !canWriteUserKey(r2Key)) {
      return jsonResponse({ success: false, message: 'Reserved system path' }, 403);
    }
    if (path === '/api/access/unlock' && method === 'POST') return await handleProtectedUnlock(env, request, auth, protectedPaths);
    if (r2Key && (path.startsWith('/api/thumbnail/') || path.startsWith('/api/download/') || path.startsWith('/api/preview/'))) {
      const access = await checkProtectedAccess(request, env, auth, protectedPaths, r2Key);
      if (!access.ok) return jsonResponse({ success: false, code: 'password_required', path: access.rule.path, message: 'Password required' }, 403);
    }

    if (isAdmin(auth)) {
      if (path === '/api/admin/logs') return await handleAdminLogs(env, url);
      if (path === '/api/admin/stats') return await handleAdminStats(env);
      if (path === '/api/admin/index/rebuild' && method === 'POST') return await handleAdminRebuildIndex(env);
      if (path === '/api/admin/health') return await handleAdminHealth(env);
      if (path === '/api/admin/settings/hidden') return await handleHiddenSettings(env, request, method, url, hiddenPaths);
      if (path === '/api/admin/settings/protected') return await handleProtectedSettings(env, request, method, url);
      if (path === '/api/admin/settings/trash-retention') return await handleTrashRetention(env, request, method);
      if (path === '/api/paste' && method === 'POST') return await handlePaste(env, request);
      if (path.startsWith('/api/files/') && method === 'PUT') return await handleRename(env, request, r2Key);
      if (path === '/api/batch-delete') return await handleBatchDelete(env, request);
      if (path === '/api/operation-estimate' && method === 'POST') return await handleOperationEstimate(env, request);
      if (path === '/api/trash' && method === 'GET') return await handleTrashList(env, url);
      if (path === '/api/trash/restore' && method === 'POST') return await handleTrashRestore(env, request);
      if (path === '/api/trash/delete' && method === 'DELETE') return await handleTrashDelete(env, request);
      if (path === '/api/trash/clear' && method === 'DELETE') return await handleTrashClear(env, request);
      if (path === '/api/trash/cleanup' && method === 'POST') return await handleTrashCleanup(env, request);
      if (path.startsWith('/api/mkdir') && method === 'POST') return await handleMkdir(env, request, r2Key);
      if (path.startsWith('/api/files') && method === 'POST') return await handleUpload(env, request, r2Key);
      if (path === '/api/upload-multipart/create' && method === 'POST') return await handleMultipartCreate(env, request);
      if (path === '/api/upload-multipart/part' && method === 'PUT') return await handleMultipartPart(env, request, url);
      if (path === '/api/upload-multipart/complete' && method === 'POST') return await handleMultipartComplete(env, request);
      if (path === '/api/upload-multipart/abort' && method === 'POST') return await handleMultipartAbort(env, request);
      if (path.startsWith('/api/save-text/') && method === 'POST') return await handleSaveText(env, request, r2Key);
    }

    if (path === '/api/search') return await handleSearch(env, request, url, hiddenPaths, auth, protectedPaths);
    if (path.startsWith('/api/files') && method === 'GET') return await handleListFiles(env, request, hiddenPaths, auth, r2Key, protectedPaths);
    if (path.startsWith('/api/thumbnail/')) return await handleThumbnail(env, request, r2Key, context);
    if (path.startsWith('/api/download/') || path.startsWith('/api/preview/')) return await handleDownloadOrPreview(env, request, path, r2Key);

    return jsonResponse({ message: 'Not Found' }, 404);
  } catch (err) {
    const status = Number(err.status || 500);
    const message = status >= 500 ? 'Internal Server Error' : err.message;
    return jsonResponse({ success: false, message }, status);
  }
}
