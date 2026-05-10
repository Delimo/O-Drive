import { jsonResponse, normalizeHiddenPath, formatBytes, isReservedKey, listR2Objects } from './common.js';

function fileKind(key) {
  const ext = String(key || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'audio';
  if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log', 'yml', 'yaml'].includes(ext)) return 'text';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['exe', 'msi', 'app', 'deb', 'dmg'].includes(ext)) return 'exe';
  return 'other';
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
  const totalRes = await env.DB.prepare('SELECT COUNT(*) as count FROM logs').first();
  const logs = await env.DB.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?').bind(size, (page - 1) * size).all();
  return jsonResponse({ logs: logs.results, totalPages: Math.ceil((totalRes?.count || 0) / size), currentPage: page });
}

export async function handleAdminStats(env) {
  const listed = await listR2Objects(env.R2_BUCKET, {}, { maxObjects: 20000 });
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

  let trash = { count: 0, size: 0, sizeFormatted: '0 B' };
  let logs = { count: 0 };
  try {
    const trashCount = await env.DB.prepare('SELECT COUNT(*) as count FROM trash').first();
    const trashRows = await env.DB.prepare('SELECT * FROM trash ORDER BY trashed_at DESC').all();
    const size = (trashRows.results || []).reduce((sum, row) => sum + Number(row.size || 0), 0);
    trash = { count: Number(trashCount?.count || 0), size, sizeFormatted: formatBytes(size) };
  } catch (_) {}
  try {
    const logCount = await env.DB.prepare('SELECT COUNT(*) as count FROM logs').first();
    logs = { count: Number(logCount?.count || 0) };
  } catch (_) {}

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
    trash,
    logs,
  });
}

export async function handleHiddenSettings(env, request, method, url, hiddenPaths) {
  if (method === 'GET') return jsonResponse({ list: hiddenPaths.map(p => ({ path: p })) });
  if (method === 'POST') {
    const targetPath = normalizeHiddenPath((await request.json()).targetPath);
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind(targetPath).run();
    return jsonResponse({ success: true });
  }
  if (method === 'DELETE') {
    const targetPath = normalizeHiddenPath(url.searchParams.get('path'));
    await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(targetPath).run();
    return jsonResponse({ success: true });
  }
  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}
