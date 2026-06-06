/**
 * Admin route dispatcher and webhook-aware route wrappers.
 * Separates routing concerns from the main entry point.
 */
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
} from './files.js';
import {
  handleAdminHealth,
  handleAdminLogs,
  handleHiddenSettings,
  handleAdminStats,
  handleAdminMaintenance,
  handleAdminMaintenanceAction,
  handleAdminQuota,
  handleAdminWebhooks,
} from './admin.js';
import { handleProtectedSettings, handleProtectedUnlock } from './protected-paths.js';
import { notifyFileUploaded, notifyFileDeleted, notifyFileMoved, notifyFolderCreated, notifyFileRenamed } from './webhooks.js';
import { checkQuota, formatBytes as formatQuotaBytes } from './storage-quota.js';
import { assertBodySize, jsonResponse } from './common.js';

/** Wrap a handler to fire webhook notifications on success. */
function withWebhook(env, handler, notifyFn) {
  return async (...args) => {
    const res = await handler(...args);
    if (res.ok) {
      try {
        // notifyFn is called with the original args so it can extract body/path info
        await notifyFn(res);
      } catch (_) {}
    }
    return res;
  };
}

/** Resolve admin-only routes. Returns a Response or null if not an admin route. */
export async function resolveAdminRoute(env, request, method, path, url, r2Key, hiddenPaths, protectedPaths) {
  if (path === '/api/admin/logs') return await handleAdminLogs(env, url);
  if (path === '/api/admin/stats') return await handleAdminStats(env);
  if (path === '/api/admin/health') return await handleAdminHealth(env);
  if (path === '/api/admin/maintenance' && method === 'GET') return await handleAdminMaintenance(env);
  if (path === '/api/admin/maintenance' && method === 'POST') return await handleAdminMaintenanceAction(env, request);
  if (path === '/api/admin/settings/hidden') return await handleHiddenSettings(env, request, method, url, hiddenPaths);
  if (path === '/api/admin/settings/protected') return await handleProtectedSettings(env, request, method, url);
  if (path === '/api/admin/settings/trash-retention') return await handleTrashRetention(env, request, method);
  if (path === '/api/admin/settings/quota') return await handleAdminQuota(env, request, method);
  if (path === '/api/admin/settings/webhooks') return await handleAdminWebhooks(env, request, method);

  // Paste
  if (path === '/api/paste' && method === 'POST') {
    const res = await handlePaste(env, request);
    if (res.ok) {
      try {
        const body = await request.clone().json();
        notifyFileMoved(env.WEBHOOK_URLS, body.action, body.paths, body.targetDir);
      } catch (_) {}
    }
    return res;
  }

  // Rename
  if (path.startsWith('/api/files/') && method === 'PUT') {
    const res = await handleRename(env, request, r2Key);
    if (res.ok) {
      try {
        const body = await request.clone().json();
        notifyFileRenamed(env.WEBHOOK_URLS, '/' + r2Key, body.newName);
      } catch (_) {}
    }
    return res;
  }

  // Batch delete
  if (path === '/api/batch-delete') {
    const res = await handleBatchDelete(env, request);
    if (res.ok) {
      try {
        const body = await request.clone().json();
        notifyFileDeleted(env.WEBHOOK_URLS, body.paths, false);
      } catch (_) {}
    }
    return res;
  }

  if (path === '/api/operation-estimate' && method === 'POST') return await handleOperationEstimate(env, request);
  if (path === '/api/trash' && method === 'GET') return await handleTrashList(env, url);
  if (path === '/api/trash/restore' && method === 'POST') return await handleTrashRestore(env, request);
  if (path === '/api/trash/clear' && method === 'DELETE') return await handleTrashClear(env, request);
  if (path === '/api/trash/cleanup' && method === 'POST') return await handleTrashCleanup(env, request);

  // Trash delete (purge)
  if (path === '/api/trash/delete' && method === 'DELETE') {
    const res = await handleTrashDelete(env, request);
    if (res.ok) {
      try {
        const body = await request.clone().json();
        notifyFileDeleted(env.WEBHOOK_URLS, [body.id], true);
      } catch (_) {}
    }
    return res;
  }

  // Mkdir
  if (path.startsWith('/api/mkdir') && method === 'POST') {
    const res = await handleMkdir(env, request, r2Key);
    if (res.ok) {
      try {
        const body = await request.clone().json();
        const folderPath = '/' + r2Key + body.folderName + '/';
        notifyFolderCreated(env.WEBHOOK_URLS, folderPath);
      } catch (_) {}
    }
    return res;
  }

  // Upload (single)
  if (path.startsWith('/api/files') && method === 'POST') {
    assertBodySize(request, true);
    const contentLen = Number(request.headers.get('content-length') || 0);
    if (contentLen > 0) {
      const quota = await checkQuota(env.D1, contentLen);
      if (!quota.allowed) {
        return jsonResponse(
          { success: false, code: 'QUOTA_EXCEEDED', message: `Storage quota exceeded. Used: ${formatQuotaBytes(quota.used)}, Quota: ${formatQuotaBytes(quota.quota)}, Requested: ${formatQuotaBytes(contentLen)}` },
          507,
        );
      }
    }
    const res = await handleUpload(env, request, r2Key);
    if (res.ok) notifyFileUploaded(env.WEBHOOK_URLS, '/' + r2Key);
    return res;
  }

  // Multipart
  if (path === '/api/upload-multipart/create' && method === 'POST') {
    try {
      const body = await request.clone().json();
      if (body.totalSize > 0) {
        const quota = await checkQuota(env.D1, body.totalSize);
        if (!quota.allowed) {
          return jsonResponse(
            { success: false, code: 'QUOTA_EXCEEDED', message: `Storage quota exceeded. ${formatQuotaBytes(quota.remaining)} remaining of ${formatQuotaBytes(quota.quota)}` },
            507,
          );
        }
      }
    } catch (_) {}
    return await handleMultipartCreate(env, request);
  }

  if (path === '/api/upload-multipart/part' && method === 'PUT') {
    assertBodySize(request, true);
    return await handleMultipartPart(env, request, url);
  }

  if (path === '/api/upload-multipart/complete' && method === 'POST') {
    const res = await handleMultipartComplete(env, request);
    if (res.ok) {
      try {
        const body = await request.clone().json();
        if (body.key) notifyFileUploaded(env.WEBHOOK_URLS, '/' + body.key);
      } catch (_) {}
    }
    return res;
  }

  if (path === '/api/upload-multipart/abort' && method === 'POST') return await handleMultipartAbort(env, request);
  if (path.startsWith('/api/save-text/') && method === 'POST') return await handleSaveText(env, request, r2Key);

  return null; // Not an admin route
}

/** Resolve public routes (accessible by any authenticated user including guests). */
export async function resolvePublicRoute(env, request, url, path, method, hiddenPaths, auth, r2Key, protectedPaths) {
  if (path === '/api/access/unlock' && method === 'POST') return await handleProtectedUnlock(env, request, auth, protectedPaths);
  if (path === '/api/search') return await handleSearch(env, request, url, hiddenPaths, auth, protectedPaths);
  if (path.startsWith('/api/files') && method === 'GET') return await handleListFiles(env, request, hiddenPaths, auth, r2Key, protectedPaths);
  if (path.startsWith('/api/thumbnail/')) return await handleThumbnail(env, request, r2Key, { env });
  if (path.startsWith('/api/download/') || path.startsWith('/api/preview/')) return await handleDownloadOrPreview(env, request, path, r2Key);

  return null; // Not a public route
}