import { jsonResponse, formatBytes, isHiddenKey } from './common.js';

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
    .filter(f => f.name.toLowerCase().includes(q) && f.name !== '.folder' && (auth.role === 'admin' || !isHiddenKey(f.fullKey, hiddenPaths)));
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
    .filter(f => auth.role === 'admin' || !isHiddenKey(f.fullKey, hiddenPaths));
  const files = (listed.objects || [])
    .map(mapEntry)
    .filter(f => f.name !== '' && f.name !== '.folder' && (auth.role === 'admin' || !isHiddenKey(f.fullKey, hiddenPaths)));
  return jsonResponse({ folders, files });
}

export async function handleDownloadOrPreview(env, path, r2Key) {
  const obj = await env.R2_BUCKET.get(r2Key);
  if (!obj) return new Response('404', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': path.startsWith('/api/download/')
        ? `attachment; filename="${encodeURIComponent(r2Key.split('/').pop())}"`
        : 'inline',
    },
  });
}
