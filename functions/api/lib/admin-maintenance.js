import { addLog, cleanupLogs, formatBytes, isReservedKey, jsonResponse, listR2Objects } from './common.js';
import { fileIndexStatus, rebuildFileIndex } from './file-index.js';
import { mapWithConcurrency } from './r2-tree.js';

async function countRows(env, table) {
  try {
    const row = await env.D1.prepare(`SELECT COUNT(*) as count FROM ${table}`).first();
    return Number(row?.count || 0);
  } catch (_) {
    return 0;
  }
}

async function deletePrefix(env, prefix, limit = 5000) {
  const listed = await listR2Objects(env.R2, { prefix }, { maxObjects: limit });
  await mapWithConcurrency(listed.objects || [], 8, item => env.R2.delete(item.key));
  return { deleted: (listed.objects || []).length, truncated: Boolean(listed.truncated) };
}

export async function getMaintenanceSnapshot(env) {
  const [index, accessAttemptCount, trashCount, logsCount, thumbs, r2Sample] = await Promise.all([
    fileIndexStatus(env),
    countRows(env, 'path_access_attempts'),
    countRows(env, 'trash'),
    countRows(env, 'logs'),
    listR2Objects(env.R2, { prefix: '.thumbs/' }, { maxObjects: 1 }).catch(() => ({ objects: [], truncated: false })),
    listR2Objects(env.R2, {}, { maxObjects: 1000 }).catch(() => ({ objects: [], truncated: false })),
  ]);
  const visibleSampleCount = (r2Sample.objects || []).filter(obj => !isReservedKey(obj.key) && !obj.key.endsWith('/.folder')).length;
  const indexFresh = index.count > 0 && !r2Sample.truncated ? index.count === visibleSampleCount : index.count > 0;
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
    thumbnailsPresent: Boolean((thumbs.objects || []).length || thumbs.truncated),
  };
}

export async function handleAdminMaintenance(env) {
  return jsonResponse(await getMaintenanceSnapshot(env));
}

export async function handleAdminMaintenanceAction(env, request) {
  const { action } = await request.json().catch(() => ({}));
  if (action === 'rebuild-index') {
    const result = await rebuildFileIndex(env);
    await addLog(env, request, 'MAINTENANCE', `重建文件索引，同步 ${result.synced || 0} 个文件${result.truncated ? '，已达扫描上限' : ''}`);
    return jsonResponse({ success: true, action, ...result });
  }
  if (action === 'cleanup-access-attempts') {
    let deleted = 0;
    try {
      const row = await env.D1.prepare('SELECT COUNT(*) as count FROM path_access_attempts').first();
      deleted = Number(row?.count || 0);
      await env.D1.prepare('DELETE FROM path_access_attempts').run();
    } catch (_) {}
    await addLog(env, request, 'MAINTENANCE', `清理访问失败记录 ${deleted} 项`);
    return jsonResponse({ success: true, action, deleted });
  }
  if (action === 'cleanup-thumbnails') {
    const result = await deletePrefix(env, '.thumbs/');
    await addLog(env, request, 'MAINTENANCE', `清理缩略图缓存 ${result.deleted || 0} 项${result.truncated ? '，已达扫描上限' : ''}`);
    return jsonResponse({ success: true, action, ...result });
  }
  if (action === 'cleanup-logs') {
    const deleted = await cleanupLogs(env);
    await addLog(env, request, 'MAINTENANCE', `清理旧操作日志 ${deleted} 条`);
    return jsonResponse({ success: true, action, deleted });
  }
  return jsonResponse({ success: false, message: 'Invalid maintenance action' }, 400);
}
