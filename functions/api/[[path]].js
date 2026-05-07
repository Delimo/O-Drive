const jsonResponse = (data, status = 200, headers = {}) => 
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function verifyAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
  const isGuestMode = (env.ALLOW_GUEST === "true" || env.ALLOW_GUEST === undefined);
  if (!token) return isGuestMode ? { role: 'guest' } : null;
  try { return JSON.parse(atob(token.split('.')[1])); } catch (e) { return isGuestMode ? { role: 'guest' } : null; }
}

async function addLog(env, request, action, details) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try { await env.DB.prepare("INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)").bind(action, details, ip).run(); } catch (e) {}
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 1. 基础接口 (登录/登出/角色)
  if (path === '/api/login' && method === 'POST') {
    const { username, password } = await request.json();
    if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
      const payload = btoa(JSON.stringify({ role: 'admin' })).replace(/=/g, '');
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
      const signature = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      return jsonResponse({ success: true }, 200, { 'Set-Cookie': `token=${header}.${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400` });
    }
    return jsonResponse({ success: false }, 401);
  }
  if (path === '/api/logout') return jsonResponse({ success: true }, 200, { 'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' });

  const auth = await verifyAuth(request, env);
  if (!auth) return jsonResponse({ success: false }, 401);
  if (path === '/api/auth/role') return jsonResponse({ role: auth.role });

  // 2. 批量操作与粘贴逻辑 (仅限管理员)
  if (['POST', 'PUT', 'DELETE'].includes(method) && auth.role !== 'admin') return jsonResponse({ success: false }, 403);

  // 批量删除
  if (path === '/api/batch-delete' && method === 'POST') {
    const { paths } = await request.json();
    for (const p of paths) {
      // 如果是目录，需要删除目录下所有文件
      const listed = await env.R2_BUCKET.list({ prefix: p + '/' });
      for (const obj of listed.objects) { await env.R2_BUCKET.delete(obj.key); }
      await env.R2_BUCKET.delete(p);
    }
    await addLog(env, request, 'BATCH_DELETE', paths.join(', '));
    return jsonResponse({ success: true });
  }

  // 粘贴 (移动或复制)
  if (path === '/api/paste' && method === 'POST') {
    const { action, paths, targetDir } = await request.json();
    const destPrefix = targetDir === '/' ? '' : (targetDir.endsWith('/') ? targetDir : targetDir + '/');

    for (const srcPath of paths) {
      const fileName = srcPath.split('/').pop();
      const destPath = destPrefix + fileName;

      // 处理文件夹递归移动/复制
      const listed = await env.R2_BUCKET.list({ prefix: srcPath + '/' });
      const objectsToProcess = [...listed.objects];
      // 也要检查这个路径本身是否是一个文件（或者是占位符）
      const self = await env.R2_BUCKET.head(srcPath);
      if (self) {
          await env.R2_BUCKET.put(destPath, (await env.R2_BUCKET.get(srcPath)).body);
          if (action === 'move') await env.R2_BUCKET.delete(srcPath);
      }

      for (const obj of objectsToProcess) {
        const subRelativePath = obj.key.slice(srcPath.length);
        const subDestPath = destPath + subRelativePath;
        const sourceObj = await env.R2_BUCKET.get(obj.key);
        await env.R2_BUCKET.put(subDestPath, sourceObj.body);
        if (action === 'move') await env.R2_BUCKET.delete(obj.key);
      }
    }
    await addLog(env, request, action.toUpperCase(), `From ${paths[0]} to ${targetDir}`);
    return jsonResponse({ success: true });
  }

  // 3. 原有文件操作逻辑精简
  let r2Path = decodeURIComponent(path.split('/').slice(3).join('/'));

  if (path.startsWith('/api/files') && method === 'GET') {
    let prefix = r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '';
    const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
    const folders = (listed.delimitedPrefixes || []).map(p => ({ name: p.slice(prefix.length, -1), path: '/' + p.slice(0, -1), fullKey: p.slice(0, -1) }));
    const files = (listed.objects || []).map(o => ({ name: o.key.slice(prefix.length), path: '/' + o.key, fullKey: o.key, sizeFormatted: (o.size/1024/1024).toFixed(2)+' MB', rawSize: o.size, time: o.uploaded.getTime() })).filter(f => f.name !== '' && f.name !== '.folder');
    return jsonResponse({ folders, files });
  }

  if (path.startsWith('/api/mkdir')) {
    const { folderName } = await request.json();
    const key = (r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '') + folderName + '/.folder';
    await env.R2_BUCKET.put(key, new Uint8Array(0));
    return jsonResponse({ success: true });
  }

  if (path.startsWith('/api/files') && method === 'PUT') {
    const { newName } = await request.json();
    const source = await env.R2_BUCKET.get(r2Path);
    const newKey = r2Path.substring(0, r2Path.lastIndexOf('/') + 1) + newName;
    await env.R2_BUCKET.put(newKey, source.body); await env.R2_BUCKET.delete(r2Path);
    return jsonResponse({ success: true });
  }

  if (path.startsWith('/api/download') || path.startsWith('/api/preview')) {
    const obj = await env.R2_BUCKET.get(r2Path);
    if (!obj) return new Response('404', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Content-Disposition': path.startsWith('/api/download') ? `attachment; filename="${encodeURIComponent(r2Path.split('/').pop())}"` : 'inline' }});
  }

  return jsonResponse({ message: 'Not Found' }, 404);
}
