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
  handleUploadCheck,
  handleSaveText,
} from "./file-mutations/index.js";
import {
  handleTrashList,
  handleTrashRestore,
  handleTrashRestorePreview,
  handleTrashBatchRestore,
  handleTrashDelete,
  handleTrashClear,
  handleTrashCleanup,
  handleTrashRetention,
} from "./trash.js";
import {
  handleSearch,
  handleFolderStats,
  handleListFiles,
  handleDownloadOrPreview,
} from "./file-reads.js";
import { handleThumbnail } from "./thumbnails.js";
import { handleZipDownload } from "./zip-download.js";

import {
  handleAdminHealth,
  handleAdminLogs,
  handleHiddenSettings,
  handleAdminStats,
  handleAdminQuota,
  handleAdminWebhooks,
  handleAdminWebhookDeliveries,
  handleAdminWebhookDeliveryRetry,
  handleAdminNotifications,
  loadWebhookEndpoints,
} from "./admin.js";
import { handleAdminStorage } from "./storage.js";
import {
  handleAdminMaintenance,
  handleAdminMaintenanceAction,
} from "./admin-maintenance.js";
import {
  handleProtectedSettings,
  handleProtectedUnlock,
} from "./protected-paths.js";
import { handleAdminShares } from "./shares.js";
import {
  createFileTask,
  getFileTask,
  handleTaskAlertSettings,
  retryFileTask,
  updateFileTask,
} from "./tasks.js";
import {
  createWebhookEventNotification,
  notifyWebhookWithLog,
} from "./webhooks.js";
import {
  assertBodySize,
  jsonResponse,
  recordSystemWarning,
  waitForWebhook,
} from "./common/index.js";
import {
  checkDownloadBlocked,
  recordDownloadBurst,
} from "./download-bursts.js";

async function notifyConfiguredWebhookEvent(env, context, event, data) {
  try {
    const endpoints = await loadWebhookEndpoints(env);
    await createWebhookEventNotification(env, event, data);
    waitForWebhook(
      context,
      notifyWebhookWithLog(env, endpoints, event, data, {
        skipNotification: true,
      }),
    );
  } catch (err) {
    await recordSystemWarning(
      env,
      "webhooks.notify",
      err?.message || `Webhook event failed: ${event}`,
    );
  }
}

async function notifyAfterOk(env, context, res, event, data) {
  if (!res?.ok || !data) return;
  await notifyConfiguredWebhookEvent(env, context, event, data);
}

async function monitorDownloadBurst(env, request, auth, r2Key, context) {
  try {
    const alert = await recordDownloadBurst(env, request, auth, r2Key);
    if (!alert) return;
    await notifyConfiguredWebhookEvent(env, context, "download.burst", alert);
  } catch (err) {
    await recordSystemWarning(
      env,
      "download.burst",
      err?.message || "Download burst monitor failed",
    );
  }
}

function prefixMatches(path, prefix) {
  if (path === prefix) return true;
  if (prefix.endsWith("/")) return path.startsWith(prefix);
  return path.startsWith(`${prefix}/`);
}

function matchesDispatchRoute(route, path, method) {
  const pathMatches = route.path ? path === route.path : prefixMatches(path, route.prefix);
  const methodMatches = !route.methods || route.methods.includes(method);
  return pathMatches && methodMatches;
}

function findDispatchRoute(routes, path, method) {
  return routes.find(route => matchesDispatchRoute(route, path, method));
}

async function handlePasteRoute({ env, request, context }) {
  const body = await request.json().catch(() => null);
  const res = await handlePaste(env, request, body);
  if (res.ok && body) {
    await notifyAfterOk(
      env,
      context,
      res,
      body.action === "move" ? "file.moved" : "file.copied",
      { paths: body.paths, targetDir: body.targetDir },
    );
  }
  return res;
}

async function handleRenameRoute({ env, request, r2Key, context }) {
  const body = await request.json().catch(() => null);
  const res = await handleRename(env, request, r2Key, body);
  if (res.ok && body) {
    await notifyAfterOk(env, context, res, "file.renamed", {
      oldPath: "/" + r2Key,
      newName: body.newName,
    });
  }
  return res;
}

async function handleBatchDeleteRoute({ env, request, context }) {
  const body = await request.json().catch(() => null);
  const res = await handleBatchDelete(env, request, body);
  if (res.ok && body) {
    await notifyAfterOk(env, context, res, "file.deleted", {
      paths: body.paths,
    });
  }
  return res;
}

async function handleTrashDeleteRoute({ env, request, context }) {
  const meta = {};
  const res = await handleTrashDelete(env, request, meta);
  if (res.ok && meta.webhook?.originalKey) {
    await notifyAfterOk(env, context, res, "file.purged", {
      paths: [meta.webhook.originalKey],
    });
  }
  return res;
}

async function handleTrashClearRoute({ env, request, context }) {
  const meta = {};
  const res = await handleTrashClear(env, request, meta);
  if (res.ok && Number(meta.webhook?.deleted || 0) > 0) {
    await notifyAfterOk(env, context, res, "file.purged", {
      path: "回收站",
      deleted: meta.webhook.deleted,
      total: meta.webhook.total,
    });
  }
  return res;
}

async function handleMkdirRoute({ env, request, r2Key, context }) {
  const meta = {};
  const res = await handleMkdir(env, request, r2Key, meta);
  if (res.ok && meta.webhook?.path) {
    await notifyAfterOk(env, context, res, "folder.created", {
      path: meta.webhook.path,
    });
  }
  return res;
}

async function handleSingleUploadRoute({ env, request, r2Key, context }) {
  assertBodySize(request, true);
  const meta = {};
  const res = await handleUpload(env, request, r2Key, meta);
  if (res.ok && meta.webhook?.key) {
    await notifyAfterOk(env, context, res, "file.uploaded", {
      path: "/" + meta.webhook.key,
      uploader: "admin",
    });
  }
  return res;
}

async function handleMultipartPartRoute({ env, request, url }) {
  assertBodySize(request, true);
  return await handleMultipartPart(env, request, url);
}

async function handleMultipartCompleteRoute({ env, request, context }) {
  const body = await request.json().catch(() => null);
  const res = await handleMultipartComplete(env, request, body);
  if (res.ok && body?.key) {
    await notifyAfterOk(env, context, res, "file.uploaded", {
      path: "/" + body.key,
      uploader: "admin",
    });
  }
  return res;
}

async function handleDownloadOrPreviewRoute({ env, request, path, auth, r2Key, context }) {
  if (path.startsWith("/api/download/")) {
    const blocked = await checkDownloadBlocked(env, request, auth);
    if (blocked.blocked) {
      return jsonResponse(
        {
          success: false,
          code: "DOWNLOAD_BLOCKED",
          message: "Download temporarily blocked",
          retryAfter: blocked.retryAfter,
        },
        429,
        { "Retry-After": String(blocked.retryAfter) },
      );
    }
  }
  const res = await handleDownloadOrPreview(env, request, path, r2Key);
  if (res.ok && path.startsWith("/api/download/"))
    waitForWebhook(
      context,
      monitorDownloadBurst(env, request, auth, r2Key, context),
    );
  return res;
}

export const ADMIN_ROUTE_DISPATCHERS = [
  { path: "/api/admin/logs", handler: ({ env, url }) => handleAdminLogs(env, url) },
  { path: "/api/admin/stats", handler: ({ env, context }) => handleAdminStats(env, context) },
  { path: "/api/admin/health", handler: ({ env }) => handleAdminHealth(env) },
  { path: "/api/admin/maintenance", methods: ["GET"], handler: ({ env }) => handleAdminMaintenance(env) },
  { path: "/api/admin/maintenance", methods: ["POST"], handler: ({ env, request }) => handleAdminMaintenanceAction(env, request) },
  { path: "/api/admin/settings/hidden", handler: ({ env, request, method, url, hiddenPaths }) => handleHiddenSettings(env, request, method, url, hiddenPaths) },
  { path: "/api/admin/settings/protected", handler: ({ env, request, method, url }) => handleProtectedSettings(env, request, method, url) },
  { path: "/api/admin/settings/trash-retention", handler: ({ env, request, method }) => handleTrashRetention(env, request, method) },
  { path: "/api/admin/settings/quota", handler: ({ env, request, method }) => handleAdminQuota(env, request, method) },
  { path: "/api/admin/settings/storage", handler: ({ env, request, method }) => handleAdminStorage(env, request, method) },
  { path: "/api/admin/settings/webhooks", handler: ({ env, request, method }) => handleAdminWebhooks(env, request, method) },
  { path: "/api/admin/settings/task-alerts", handler: ({ env, request, method }) => handleTaskAlertSettings(env, request, method) },
  { path: "/api/admin/webhook-deliveries", handler: ({ env }) => handleAdminWebhookDeliveries(env) },
  { path: "/api/admin/webhook-deliveries/retry", methods: ["POST"], handler: ({ env, request }) => handleAdminWebhookDeliveryRetry(env, request) },
  { path: "/api/admin/shares", handler: ({ env, request, method, url, context }) => handleAdminShares(env, request, method, url, context) },
  { path: "/api/notifications", handler: ({ env, request }) => handleAdminNotifications(env, request) },
  { path: "/api/tasks", methods: ["POST"], handler: ({ env, request, context }) => createFileTask(env, request, context) },
  { path: "/api/tasks/retry", methods: ["POST"], handler: ({ env, request, context }) => retryFileTask(env, request, context) },
  { path: "/api/tasks", methods: ["PATCH"], handler: ({ env, request, url }) => updateFileTask(env, request, url) },
  { path: "/api/tasks", methods: ["GET"], handler: ({ env, url }) => getFileTask(env, url) },
  { path: "/api/operation-estimate", methods: ["POST"], handler: ({ env, request }) => handleOperationEstimate(env, request) },
  { path: "/api/trash", methods: ["GET"], handler: ({ env, url }) => handleTrashList(env, url) },
  { path: "/api/trash/restore-preview", methods: ["POST"], handler: ({ env, request }) => handleTrashRestorePreview(env, request) },
  { path: "/api/trash/restore-batch", methods: ["POST"], handler: ({ env, request }) => handleTrashBatchRestore(env, request) },
  { path: "/api/trash/restore", methods: ["POST"], handler: ({ env, request }) => handleTrashRestore(env, request) },
  { path: "/api/trash/clear", methods: ["DELETE"], handler: handleTrashClearRoute },
  { path: "/api/trash/cleanup", methods: ["POST"], handler: ({ env, request }) => handleTrashCleanup(env, request) },
  { path: "/api/upload/check", methods: ["POST"], handler: ({ env, request }) => handleUploadCheck(env, request) },
  { path: "/api/upload-multipart/create", methods: ["POST"], handler: ({ env, request }) => handleMultipartCreate(env, request) },
  { path: "/api/upload-multipart/abort", methods: ["POST"], handler: ({ env, request }) => handleMultipartAbort(env, request) },
  { prefix: "/api/save-text/", methods: ["POST"], handler: ({ env, request, r2Key }) => handleSaveText(env, request, r2Key) },
  { path: "/api/paste", methods: ["POST"], handler: handlePasteRoute },
  { prefix: "/api/files/", methods: ["PUT"], handler: handleRenameRoute },
  { path: "/api/batch-delete", handler: handleBatchDeleteRoute },
  { path: "/api/trash/delete", methods: ["DELETE"], handler: handleTrashDeleteRoute },
  { prefix: "/api/mkdir", methods: ["POST"], handler: handleMkdirRoute },
  { prefix: "/api/files", methods: ["POST"], handler: handleSingleUploadRoute },
  { path: "/api/upload-multipart/part", methods: ["PUT"], handler: handleMultipartPartRoute },
  { path: "/api/upload-multipart/complete", methods: ["POST"], handler: handleMultipartCompleteRoute },
];

export const PUBLIC_ROUTE_DISPATCHERS = [
  { path: "/api/zip-download", methods: ["POST"], handler: ({ env, request, hiddenPaths, auth, protectedPaths, context }) => handleZipDownload(env, request, hiddenPaths, auth, protectedPaths, context) },
  { path: "/api/access/unlock", methods: ["POST"], handler: ({ env, request, auth, protectedPaths }) => handleProtectedUnlock(env, request, auth, protectedPaths) },
  { path: "/api/search", handler: ({ env, request, url, hiddenPaths, auth, protectedPaths }) => handleSearch(env, request, url, hiddenPaths, auth, protectedPaths) },
  { prefix: "/api/folder-stats/", methods: ["GET"], handler: ({ env, request, hiddenPaths, auth, r2Key, protectedPaths }) => handleFolderStats(env, request, hiddenPaths, auth, r2Key, protectedPaths) },
  { prefix: "/api/files", methods: ["GET"], handler: ({ env, request, hiddenPaths, auth, r2Key, protectedPaths }) => handleListFiles(env, request, hiddenPaths, auth, r2Key, protectedPaths) },
  { prefix: "/api/thumbnail/", handler: ({ env, request, r2Key }) => handleThumbnail(env, request, r2Key, { env }) },
  { prefix: "/api/download/", handler: handleDownloadOrPreviewRoute },
  { prefix: "/api/preview/", handler: handleDownloadOrPreviewRoute },
];

/** Resolve admin-only routes. Returns a Response or null if not an admin route. */
export async function resolveAdminRoute(
  env,
  request,
  method,
  path,
  url,
  r2Key,
  hiddenPaths,
  protectedPaths,
  context = {},
) {
  const dispatchRoute = findDispatchRoute(ADMIN_ROUTE_DISPATCHERS, path, method);
  if (dispatchRoute) {
    return await dispatchRoute.handler({ env, request, method, path, url, r2Key, hiddenPaths, protectedPaths, context });
  }

  return null; // Not an admin route
}

/** Resolve public routes (accessible by any authenticated user including guests). */
export async function resolvePublicRoute(
  env,
  request,
  url,
  path,
  method,
  hiddenPaths,
  auth,
  r2Key,
  protectedPaths,
  context = {},
) {
  const dispatchRoute = findDispatchRoute(PUBLIC_ROUTE_DISPATCHERS, path, method);
  if (dispatchRoute) {
    return await dispatchRoute.handler({ env, request, url, path, method, hiddenPaths, auth, r2Key, protectedPaths, context });
  }

  return null; // Not a public route
}
