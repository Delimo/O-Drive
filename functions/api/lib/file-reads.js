import { jsonResponse, formatBytes, isHiddenKey, isReservedKey } from './common.js';
import { checkProtectedAccess, markProtection } from './protected-paths.js';
import { indexedFileKind, listIndexedDirectory, searchFileIndex } from './file-index.js';
import { loadStorageConfig, resolveExistingObjectLocation, resolveStorageIdForPath, storageGet, storageHead, storageList } from './storage.js';

function mapEntry(o) {
  return {
    name: o.key.split('/').pop(),
    path: '/' + o.key,
    fullKey: o.key,
    storageId: o.storageId || 'r2',
    sizeFormatted: formatBytes(o.size),
    rawSize: o.size,
    time: o.uploaded.getTime(),
  };
}

function cleanPath(path = '') {
  return String(path || '').replace(/^\/+|\/+$/g, '');
}

function virtualBindingFolders(bindings = [], currentKey = '') {
  const current = cleanPath(currentKey);
  const prefix = current ? `${current}/` : '';
  const names = new Set();
  for (const binding of bindings || []) {
    const path = cleanPath(binding.path);
    if (!path || (current && !path.startsWith(prefix))) continue;
    const rest = current ? path.slice(prefix.length) : path;
    if (!rest || rest.includes('/')) continue;
    names.add(rest);
  }
  return [...names].map(name => {
    const fullKey = current ? `${current}/${name}` : name;
    return { name, path: '/' + fullKey, fullKey, virtual: true };
  });
}

export async function handleSearch(env, request, url, hiddenPaths, auth, protectedPaths = []) {
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const scope = (url.searchParams.get('scope') || '/').replace(/^\//, '');
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || '50')));
  const scanLimit = Math.max(limit, Math.min(1000, Number(url.searchParams.get('scanLimit') || '1000')));
  const filters = parseSearchFilters(url);
  let cursor = url.searchParams.get('cursor') || undefined;
  const indexed = await searchFileIndex(env, { q, scope, limit, cursor, filters }, hiddenPaths, auth);
  if (indexed) {
    const files = await markProtection(indexed.files, request, env, auth, protectedPaths);
    return jsonResponse({ ...indexed, files });
  }
  const matches = [];
  let nextCursor = '';
  let scanned = 0;
  const storageId = await resolveStorageIdForPath(env, scope);

  do {
    const pageLimit = Math.max(1, Math.min(limit - matches.length, scanLimit - scanned));
    const listed = await storageList(env, storageId, { prefix: scope, cursor, limit: pageLimit }, { maxObjects: pageLimit });
    const objects = listed.objects || [];
    scanned += objects.length;
    const pageMatches = objects
      .map(obj => mapEntry({ ...obj, storageId }))
      .filter(f => f.name.toLowerCase().includes(q) && f.name !== '.folder' && !isReservedKey(f.fullKey) && matchesSearchFilters(f, filters) && (auth.role === 'admin' || !isHiddenKey(f.fullKey, hiddenPaths)));
    matches.push(...pageMatches);
    cursor = listed.truncated ? listed.cursor : undefined;
    nextCursor = cursor || '';
  } while (cursor && matches.length < limit && scanned < scanLimit);

  const visibleMatches = await markProtection(matches.slice(0, limit), request, env, auth, protectedPaths);
  return jsonResponse({ files: visibleMatches, nextCursor, scanned, scanLimitReached: Boolean(cursor && scanned >= scanLimit) });
}

function numberParam(url, name, scale = 1) {
  const raw = url.searchParams.get(name);
  if (raw == null || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value * scale : undefined;
}

function dateParam(url, name, endOfDay = false) {
  const raw = url.searchParams.get(name);
  if (!raw) return undefined;
  const date = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  const value = date.getTime();
  return Number.isFinite(value) ? value : undefined;
}

function parseSearchFilters(url) {
  const kind = String(url.searchParams.get('kind') || 'all');
  return {
    kind: ['all', 'file', 'image', 'video', 'audio', 'text', 'pdf', 'archive', 'exe', 'other'].includes(kind) ? kind : 'all',
    minSize: numberParam(url, 'minSize', 1024),
    maxSize: numberParam(url, 'maxSize', 1024),
    fromTime: dateParam(url, 'modifiedAfter'),
    toTime: dateParam(url, 'modifiedBefore', true),
  };
}

function matchesSearchFilters(file, filters = {}) {
  if (filters.kind && filters.kind !== 'all') {
    const kind = indexedFileKind(file.fullKey);
    if (filters.kind !== 'file' && kind !== filters.kind) return false;
  }
  const size = Number(file.rawSize || 0);
  if (Number.isFinite(filters.minSize) && size < filters.minSize) return false;
  if (Number.isFinite(filters.maxSize) && size > filters.maxSize) return false;
  const time = Number(file.time || 0);
  if (Number.isFinite(filters.fromTime) && time < filters.fromTime) return false;
  if (Number.isFinite(filters.toTime) && time > filters.toTime) return false;
  return true;
}

export async function handleListFiles(env, request, hiddenPaths, auth, r2Key, protectedPaths = []) {
  const access = await checkProtectedAccess(request, env, auth, protectedPaths, r2Key);
  if (!access.ok) {
    return jsonResponse({ success: false, code: 'password_required', path: access.rule.path, message: 'Password required' }, 403);
  }
  const prefix = r2Key ? r2Key + '/' : '';
  const storageId = await resolveStorageIdForPath(env, r2Key);
  const listed = await storageList(env, storageId, { prefix, delimiter: '/' });
  const config = await loadStorageConfig(env);
  const indexed = await listIndexedDirectory(env, r2Key);
  const folderMap = new Map();
  for (const folder of virtualBindingFolders(config.bindings, r2Key)) folderMap.set(folder.fullKey, folder);
  for (const folder of indexed.folders || []) folderMap.set(folder.fullKey, folder);
  for (const p of listed.delimitedPrefixes || []) {
    const fullKey = p.slice(0, -1);
    folderMap.set(fullKey, { name: fullKey.split('/').slice(-1)[0], path: '/' + fullKey, fullKey });
  }
  const folders = await markProtection([...folderMap.values()]
    .filter(f => f.fullKey && f.name && f.name !== '.folder')
    .filter(f => !isReservedKey(f.fullKey))
    .filter(f => auth.role === 'admin' || !isHiddenKey(f.fullKey, hiddenPaths)), request, env, auth, protectedPaths);
  const fileMap = new Map();
  for (const file of indexed.files || []) fileMap.set(file.fullKey, file);
  for (const obj of listed.objects || []) {
    const file = mapEntry({ ...obj, storageId });
    fileMap.set(file.fullKey, file);
  }
  const files = await markProtection([...fileMap.values()]
    .filter(f => f.name !== '' && f.name !== '.folder' && !isReservedKey(f.fullKey) && (auth.role === 'admin' || !isHiddenKey(f.fullKey, hiddenPaths))), request, env, auth, protectedPaths);
  return jsonResponse({ folders, files, storageId });
}

function parseByteRange(rangeHeader) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;
  const match = rangeHeader.slice(6).match(/^(\d*)-(\d*)$/);
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];
  if (!startStr && !endStr) return null;
  return { startStr, endStr };
}

function makeDisposition(path, filename) {
  return path.startsWith('/api/download/')
    ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    : 'inline';
}

export async function handleDownloadOrPreview(env, request, path, r2Key) {
  const rangeHeader = request.headers.get('Range');
  const parsedRange = parseByteRange(rangeHeader);
  const wantsRange = Boolean(parsedRange);
  const location = await resolveExistingObjectLocation(env, r2Key);
  const storageId = location.storageId;
  const objectKey = location.objectKey;
  const meta = wantsRange ? await storageHead(env, storageId, objectKey) : null;
  const obj = wantsRange ? meta : await storageGet(env, storageId, objectKey);
  if (!obj) return new Response('404', { status: 404 });

  const headers = new Headers();
  if (typeof obj.writeHttpMetadata === 'function') obj.writeHttpMetadata(headers);
  if (!headers.get('Content-Type')) headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Disposition', makeDisposition(path, r2Key.split('/').pop() || r2Key));

  if (!wantsRange) {
    const contentLength = Number(obj.size);
    if (Number.isFinite(contentLength) && contentLength > 0) headers.set('Content-Length', String(contentLength));
    return new Response(obj.body, { headers });
  }

  const size = Number(meta?.size ?? obj.size ?? 0);
  const { startStr, endStr } = parsedRange;
  let offset;
  let length;

  if (!startStr && endStr) {
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    offset = Math.max(size - suffix, 0);
    length = size - offset;
  } else {
    offset = Number(startStr);
    if (!Number.isFinite(offset) || offset < 0 || offset >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const requestedEnd = endStr ? Number(endStr) : size - 1;
    const end = Number.isFinite(requestedEnd) ? Math.min(requestedEnd, size - 1) : size - 1;
    if (end < offset) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    length = end - offset + 1;
  }

  const ranged = await storageGet(env, storageId, objectKey, { range: { offset, length } });
  if (!ranged) return new Response('404', { status: 404 });

  headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${size}`);
  headers.set('Content-Length', String(length));
  return new Response(ranged.body, { status: 206, headers });
}
