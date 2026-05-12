import { jsonResponse, normalizeHiddenPath, formatBytes, isReservedKey, listR2Objects } from './common.js';
import { getIndexedStats, indexedFileCount, indexedFileKind, rebuildFileIndex, syncFileIndexFromR2 } from './file-index.js';
import { mapWithConcurrency } from './r2-tree.js';

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
  const totalRes = await env.D1.prepare('SELECT COUNT(*) as count FROM logs').first();
  const logs = await env.D1.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?').bind(size, (page - 1) * size).all();
  return jsonResponse({ logs: logs.results, totalPages: Math.ceil((totalRes?.count || 0) / size), currentPage: page });
}

export async function handleAdminStats(env) {
  if (await indexedFileCount(env)) {
    const indexed = await getIndexedStats(env);
    if (indexed) return jsonResponse({ ...indexed, ...(await adminDbStats(env)) });
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
  } catch (_) {}
  try {
    const logCount = await env.D1.prepare('SELECT COUNT(*) as count FROM logs').first();
    logs = { count: Number(logCount?.count || 0) };
  } catch (_) {}
  return { trash, logs };
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

export async function handleAdminHealth(env) {
  const [db, r2] = await Promise.all([checkDb(env), checkR2(env)]);
  const envStatus = {
    adminUsername: Boolean(env.ADMIN_USERNAME),
    adminPassword: Boolean(env.ADMIN_PASSWORD),
    allowGuestConfigured: Object.prototype.hasOwnProperty.call(env, 'ALLOW_GUEST'),
    guestEnabled: env.ALLOW_GUEST === 'true',
  };
  const ok = db.ok && r2.ok && envStatus.adminUsername && envStatus.adminPassword;

  return jsonResponse({
    ok,
    db,
    r2,
    env: envStatus,
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
  const [indexCount, accessAttemptCount, trashCount, logsCount, thumbs] = await Promise.all([
    indexedFileCount(env),
    countRows(env, 'path_access_attempts'),
    countRows(env, 'trash'),
    countRows(env, 'logs'),
    listR2Objects(env.R2, { prefix: '.thumbs/' }, { maxObjects: 1 }).catch(() => ({ objects: [], truncated: false })),
  ]);
  return jsonResponse({
    indexCount,
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
    return jsonResponse({ success: true, action, ...result });
  }
  if (action === 'cleanup-access-attempts') {
    let deleted = 0;
    try {
      const row = await env.D1.prepare('SELECT COUNT(*) as count FROM path_access_attempts').first();
      deleted = Number(row?.count || 0);
      await env.D1.prepare('DELETE FROM path_access_attempts').run();
    } catch (_) {}
    return jsonResponse({ success: true, action, deleted });
  }
  if (action === 'cleanup-thumbnails') {
    const result = await deletePrefix(env, '.thumbs/');
    return jsonResponse({ success: true, action, ...result });
  }
  return jsonResponse({ success: false, message: 'Invalid maintenance action' }, 400);
}

export async function handleHiddenSettings(env, request, method, url, hiddenPaths) {
  if (method === 'GET') return jsonResponse({ list: hiddenPaths.map(p => ({ path: p })) });
  if (method === 'POST') {
    const targetPath = normalizeHiddenPath((await request.json()).targetPath);
    await env.D1.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind(targetPath).run();
    return jsonResponse({ success: true });
  }
  if (method === 'DELETE') {
    const targetPath = normalizeHiddenPath(url.searchParams.get('path'));
    await env.D1.prepare('DELETE FROM settings WHERE key = ?').bind(targetPath).run();
    return jsonResponse({ success: true });
  }
  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}
