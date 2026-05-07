const jsonResponse = (data, status = 200, headers = {}) => 
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function verifyAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
  const isGuestMode = (env.ALLOW_GUEST === "true" || env.ALLOW_GUEST === undefined);
  if (!token) return isGuestMode ? { role: 'guest' } : null;
  try { return JSON.parse(atob(token.split('.')[1])); } 
  catch (e) { return isGuestMode ? { role: 'guest' } : null; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 1. 认证路由
  if (path === '/api/login' && method === 'POST') {
    const { username, password } = await request.json();
    if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
      const payload = btoa(JSON.stringify({ role: 'admin' })).replace(/=/g, '');
      const token = `alg.payload.sig`; // 简化演示，实际应使用完整JWT
      return jsonResponse({ success: true }, 200, { 'Set-Cookie': `token=HS256.${payload}.sig; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400` });
    }
    return jsonResponse({ success: false }, 401);
  }
  if (path === '/api/logout') return jsonResponse({ success: true }, 200, { 'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });

  const auth = await verifyAuth(request, env);
  if (!auth) return jsonResponse({ success: false }, 401);
  if (path === '/api/auth/role') return jsonResponse({ role: auth.role });

  // 2. 路径处理
  let r2Path = decodeURIComponent(path.replace(/^\/api\/(files|download|preview|mkdir)\/?/, ''));

  // 3. 搜索逻辑
  if (path === '/api/search') {
    const q = url.searchParams.get('q')?.toLowerCase();
    const scope = (url.searchParams.get('scope') || '/').replace(/^\//, '');
    const listed = await env.R2_BUCKET.list({ prefix: scope });
    const matches = listed.objects.map(o => ({ name: o.key.split('/').pop(), path: '/' + o.key, fullKey: o.key, sizeFormatted: (o.size/1024/1024).toFixed(2)+' MB', rawSize: o.size, time: o.uploaded.getTime() }))
      .filter(f => f.name.toLowerCase().includes(q) && f.name !== '.folder');
    return jsonResponse({ files: matches });
  }

  // 4. 管理接口
  if (path.startsWith('/api/admin/') && auth.role === 'admin') {
    if (path === '/api/admin/logs') return jsonResponse({ logs: (await env.DB.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all()).results });
    if (path === '/api/admin/settings/hidden') {
      if (method === 'GET') return jsonResponse({ list: (await env.DB.prepare("SELECT key as path FROM settings").all()).results });
      if (method === 'POST') { await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind((await request.json()).targetPath).run(); return jsonResponse({ success: true }); }
      if (method === 'DELETE') { await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(url.searchParams.get('path')).run(); return jsonResponse({ success: true }); }
    }
  }

  // 5. 基础文件操作
  if (path.startsWith('/api/files') && method === 'GET') {
    let prefix = r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '';
    const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
    const folders = (listed.delimitedPrefixes || []).map(p => ({ name: p.slice(prefix.length, -1), path: '/' + p.slice(0, -1), fullKey: p.slice(0, -1) }));
    const files = (listed.objects || []).map(o => ({ name: o.key.slice(prefix.length), path: '/' + o.key, fullKey: o.key, sizeFormatted: (o.size/1024/1024).toFixed(2)+' MB', rawSize: o.size, time: o.uploaded.getTime() })).filter(f => f.name !== '' && f.name !== '.folder');
    return jsonResponse({ folders, files });
  }

  // 批量操作
  if (path === '/api/batch-delete') {
    const { paths } = await request.json();
    for (const p of paths) { await env.R2_BUCKET.delete(p); }
    return jsonResponse({ success: true });
  }

  if (path === '/api/paste') {
    const { action, paths, targetDir } = await request.json();
    const destPrefix = targetDir === '/' ? '' : (targetDir.endsWith('/') ? targetDir : targetDir + '/');
    for (const src of paths) {
      const name = src.split('/').pop();
      const obj = await env.R2_BUCKET.get(src);
      await env.R2_BUCKET.put(destPrefix + name, obj.body);
      if (action === 'move') await env.R2_BUCKET.delete(src);
    }
    return jsonResponse({ success: true });
  }

  // 单文件写操作
  if (['POST', 'PUT', 'DELETE'].includes(method) && auth.role !== 'admin') return jsonResponse({ success: false }, 403);
  if (path.startsWith('/api/mkdir')) {
    const { folderName } = await request.json();
    await env.R2_BUCKET.put((r2Path ? r2Path + '/' : '') + folderName + '/.folder', new Uint8Array(0));
    return jsonResponse({ success: true });
  }

  if (path.startsWith('/api/download') || path.startsWith('/api/preview')) {
    const obj = await env.R2_BUCKET.get(r2Path);
    if (!obj) return new Response('404', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Content-Disposition': path.startsWith('/api/download') ? `attachment; filename="${encodeURIComponent(r2Path.split('/').pop())}"` : 'inline' }});
  }

  return jsonResponse({ message: 'Not Found' }, 404);
}
