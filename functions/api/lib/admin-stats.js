import { ensureCoreTables, formatBytes, isReservedKey, jsonResponse, listR2Objects, recordSystemWarning } from './common.js';
import { fileIndexStatus, getIndexedStats, indexedFileCount, indexedFileKind, syncFileIndexFromR2 } from './file-index.js';
import { getStorageQuota, getStorageUsed, formatBytes as formatQuotaBytes } from './storage-quota.js';

function fileKind(key) {
  return indexedFileKind(key);
}

function emptyBreakdown() {
  return {
    image: { count: 0, size: 0 },
    video: { count: 0, size: 0 },
    audio: { count: 0, size: 0 },
    pdf: { count: 0, size: 0 },
    text: { count: 0, size: 0 },
    archive: { count: 0, size: 0 },
    exe: { count: 0, size: 0 },
    other: { count: 0, size: 0 },
  };
}

export async function handleAdminStats(env) {
  if (await indexedFileCount(env)) {
    const indexed = await getIndexedStats(env);
    if (indexed) {
      const dbStats = await adminDbStats(env);
      if (dbStats.trash) dbStats.trash.percentOfFiles = Number(indexed.files?.totalSize || 0) > 0
        ? Math.round((Number(dbStats.trash.size || 0) / Number(indexed.files.totalSize || 0)) * 100)
        : 0;
      const index = await overviewIndexStatus(env);
      return jsonResponse({ ...indexed, ...dbStats, index, attention: await overviewAttention(env, indexed, dbStats, index) });
    }
  }
  const listed = await listR2Objects(env.R2, {}, { maxObjects: 20000 });
  await syncFileIndexFromR2(env, { maxObjects: 20000 });
  const objects = (listed.objects || []).filter(obj => !isReservedKey(obj.key) && !obj.key.endsWith('/.folder'));
  const breakdown = emptyBreakdown();
  let totalSize = 0;
  let folderMarkers = 0;

  for (const obj of listed.objects || []) {
    if (obj.key.endsWith('/.folder')) folderMarkers++;
  }

  for (const obj of objects) {
    const size = Number(obj.size || 0);
    const kind = fileKind(obj.key);
    totalSize += size;
    breakdown[kind].count++;
    breakdown[kind].size += size;
  }

  const latest = [...objects]
    .sort((a, b) => (b.uploaded?.getTime?.() || 0) - (a.uploaded?.getTime?.() || 0))
    .slice(0, 10)
    .map(obj => ({
      key: obj.key,
      size: obj.size || 0,
      sizeFormatted: formatBytes(obj.size || 0),
      uploaded: obj.uploaded?.getTime?.() || 0,
    }));

  const dbStats = await adminDbStats(env);
  if (dbStats.trash) dbStats.trash.percentOfFiles = totalSize > 0 ? Math.round((Number(dbStats.trash.size || 0) / totalSize) * 100) : 0;
  const index = await overviewIndexStatus(env, listed);
  const stats = {
    files: {
      count: objects.length,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      folderMarkers,
      truncated: Boolean(listed.truncated),
    },
    breakdown: Object.fromEntries(Object.entries(breakdown).map(([kind, value]) => [
      kind,
      { ...value, sizeFormatted: formatBytes(value.size) },
    ])),
    latest,
    ...dbStats,
    index,
  };
  return jsonResponse({ ...stats, attention: await overviewAttention(env, stats, dbStats, index) });
}

async function adminDbStats(env) {
  let trash = { count: 0, size: 0, sizeFormatted: '0 B' };
  let logs = { count: 0 };
  await ensureCoreTables(env);
  try {
    const trashCount = await env.D1.prepare('SELECT COUNT(*) as count FROM trash').first();
    const trashRows = await env.D1.prepare('SELECT * FROM trash ORDER BY trashed_at DESC').all();
    const size = (trashRows.results || []).reduce((sum, row) => sum + Number(row.size || 0), 0);
    trash = { count: Number(trashCount?.count || 0), size, sizeFormatted: formatBytes(size) };
  } catch (err) {
    await recordSystemWarning(env, 'admin.stats', err?.message || 'Trash stats failed');
  }
  try {
    const logCount = await env.D1.prepare('SELECT COUNT(*) as count FROM logs').first();
    logs = { count: Number(logCount?.count || 0) };
  } catch (err) {
    await recordSystemWarning(env, 'admin.stats', err?.message || 'Log stats failed');
  }
  return { trash, logs };
}

async function overviewIndexStatus(env, listed = null) {
  const index = await fileIndexStatus(env);
  const sample = listed || await listR2Objects(env.R2, {}, { maxObjects: 1000 }).catch(() => ({ objects: [], truncated: false }));
  const visibleSampleCount = (sample.objects || []).filter(obj => !isReservedKey(obj.key) && !obj.key.endsWith('/.folder')).length;
  const fresh = index.count > 0 && !sample.truncated ? index.count === visibleSampleCount : index.count > 0;
  return {
    count: index.count,
    totalSize: index.totalSize,
    totalSizeFormatted: formatBytes(index.totalSize),
    latestUpdatedAt: index.latestUpdatedAt,
    fresh,
    sampleCount: visibleSampleCount,
    sampleTruncated: Boolean(sample.truncated),
    recommendation: fresh ? '索引可用' : '建议重建索引',
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
      level: 'warning',
      title: '文件索引需要关注',
      body: index.sampleTruncated ? 'R2 抽样已达上限，建议在维护中心重建索引。' : '索引数量与当前抽样不一致，文件列表或统计可能不准确。',
      tab: 'health',
    });
    Object.assign(items[items.length - 1], { action: 'maintenance-action', actionArgs: ['rebuild-index'] });
  }
  try {
    const quota = await getStorageQuota(env.D1);
    if (quota > 0) {
      const used = await getStorageUsed(env.D1);
      const usedPercent = Math.round((used / quota) * 100);
      if (usedPercent >= 90) {
        items.push({
          level: 'warning',
          title: '存储空间即将用满',
          body: `已使用 ${formatQuotaBytes(used)} / ${formatQuotaBytes(quota)}（${usedPercent}%），建议清理回收站或调整配额。`,
          tab: 'quota',
        });
      }
    }
  } catch (_) {}
  if (trashCount >= 100 || trashSize > Math.max(totalSize * 0.2, 1024 * 1024 * 1024)) {
    items.push({
      level: 'warning',
      title: '回收站占用偏高',
      body: `当前 ${trashCount} 项，占用 ${dbStats.trash?.sizeFormatted || '0 B'}，可以检查是否需要清理。`,
      tab: 'overview',
    });
  }
  if (logsCount >= 1800) {
    items.push({
      level: 'info',
      title: '操作日志接近保留上限',
      body: `当前 ${logsCount} 条，系统会自动保留最近 2000 条/90 天。`,
      tab: 'logs',
    });
  }
  if (fileCount >= 15000 || stats.files?.truncated) {
    items.push({
      level: 'info',
      title: '文件数量较多',
      body: stats.files?.truncated ? '概览统计已达到扫描上限，实际文件数可能更多。' : `当前已统计 ${fileCount} 个文件，批量操作可能耗时较长。`,
      tab: 'overview',
    });
  }

  try {
    const failed = await env.D1.prepare('SELECT COUNT(*) as count FROM webhook_deliveries WHERE ok = 0').first();
    const count = Number(failed?.count || 0);
    if (count > 0) {
      items.push({
        level: 'warning',
        title: 'Webhook 最近有失败投递',
        body: `最近保留的投递记录中有 ${count} 条失败，建议检查目标地址或认证信息。`,
        tab: 'webhooks',
      });
    }
  } catch (_) {}
  try {
    const warnings = await env.D1.prepare('SELECT COUNT(*) as count FROM system_warnings WHERE acknowledged_at = 0').first();
    const count = Number(warnings?.count || 0);
    if (count > 0) {
      items.push({
        level: 'warning',
        title: '系统提醒待查看',
        body: `当前记录了 ${count} 条系统提醒，可以在系统状态页查看来源。`,
        tab: 'health',
      });
    }
  } catch (_) {}

  for (const item of items) {
    if (item.tab === 'health' && item.level === 'warning' && !item.action) {
      item.action = 'maintenance-action';
      item.actionArgs = ['cleanup-warnings'];
    }
  }

  if (!items.length) {
    items.push({
      level: 'ok',
      title: '暂无需要处理的事项',
      body: '索引、日志和清理策略处于正常范围。',
      tab: 'health',
    });
  }
  return items.slice(0, 6);
}
