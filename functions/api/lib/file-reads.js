import { jsonResponse, formatBytes, isHiddenKey, isTrashKey } from './common.js';

function mapEntry(o) {
  return {
    name: o.key.split('/').pop(),
    path: '/' + o.key,
    fullKey: o.key,
    sizeFormatted: formatBytes(o.size),
    rawSize: o.size,
    time: o.uploaded.getTime(),
  };
}

export async function handleSearch(env, request, url, hiddenPaths, auth) {
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const scope = (url.searchParams.get('scope') || '/').replace(/^\//, '');
  const listed = await env.R2_BUCKET.list({ prefix: scope });
  const matches = listed.objects
    .map(mapEntry)
    .filter(f => f.name.toLowerCase().includes(q) && f.name !== '.folder' && !isTrashKey(f.fullKey) && (auth.role === 'admin' || !isHiddenKey(f.fullKey, hiddenPaths)));
  return jsonResponse({ files: matches });
}

export async function handleListFiles(env, hiddenPaths, auth, r2Key) {
  const prefix = r2Key ? r2Key + '/' : '';
  const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
  const folders = (listed.delimitedPrefixes || [])
    .map(p => {
      const fullKey = p.slice(0, -1);
      return { name: fullKey.split('/').slice(-1)[0], path: '/' + fullKey, fullKey };
    })
    .filter(f => f.fullKey && f.name && f.name !== '.folder')
    .filter(f => !isTrashKey(f.fullKey))
    .filter(f => auth.role === 'admin' || !isHiddenKey(f.fullKey, hiddenPaths));
  const files = (listed.objects || [])
    .map(mapEntry)
    .filter(f => f.name !== '' && f.name !== '.folder' && !isTrashKey(f.fullKey) && (auth.role === 'admin' || !isHiddenKey(f.fullKey, hiddenPaths)));
  return jsonResponse({ folders, files });
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
  const meta = wantsRange ? await env.R2_BUCKET.head(r2Key) : null;
  const obj = wantsRange ? meta : await env.R2_BUCKET.get(r2Key);
  if (!obj) return new Response('404', { status: 404 });

  const headers = new Headers();
  if (typeof obj.writeHttpMetadata === 'function') obj.writeHttpMetadata(headers);
  if (!headers.get('Content-Type')) headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Disposition', makeDisposition(path, r2Key.split('/').pop() || r2Key));

  if (!wantsRange) {
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

  const ranged = await env.R2_BUCKET.get(r2Key, { range: { offset, length } });
  if (!ranged) return new Response('404', { status: 404 });

  headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${size}`);
  headers.set('Content-Length', String(length));
  return new Response(ranged.body, { status: 206, headers });
}
