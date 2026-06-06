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
  loadWebhookEndpoints,
} from './admin.js';
import { handleProtectedSettings, handleProtectedUnlock } from './protected-paths.js';
import { notifyFileUploaded, notifyFileDeleted, notifyFileMoved, notifyFolderCreated, notifyFileRenamed } from './webhooks.js';
import { checkQuota, formatBytes as formatQuotaBytes } from './storage-quota.js';
import { assertBodySize, jsonResponse } from './common.js';

function waitForWebhook(context, promise) {
  if (!promise) return;
  if (typeof context?.waitUntil === 'function') context.waitUntil(promise.catch(() => {}));
  else promise.catch(() => {});
}

async function notifyConfiguredWebhooks(env, context, notifyFn) {
  try {
    const endpoints = await loadWebhookEndpoints(env);
    waitForWebhook(context, notifyFn(endpoints));
  } catch (_) {}
}

/** Resolve admin-only routes. Returns a Response or null if not an admin route. */
export async function resolveAdminRoute(env, request, method, path, url, r2Key, hiddenPaths, protectedPaths, context = {}) {
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
    const body = await request.clone().json().catch(() => null);
    const res = await handlePaste(env, request);
    if (res.ok && body) {
      try {
        await notifyConfiguredWebhooks(env, context, urls => notifyFileMoved(urls, body.action, body.paths, body.targetDir));
      } catch (_) {}
    }
    return res;
  }

  // Rename
  if (path.startsWith('/api/files/') && method === 'PUT') {
    const body = await request.clone().json().catch(() => null);
    const res = await handleRename(env, request, r2Key);
    if (res.ok && body) {
      try {
        await notifyConfiguredWebhooks(env, context, urls => notifyFileRenamed(urls, '/' + r2Key, body.newName));
      } catch (_) {}
    }
    return res;
  }

  // Batch delete
  if (path === '/api/batch-delete') {
    const body = await request.clone().json().catch(() => null);
    const res = await handleBatchDelete(env, request);
    if (res.ok && body) {
      try {
        await notifyConfiguredWebhooks(env, context, urls => notifyFileDeleted(urls, body.paths, false));
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
    const body = await request.clone().json().catch(() => null);
    const res = await handleTrashDelete(env, request);
    if (res.ok && body) {
      try {
        await notifyConfiguredWebhooks(env, context, urls => notifyFileDeleted(urls, [body.id], true));
      } catch (_) {}
    }
    return res;
  }

  // Mkdir
  if (path.startsWith('/api/mkdir') && method === 'POST') {
    const body = await request.clone().json().catch(() => null);
    const res = await handleMkdir(env, request, r2Key);
    if (res.ok && body) {
      try {
        const folderPath = '/' + r2Key + body.folderName + '/';
        await notifyConfiguredWebhooks(env, context, urls => notifyFolderCreated(urls, folderPath));
      } catch (_) {}
    }
    return res;
  }

  // Upload (single)
  if (path.startsWith('/api/files') && method === 'POST') {
    assertBodySize(request, true);
    const res = await handleUpload(env, request, r2Key);
    if (res.ok) await notifyConfiguredWebhooks(env, context, urls => notifyFileUploaded(urls, '/' + r2Key));
    return res;
  }

  // Multipart
  if (path === '/api/upload-multipart/create' && method === 'POST') {
    try {
      const body = await request.clone().json();
      const totalSize = Number(body.totalSize || body.size || 0);
      if (totalSize > 0) {
        const quota = await checkQuota(env, totalSize);
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
    const body = await request.clone().json().catch(() => null);
    const res = await handleMultipartComplete(env, request);
    if (res.ok && body) {
      try {
        if (body.key) await notifyConfiguredWebhooks(env, context, urls => notifyFileUploaded(urls, '/' + body.key));
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
