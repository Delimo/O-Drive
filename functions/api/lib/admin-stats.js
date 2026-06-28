import {
  ensureCoreTables,
  formatBytes,
  isReservedKey,
  jsonResponse,
  listR2Objects,
  recordSystemWarning,
} from "./common/index.js";
import {
  fileIndexStatus,
  getIndexedStats,
  indexedFileCount,
  indexedFileKind,
  syncFileIndexFromR2,
} from "./file-index/index.js";
import { checkStorageQuota, listConfiguredStorages } from "./storage.js";
import { createNotification } from "./notifications.js";
import { getTaskFailureAlertState } from "./tasks.js";

const STORAGE_ALERT_STATE_PREFIX = "storage_quota_alert:";
const STORAGE_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function fileKind(key) {
  return indexedFileKind(key);
}

async function buildStatsResponse(env, context) {
  const indexed = await getIndexedStats(env);
  if (!indexed) return null;
  const dbStats = await adminDbStats(env);
  if (dbStats.trash)
    dbStats.trash.percentOfFiles =
      Number(indexed.files?.totalSize || 0) > 0
        ? Math.round(
            (Number(dbStats.trash.size || 0) /
              Number(indexed.files.totalSize || 0)) *
              100,
          )
        : 0;
  const index = await overviewIndexStatus(env);
  return jsonResponse({
    ...indexed,
    ...dbStats,
    index,
    attention: await overviewAttention(env, indexed, dbStats, index),
  });
}

export async function handleAdminStats(env, context = {}) {
  if (await indexedFileCount(env)) {
    const res = await buildStatsResponse(env, context);
    if (res) return res;
  }
  if (typeof context?.waitUntil === "function") {
    const syncPromise = syncFileIndexFromR2(env, { maxObjects: 20000 });
    context.waitUntil(syncPromise.catch(() => {}));
    return jsonResponse({
      indexing: true,
      attention: [{ type: "info", message: "文件索引正在后台构建中，请稍后刷新页面查看" }],
    });
  }
  await syncFileIndexFromR2(env, { maxObjects: 20000 });
  if (await indexedFileCount(env)) {
    const res = await buildStatsResponse(env, context);
    if (res) return res;
  }
  return jsonResponse({
    attention: [{ type: "warning", message: "文件索引为空，请先在维护页面重建索引" }],
  });
}

async function adminDbStats(env) {
  await ensureCoreTables(env);
  const [trashResult, logResult, taskResult, shareResult] = await Promise.allSettled([
    env.D1.prepare(
      "SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total FROM trash",
    ).first(),
    env.D1.prepare(
      "SELECT COUNT(*) as count FROM logs",
    ).first(),
    env.D1.prepare(
      "SELECT COUNT(*) as count FROM file_tasks WHERE status = 'completed'",
    ).first(),
    env.D1.prepare(
      "SELECT COUNT(*) as count FROM share_links",
    ).first(),
  ]);

  const trashRow = trashResult.status === "fulfilled" ? trashResult.value : null;
  if (trashResult.status === "rejected") {
    await recordSystemWarning(env, "admin.stats", trashResult.reason?.message || "Trash stats failed");
  }
  const trashSize = Number(trashRow?.total || 0);
  const trash = {
    count: Number(trashRow?.count || 0),
    size: trashSize,
    sizeFormatted: formatBytes(trashSize),
  };

  const logRow = logResult.status === "fulfilled" ? logResult.value : null;
  if (logResult.status === "rejected") {
    await recordSystemWarning(env, "admin.stats", logResult.reason?.message || "Log stats failed");
  }
  const logs = { count: Number(logRow?.count || 0) };

  const taskRow = taskResult.status === "fulfilled" ? taskResult.value : null;
  if (taskResult.status === "rejected") {
    await recordSystemWarning(env, "admin.stats", taskResult.reason?.message || "Tasks stats failed");
  }
  const tasks = { completed: Number(taskRow?.count || 0) };

  const shareRow = shareResult.status === "fulfilled" ? shareResult.value : null;
  if (shareResult.status === "rejected") {
    await recordSystemWarning(env, "admin.stats", shareResult.reason?.message || "Share stats failed");
  }
  const shares = { total: Number(shareRow?.count || 0) };

  return { trash, logs, tasks, shares };
}

async function overviewIndexStatus(env, listed = null) {
  const index = await fileIndexStatus(env);
  const sample =
    listed ||
    (await listR2Objects(env.R2, {}, { maxObjects: 1000 }).catch(() => ({
      objects: [],
      truncated: false,
    })));
  const visibleSampleCount = (sample.objects || []).filter(
    (obj) => !isReservedKey(obj.key) && !obj.key.endsWith("/.folder"),
  ).length;
  const fresh =
    index.count > 0 && !sample.truncated
      ? index.count === visibleSampleCount
      : index.count > 0;
  return {
    count: index.count,
    totalSize: index.totalSize,
    totalSizeFormatted: formatBytes(index.totalSize),
    latestUpdatedAt: index.latestUpdatedAt,
    fresh,
    sampleCount: visibleSampleCount,
    sampleTruncated: Boolean(sample.truncated),
    recommendation: fresh ? "索引可用" : "建议重建索引",
  };
}

async function overviewAttention(env, stats, dbStats = {}, index = {}) {
  const items = [];
  const fileCount = Number(stats.files?.count || 0);
  const totalSize = Number(stats.files?.totalSize || 0);
  const trashCount = Number(dbStats.trash?.count || 0);
  const trashSize = Number(dbStats.trash?.size || 0);
  const logsCount = Number(dbStats.logs?.count || 0);

  if (!index.fresh) {
    items.push({
      level: "warning",
      title: "文件索引需要关注",
      body: index.sampleTruncated
        ? "R2 抽样已达上限，建议在维护中心重建索引。"
        : "索引数量与当前抽样不一致，文件列表或统计可能不准确。",
      tab: "health",
    });
    Object.assign(items[items.length - 1], {
      action: "maintenance-action",
      actionArgs: ["rebuild-index"],
    });
  }
  try {
    const storageConfig = await listConfiguredStorages(env);
    const storageTargets = [storageConfig.r2, ...(storageConfig.spaces || [])];
    for (const target of storageTargets) {
      const quota = await checkStorageQuota(env, target.id, 0);
      if (!quota.quota) continue;
      const usedPercent = Math.round((quota.used / quota.quota) * 100);
      const alert = storageQuotaAlertForTarget(target, usedPercent);
      if (alert) {
        items.push({
          level: alert.level,
          title: `${target.name} 空间即将用满`,
          body: `已使用 ${formatBytes(quota.used)} / ${formatBytes(quota.quota)}（${usedPercent}%），已达到 ${alert.threshold}% 告警阈值，建议清理文件或调整该存储桶配额。`,
          tab: "quota",
        });
        await notifyStorageQuotaAlert(env, target, quota, usedPercent, alert);
      }
    }
  } catch (_) {}
  if (
    trashCount >= 100 ||
    trashSize > Math.max(totalSize * 0.2, 1024 * 1024 * 1024)
  ) {
    items.push({
      level: "warning",
      title: "回收站占用偏高",
      body: `当前 ${trashCount} 项，占用 ${dbStats.trash?.sizeFormatted || "0 B"}，可以检查是否需要清理。`,
      tab: "overview",
    });
  }
  if (logsCount >= 1800) {
    items.push({
      level: "info",
      title: "操作日志接近保留上限",
      body: `当前 ${logsCount} 条，系统会自动保留最近 2000 条/90 天。`,
      tab: "logs",
    });
  }
  if (fileCount >= 15000 || stats.files?.truncated) {
    items.push({
      level: "info",
      title: "文件数量较多",
      body: stats.files?.truncated
        ? "概览统计已达到扫描上限，实际文件数可能更多。"
        : `当前已统计 ${fileCount} 个文件，批量操作可能耗时较长。`,
      tab: "overview",
    });
  }

  const [webhookFails, sysWarnings, loginFails, downloadBlocked, unlockFails] =
    await Promise.allSettled([
      env.D1.prepare(
        "SELECT COUNT(*) as count FROM webhook_deliveries WHERE ok = 0",
      ).first(),
      env.D1.prepare(
        "SELECT COUNT(*) as count FROM system_warnings WHERE acknowledged_at = 0",
      ).first(),
      env.D1.prepare(
        "SELECT COUNT(*) as count FROM login_attempts WHERE attempts >= 3",
      ).first(),
      env.D1.prepare(
        "SELECT COUNT(*) as count FROM download_bursts WHERE blocked_until > ?",
      ).bind(Date.now()).first(),
      env.D1.prepare(
        "SELECT COUNT(*) as count FROM path_access_attempts WHERE attempts >= 3",
      ).first(),
    ]);

  if (webhookFails.status === "rejected") await recordSystemWarning(env, "admin.attention", webhookFails.reason?.message || "Webhook delivery count failed").catch(() => {});
  const webhookFailCount = webhookFails.status === "fulfilled" ? Number(webhookFails.value?.count || 0) : 0;
  if (webhookFailCount > 0) {
    items.push({
      level: "warning",
      title: "Webhook 最近有失败投递",
      body: `最近保留的投递记录中有 ${webhookFailCount} 条失败，建议检查目标地址或认证信息。`,
      tab: "webhooks",
    });
  }

  const taskAlert = await getTaskFailureAlertState(env).catch((err) => {
    recordSystemWarning(env, "admin.attention", err?.message || "Task alert count failed").catch(() => {});
    return null;
  });
  if (taskAlert?.alert) {
    const config = taskAlert.config || {};
    items.push({
      level: taskAlert.alert.level,
      title: "后台任务失败偏多",
      body: `最近 ${config.windowHours || 24} 小时有 ${taskAlert.failedCount} 条后台任务失败或部分失败，已达到 ${taskAlert.alert.threshold} 条告警阈值。`,
      tab: "system",
      action: "maintenance-action",
      actionArgs: ["cleanup-tasks"],
    });
  }

  if (sysWarnings.status === "rejected") await recordSystemWarning(env, "admin.attention", sysWarnings.reason?.message || "System warnings count failed").catch(() => {});
  const sysWarningCount = sysWarnings.status === "fulfilled" ? Number(sysWarnings.value?.count || 0) : 0;
  if (sysWarningCount > 0) {
    items.push({
      level: "warning",
      title: "其他异常",
      body: `当前记录了 ${sysWarningCount} 条系统异常，可以在系统状态页查看详情。`,
      tab: "system",
      action: "maintenance-action",
      actionArgs: ["cleanup-warnings"],
    });
  }

  if (loginFails.status === "rejected") await recordSystemWarning(env, "admin.attention", loginFails.reason?.message || "Login attempts count failed").catch(() => {});
  const loginFailCount = loginFails.status === "fulfilled" ? Number(loginFails.value?.count || 0) : 0;
  if (loginFailCount > 0) {
    items.push({
      level: "warning",
      title: "登录异常",
      body: `当前有 ${loginFailCount} 个 IP 触发登录限制，可能遭受暴力破解。`,
      tab: "system",
      action: "maintenance-action",
      actionArgs: ["cleanup-login-attempts"],
    });
  }

  if (downloadBlocked.status === "rejected") await recordSystemWarning(env, "admin.attention", downloadBlocked.reason?.message || "Download bursts count failed").catch(() => {});
  const downloadBlockedCount = downloadBlocked.status === "fulfilled" ? Number(downloadBlocked.value?.count || 0) : 0;
  if (downloadBlockedCount > 0) {
    items.push({
      level: "warning",
      title: "下载异常",
      body: `当前有 ${downloadBlockedCount} 个 IP 被临时禁止下载，检测到异常下载行为。`,
      tab: "system",
      action: "maintenance-action",
      actionArgs: ["cleanup-download-bursts"],
    });
  }

  if (unlockFails.status === "rejected") await recordSystemWarning(env, "admin.attention", unlockFails.reason?.message || "Path access attempts count failed").catch(() => {});
  const unlockFailCount = unlockFails.status === "fulfilled" ? Number(unlockFails.value?.count || 0) : 0;
  if (unlockFailCount > 0) {
    items.push({
      level: "warning",
      title: "路径解锁异常",
      body: `当前有 ${unlockFailCount} 条记录触发路径解锁限制，可能遭受暴力破解。`,
      tab: "system",
      action: "maintenance-action",
      actionArgs: ["cleanup-access-attempts"],
    });
  }

  for (const item of items) {
    if (item.tab === "health" && item.level === "warning" && !item.action) {
      item.action = "maintenance-action";
      item.actionArgs = ["cleanup-warnings"];
    }
  }

  if (!items.length) {
    items.push({
      level: "ok",
      title: "暂无需要处理的事项",
      body: "索引、日志和清理策略处于正常范围。",
      tab: "health",
    });
  }
  return items.slice(0, 6);
}

function storageQuotaAlertForTarget(target, usedPercent) {
  if (target?.alertEnabled === false) return null;
  const warningThreshold = Number(target?.alertWarningPercent || 90);
  const errorThreshold = Number(target?.alertErrorPercent || 95);
  if (usedPercent >= errorThreshold) {
    return { level: "error", threshold: errorThreshold };
  }
  if (usedPercent >= warningThreshold) {
    return { level: "warning", threshold: warningThreshold };
  }
  return null;
}

async function notifyStorageQuotaAlert(env, target, quota, usedPercent, alert) {
  if (!env?.D1) return;
  const storageId = target?.id || "r2";
  const stateKey = `${STORAGE_ALERT_STATE_PREFIX}${storageId}`;
  const now = Date.now();
  let state = {};
  try {
    const row = await env.D1.prepare(
      "SELECT value FROM kv_config WHERE key = ?",
    )
      .bind(stateKey)
      .first();
    state = row?.value ? JSON.parse(row.value) : {};
  } catch (_) {}

  const stillCoolingDown =
    state.level === alert.level &&
    now - Number(state.notifiedAt || 0) < STORAGE_ALERT_COOLDOWN_MS;
  if (stillCoolingDown) return;

  const message = `${target.name} 存储使用率已达到 ${usedPercent}%（阈值 ${alert.threshold}%），当前 ${formatBytes(quota.used)} / ${formatBytes(quota.quota)}。`;
  await createNotification(env, {
    event: `storage.quota.${alert.level}`,
    message,
    path: "admin/storage",
  });
  await env.D1.prepare(
    "INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)",
  )
    .bind(
      stateKey,
      JSON.stringify({
        level: alert.level,
        usedPercent,
        threshold: alert.threshold,
        notifiedAt: now,
      }),
    )
    .run()
    .catch(() => {});
}
