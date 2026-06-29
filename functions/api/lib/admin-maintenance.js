import {
  addLog,
  cleanupLogs,
  ensureCoreTables,
  formatBytes,
  isReservedKey,
  jsonResponse,
  listR2Objects,
} from "./common/index.js";
import {
  countObjectRefs,
  fileIndexStatus,
  rebuildFileIndex,
} from "./file-index/index.js";
import { ensureStorageObjectsTable } from "./storage-objects.js";
import { mapWithConcurrency } from "./r2-tree.js";
import { storageDelete } from "./storage.js";
import { cleanupFileTasks } from "./tasks.js";
import { cleanupZipTaskResults } from "./zip-download.js";

const ALLOWED_COUNT_TABLES = new Set([
  "path_access_attempts",
  "trash",
  "logs",
  "file_tasks",
  "login_attempts",
  "login_alerts",
  "download_bursts",
  "webhook_deliveries",
  "system_warnings",
  "share_links",
  "notifications",
]);

async function countRows(env, table) {
  if (!ALLOWED_COUNT_TABLES.has(table)) return 0;
  try {
    const row = await env.D1.prepare(
      `SELECT COUNT(*) as count FROM ${table}`,
    ).first();
    return Number(row?.count || 0);
  } catch (_) {
    return 0;
  }
}

async function deletePrefix(env, prefix, limit = 5000) {
  const listed = await listR2Objects(env.R2, { prefix }, { maxObjects: limit });
  await mapWithConcurrency(listed.objects || [], 8, (item) =>
    env.R2.delete(item.key),
  );
  return {
    deleted: (listed.objects || []).length,
    truncated: Boolean(listed.truncated),
  };
}

export async function getMaintenanceSnapshot(env) {
  await ensureCoreTables(env);
  const [
    index,
    accessAttemptCount,
    trashCount,
    logsCount,
    taskCount,
    thumbs,
    r2Sample,
  ] = await Promise.all([
    fileIndexStatus(env),
    countRows(env, "path_access_attempts"),
    countRows(env, "trash"),
    countRows(env, "logs"),
    countRows(env, "file_tasks"),
    listR2Objects(env.R2, { prefix: ".thumbs/" }, { maxObjects: 1 }).catch(
      () => ({ objects: [], truncated: false }),
    ),
    listR2Objects(env.R2, {}, { maxObjects: 1000 }).catch(() => ({
      objects: [],
      truncated: false,
    })),
  ]);
  const visibleSampleCount = (r2Sample.objects || []).filter(
    (obj) => !isReservedKey(obj.key) && !obj.key.endsWith("/.folder"),
  ).length;
  const indexFresh =
    index.count > 0 && !r2Sample.truncated
      ? index.count === visibleSampleCount
      : index.count > 0;
  return {
    indexCount: index.count,
    indexTotalSize: index.totalSize,
    indexTotalSizeFormatted: formatBytes(index.totalSize),
    indexLatestUpdatedAt: index.latestUpdatedAt,
    indexFresh,
    r2SampleCount: visibleSampleCount,
    r2SampleTruncated: Boolean(r2Sample.truncated),
    accessAttemptCount,
    trashCount,
    logsCount,
    taskCount,
    thumbnailsPresent: Boolean(
      (thumbs.objects || []).length || thumbs.truncated,
    ),
  };
}

export async function handleAdminMaintenance(env) {
  return jsonResponse(await getMaintenanceSnapshot(env));
}

export async function handleAdminMaintenanceAction(env, request) {
  const { action } = await request.json().catch(() => ({}));
  await ensureCoreTables(env);
  if (action === "rebuild-index") {
    const result = await rebuildFileIndex(env);
    await addLog(
      env,
      request,
      "MAINTENANCE",
      `重建文件索引，同步 ${result.synced || 0} 个文件${result.truncated ? "，已达扫描上限" : ""}`,
    );
    return jsonResponse({ success: true, action, ...result });
  }
  if (action === "cleanup-access-attempts") {
    let deleted = 0;
    try {
      const row = await env.D1.prepare(
        "SELECT COUNT(*) as count FROM path_access_attempts",
      ).first();
      deleted = Number(row?.count || 0);
      await env.D1.prepare("DELETE FROM path_access_attempts").run();
    } catch (_) {}
    await addLog(env, request, "MAINTENANCE", `清理访问失败记录 ${deleted} 项`);
    return jsonResponse({ success: true, action, deleted });
  }
  if (action === "cleanup-login-attempts") {
    let deleted = 0;
    try {
      const row = await env.D1.prepare(
        "SELECT COUNT(*) as count FROM login_attempts",
      ).first();
      deleted = Number(row?.count || 0);
      await env.D1.prepare("DELETE FROM login_attempts").run();
    } catch (_) {}
    await addLog(env, request, "MAINTENANCE", `清理登录失败记录 ${deleted} 项`);
    return jsonResponse({ success: true, action, deleted });
  }
  if (action === "cleanup-download-bursts") {
    let deleted = 0;
    try {
      const row = await env.D1.prepare(
        "SELECT COUNT(*) as count FROM download_bursts",
      ).first();
      deleted = Number(row?.count || 0);
      await env.D1.prepare("DELETE FROM download_bursts").run();
    } catch (_) {}
    await addLog(env, request, "MAINTENANCE", `清理下载异常记录 ${deleted} 项`);
    return jsonResponse({ success: true, action, deleted });
  }
  if (action === "cleanup-thumbnails") {
    const result = await deletePrefix(env, ".thumbs/");
    await addLog(
      env,
      request,
      "MAINTENANCE",
      `清理缩略图缓存 ${result.deleted || 0} 项${result.truncated ? "，已达扫描上限" : ""}`,
    );
    return jsonResponse({ success: true, action, ...result });
  }
  if (action === "cleanup-logs") {
    const deleted = await cleanupLogs(env);
    await addLog(env, request, "MAINTENANCE", `清理旧操作日志 ${deleted} 条`);
    return jsonResponse({ success: true, action, deleted });
  }
  if (action === "cleanup-tasks") {
    const deleted = await cleanupFileTasks(env, Date.now(), { force: true });
    await addLog(
      env,
      request,
      "MAINTENANCE",
      `清理已完成后台任务 ${deleted} 条`,
    );
    return jsonResponse({ success: true, action, deleted });
  }
  if (action === "cleanup-zip-task-results") {
    const result = await cleanupZipTaskResults(env, { force: true });
    await addLog(env, request, "MAINTENANCE", `清理 ZIP 任务结果 ${result.deleted} 个，释放 ${result.bytesFormatted}`);
    return jsonResponse({ success: true, action, ...result });
  }
  if (action === "cleanup-warnings") {
    const row = await env.D1.prepare(
      "SELECT COUNT(*) as count FROM system_warnings WHERE acknowledged_at = 0",
    )
      .first()
      .catch(() => ({ count: 0 }));
    const deleted = Number(row?.count || 0);
    await env.D1.prepare(
      "UPDATE system_warnings SET acknowledged_at = ? WHERE acknowledged_at = 0",
    )
      .bind(Date.now())
      .run();
    await addLog(env, request, "MAINTENANCE", `清理系统提醒 ${deleted} 条`);
    return jsonResponse({ success: true, action, deleted });
  }
  if (action === "rebuild-storage-refs") {
    await ensureStorageObjectsTable(env);
    const allObjects = await env.D1.prepare(
      "SELECT object_key, storage_id FROM storage_objects",
    )
      .all()
      .catch(() => ({ results: [] }));
    let updated = 0;
    for (const obj of (allObjects.results || [])) {
      const refs = await countObjectRefs(env, obj.storage_id || "r2", obj.object_key);
      await env.D1.prepare(
        "UPDATE storage_objects SET ref_count = ?, updated_at = ? WHERE storage_id = ? AND object_key = ?",
      )
        .bind(refs, Date.now(), obj.storage_id || "r2", obj.object_key)
        .run();
      updated++;
    }
    const total = (allObjects.results || []).length;
    await addLog(env, request, "MAINTENANCE", `重建 storage_objects 引用计数，更新 ${updated}/${total} 条`);
    return jsonResponse({ success: true, action, updated, total });
  }
  if (action === "cleanup-orphan-storage-objects") {
    await ensureStorageObjectsTable(env);
    const orphans = await env.D1.prepare(
      "SELECT object_key, storage_id FROM storage_objects WHERE ref_count <= 0",
    )
      .all()
      .catch(() => ({ results: [] }));
    let deleted = 0;
    for (const obj of (orphans.results || [])) {
      await storageDelete(env, obj.storage_id || "r2", obj.object_key);
      await env.D1.prepare(
        "DELETE FROM storage_objects WHERE storage_id = ? AND object_key = ?",
      )
        .bind(obj.storage_id || "r2", obj.object_key)
        .run();
      deleted++;
    }
    await addLog(env, request, "MAINTENANCE", `清理孤儿 storage_objects ${deleted} 条`);
    return jsonResponse({ success: true, action, deleted });
  }
  return jsonResponse(
    { success: false, message: "Invalid maintenance action" },
    400,
  );
}
