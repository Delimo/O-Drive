import { addLog, jsonResponse, normalizeHiddenPath, formatBytes, isReservedKey, listR2Objects, recordSystemWarning } from './common.js';
import { fileIndexStatus, getIndexedStats, indexedFileCount, indexedFileKind, syncFileIndexFromR2 } from './file-index.js';
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
    if (indexed) {
      const dbStats = await adminDbStats(env);
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
  }
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
    const warnings = await env.D1.prepare('SELECT COUNT(*) as count FROM system_warnings').first();
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
