import { addLog, jsonResponse, normalizeHiddenPath, formatBytes, isReservedKey, listR2Objects, recordSystemWarning } from './common.js';
import { fileIndexStatus, getIndexedStats, indexedFileCount, indexedFileKind, rebuildFileIndex, syncFileIndexFromR2 } from './file-index.js';
import { cleanupLogs } from './common.js';
import { mapWithConcurrency } from './r2-tree.js';
import { getStorageQuota, setStorageQuota, getStorageUsed, formatBytes as formatQuotaBytes } from './storage-quota.js';
import { tokenSecretStatus } from './secrets.js';
import { normalizeWebhookEndpoints, testWebhookEndpoint } from './webhooks.js';

function fileKind(key) {
  return indexedFileKind(key);
}

function emptyBreakdown() {
  return {
    image: { count: 0, size: 0 },
    video: { count: 0, size: 0 },
    audio: { count: 0, size: 0 },
    text: { count: 0, size: 0 },
    archive: { count: 0, size: 0 },
    exe: { count: 0, size: 0 },
    other: { count: 0, size: 0 },
  };
}

export async function handleAdminLogs(env, url) {
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const size = Math.max(1, Math.min(100, Number(url.searchParams.get('size') || '20')));
  const filters = [];
  const params = [];
  const q = String(url.searchParams.get('q') || '').trim();
  const action = String(url.searchParams.get('action') || '').trim().toUpperCase();
  const ip = String(url.searchParams.get('ip') || '').trim();
  const status = String(url.searchParams.get('status') || '').trim();
  const targetPath = String(url.searchParams.get('targetPath') || '').trim();
  const from = String(url.searchParams.get('from') || '').trim();
  const to = String(url.searchParams.get('to') || '').trim();
  if (q) {
    filters.push('(action LIKE ? OR details LIKE ? OR ip LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (action) {
    filters.push('action = ?');
    params.push(action);
  }
  if (ip) {
    filters.push('ip LIKE ?');
    params.push(`%${ip}%`);
  }
  if (status) {
    filters.push('status = ?');
    params.push(status);
  }
  if (targetPath) {
    filters.push('target_path LIKE ?');
    params.push(`%${targetPath}%`);
  }
  if (from) {
    filters.push('timestamp >= ?');
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    filters.push('timestamp <= ?');
    params.push(`${to} 23:59:59`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  let totalStmt = env.D1.prepare(`SELECT COUNT(*) as count FROM logs ${where}`);
  if (params.length) totalStmt = totalStmt.bind(...params);
  const totalRes = await totalStmt.first();
  const logs = await env.D1.prepare(`SELECT * FROM logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).bind(...params, size, (page - 1) * size).all();
  return jsonResponse({ logs: logs.results, totalPages: Math.ceil((totalRes?.count || 0) / size), currentPage: page });
}

export async function handleAdminStats(env) {
  if (await indexedFileCount(env)) {
    const indexed = await getIndexedStats(env);
    if (indexed) return jsonResponse({ ...indexed, ...(await adminDbStats(env)), index: await overviewIndexStatus(env) });
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

  return jsonResponse({
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
    ...(await adminDbStats(env)),
    index: await overviewIndexStatus(env, listed),
  });
}

async function adminDbStats(env) {
  let trash = { count: 0, size: 0, sizeFormatted: '0 B' };
  let logs = { count: 0 };
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

async function checkDb(env) {
  if (!env.D1) return { bound: false, ok: false, message: 'D1 binding missing' };
  try {
    await env.D1.prepare('SELECT 1').first();
    let tables = [];
    try {
      const res = await env.D1.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC").all();
      tables = (res.results || []).map(row => row.name).filter(Boolean);
    } catch (_) {}
    return { bound: true, ok: true, tables };
  } catch (e) {
    return { bound: true, ok: false, message: e.message || 'D1 check failed' };
  }
}

async function checkR2(env) {
  if (!env.R2) return { bound: false, ok: false, message: 'R2 binding missing' };
  try {
    await env.R2.list({ limit: 1 });
    return { bound: true, ok: true };
  } catch (e) {
    return { bound: true, ok: false, message: e.message || 'R2 check failed' };
  }
}

async function latestSystemWarnings(env) {
  try {
    const rows = await env.D1.prepare('SELECT * FROM system_warnings ORDER BY created_at DESC, id DESC LIMIT 10').all();
    return rows.results || [];
  } catch (_) {
    return [];
  }
}

export async function handleAdminHealth(env) {
  const [db, r2, warnings] = await Promise.all([checkDb(env), checkR2(env), latestSystemWarnings(env)]);
  const tokenSecret = tokenSecretStatus(env);
  const envStatus = {
    adminUsername: Boolean(env.ADMIN_USERNAME),
    adminPassword: Boolean(env.ADMIN_PASSWORD),
    tokenSecret,
    allowGuestConfigured: Object.prototype.hasOwnProperty.call(env, 'ALLOW_GUEST'),
    guestEnabled: env.ALLOW_GUEST === 'true',
  };
  const ok = db.ok && r2.ok && envStatus.adminUsername && envStatus.adminPassword;

  return jsonResponse({
    ok,
    db,
    r2,
    env: envStatus,
    warnings,
  });
}

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

export async function handleAdminMaintenance(env) {
  const [index, accessAttemptCount, trashCount, logsCount, thumbs, r2Sample] = await Promise.all([
    fileIndexStatus(env),
    countRows(env, 'path_access_attempts'),
    countRows(env, 'trash'),
    countRows(env, 'logs'),
    listR2Objects(env.R2, { prefix: '.thumbs/' }, { maxObjects: 1 }).catch(() => ({ objects: [], truncated: false })),
    listR2Objects(env.R2, {}, { maxObjects: 1000 }).catch(() => ({ objects: [], truncated: false })),
  ]);
  const visibleSampleCount = (r2Sample.objects || []).filter(obj => !isReservedKey(obj.key) && !obj.key.endsWith('/.folder')).length;
  return jsonResponse({
    indexCount: index.count,
    indexTotalSize: index.totalSize,
    indexTotalSizeFormatted: formatBytes(index.totalSize),
    indexLatestUpdatedAt: index.latestUpdatedAt,
    indexFresh: index.count > 0 && !r2Sample.truncated ? index.count === visibleSampleCount : index.count > 0,
    r2SampleCount: visibleSampleCount,
    r2SampleTruncated: Boolean(r2Sample.truncated),
    accessAttemptCount,
    trashCount,
    logsCount,
    thumbnailsPresent: Boolean((thumbs.objects || []).length || thumbs.truncated),
  });
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

export async function handleAdminQuota(env, request, method) {
  if (method === 'GET') {
    const [quota, used] = await Promise.all([getStorageQuota(env.D1), getStorageUsed(env.D1)]);
    return jsonResponse({ quota, used, remaining: quota ? Math.max(0, quota - used) : Infinity, quotaFormatted: quota ? formatQuotaBytes(quota) : '无限制', usedFormatted: formatQuotaBytes(used) });
  }
  if (method === 'PUT') {
    const { bytes } = await request.json().catch(() => ({}));
    const nextBytes = Number(bytes) || 0;
    await setStorageQuota(env.D1, nextBytes);
    await addLog(env, request, 'QUOTA', nextBytes > 0 ? `设置存储配额为 ${formatQuotaBytes(nextBytes)}` : '取消存储配额限制');
    return jsonResponse({ success: true });
  }
  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}

export async function loadWebhookEndpoints(env) {
  let items = [];
  try {
    const row = await env.D1.prepare("SELECT value FROM kv_config WHERE key = 'webhooks'").first();
    if (row?.value) items = JSON.parse(row.value);
  } catch (err) {
    await recordSystemWarning(env, 'webhooks.config', err?.message || 'Webhook settings load failed');
  }
  return normalizeWebhookEndpoints(items);
}

export async function handleAdminWebhooks(env, request, method) {
  if (method === 'GET') {
    let items = [];
    try {
      const row = await env.D1.prepare("SELECT value FROM kv_config WHERE key = 'webhooks'").first();
      if (row?.value) items = JSON.parse(row.value);
    } catch (err) {
      await recordSystemWarning(env, 'webhooks.config', err?.message || 'Webhook settings load failed');
    }
    const endpoints = normalizeWebhookEndpoints(items);
    return jsonResponse({ items: endpoints, urls: endpoints.map(endpoint => endpoint.url) });
  }
  if (method === 'PUT') {
    const body = await request.json().catch(() => ({}));
    const endpoints = normalizeWebhookEndpoints(body.items || []);
    if (endpoints.length) {
      await env.D1.prepare('INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)').bind('webhooks', JSON.stringify(endpoints)).run();
    } else {
      await env.D1.prepare("DELETE FROM kv_config WHERE key = 'webhooks'").run();
    }
    await addLog(env, request, 'WEBHOOKS', `保存 Webhook 配置 ${endpoints.length} 条`);
    return jsonResponse({ success: true, items: endpoints, urls: endpoints.map(endpoint => endpoint.url) });
  }
  if (method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const endpoint = body.endpoint || body;
    const result = await testWebhookEndpoint(endpoint, env);
    await addLog(env, request, 'WEBHOOK_TEST', `${result.success ? '测试成功' : '测试失败'}：${endpoint.name || endpoint.url || 'Webhook'}`);
    return jsonResponse(result, result.success ? 200 : 502);
  }
  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}

export async function handleAdminWebhookDeliveries(env) {
  try {
    const rows = await env.D1.prepare('SELECT * FROM webhook_deliveries ORDER BY created_at DESC, id DESC LIMIT 20').all();
    return jsonResponse({ items: rows.results || [] });
  } catch (_) {
    return jsonResponse({ items: [] });
  }
}

export async function handleHiddenSettings(env, request, method, url, hiddenPaths) {
  if (method === 'GET') return jsonResponse({ list: hiddenPaths.map(p => ({ path: p })) });
  if (method === 'POST') {
    const targetPath = normalizeHiddenPath((await request.json()).targetPath);
    await env.D1.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind(targetPath).run();
    await addLog(env, request, 'HIDE', `隐藏路径 ${targetPath}`);
    return jsonResponse({ success: true });
  }
  if (method === 'DELETE') {
    const targetPath = normalizeHiddenPath(url.searchParams.get('path'));
    await env.D1.prepare('DELETE FROM settings WHERE key = ?').bind(targetPath).run();
    await addLog(env, request, 'UNHIDE', `取消隐藏路径 ${targetPath}`);
    return jsonResponse({ success: true });
  }
  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}
