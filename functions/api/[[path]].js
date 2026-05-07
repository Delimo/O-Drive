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

  let r2Path = decodeURIComponent(path.split('/').slice(3).join('/'));
  const hiddenRes = await env.DB.prepare("SELECT key FROM settings").all();
  const hiddenPaths = hiddenRes.results.map(r => r.key);

  const isHidden = hiddenPaths.some(hp => r2Path === hp || r2Path.startsWith(hp + '/'));
  if (isHidden && auth.role !== 'admin') return jsonResponse({ success: false }, 403);

  // 1. 搜索接口
  if (path === '/api/search') {
    const q = url.searchParams.get('q')?.toLowerCase();
    const scope = (url.searchParams.get('scope') || '/').slice(1);
    const listed = await env.R2_BUCKET.list({ prefix: scope });
    const matches = listed.objects.map(o => ({ name: o.key.split('/').pop(), path: '/' + o.key, fullKey: o.key, sizeFormatted: (o.size/1024/1024).toFixed(2)+' MB', rawSize: o.size, time: o.uploaded.getTime() }))
      .filter(f => f.name.toLowerCase().includes(q) && f.name !== '.folder' && (auth.role === 'admin' || !hiddenPaths.some(hp => f.fullKey.startsWith(hp))));
    return jsonResponse({ files: matches });
  }

  // 2. 后台管理
  if (path.startsWith('/api/admin/') && auth.role === 'admin') {
    if (path === '/api/admin/logs') return jsonResponse({ logs: (await env.DB.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all()).results });
    if (path === '/api/admin/settings/hidden') {
      if (method === 'GET') return jsonResponse({ list: (await env.DB.prepare("SELECT key as path FROM settings").all()).results });
      if (method === 'POST') { await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind((await request.json()).targetPath).run(); return jsonResponse({ success: true }); }
      if (method === 'DELETE') { await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(url.searchParams.get('path')).run(); return jsonResponse({ success: true }); }
    }
  }

  // 3. 文件列表
  if (path.startsWith('/api/files') && method === 'GET') {
    let prefix = r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '';
    const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
    const folders = (listed.delimitedPrefixes || []).map(p => ({ name: p.slice(prefix.length, -1), path: '/' + p.slice(0, -1), fullKey: p.slice(0, -1) })).filter(f => auth.role === 'admin' || !hiddenPaths.includes(f.fullKey));
    const files = (listed.objects || []).map(o => ({ name: o.key.slice(prefix.length), path: '/' + o.key, fullKey: o.key, sizeFormatted: (o.size/1024/1024).toFixed(2)+' MB', rawSize: o.size, time: o.uploaded.getTime() })).filter(f => f.name !== '' && f.name !== '.folder' && (auth.role === 'admin' || !hiddenPaths.includes(f.fullKey)));
    return jsonResponse({ folders, files });
  }

  // 4. 管理员操作拦截
  if (['POST', 'PUT', 'DELETE'].includes(method) && auth.role !== 'admin') return jsonResponse({ success: false }, 403);

  // 批量删除
  if (path === '/api/batch-delete' && method === 'POST') {
    const { paths } = await request.json();
    for (const p of paths) {
      const listed = await env.R2_BUCKET.list({ prefix: p + '/' });
      for (const obj of listed.objects) { await env.R2_BUCKET.delete(obj.key); }
      await env.R2_BUCKET.delete(p);
    }
    return jsonResponse({ success: true });
  }

  // 粘贴 (移动/复制)
  if (path === '/api/paste' && method === 'POST') {
    const { action, paths, targetDir } = await request.json();
    const destPrefix = targetDir === '/' ? '' : (targetDir.endsWith('/') ? targetDir : targetDir + '/');
    for (const srcPath of paths) {
      const fileName = srcPath.split('/').pop();
      const destPath = destPrefix + fileName;
      const listed = await env.R2_BUCKET.list({ prefix: srcPath + '/' });
      const self = await env.R2_BUCKET.get(srcPath);
      if (self) { await env.R2_BUCKET.put(destPath, self.body); if (action === 'move') await env.R2_BUCKET.delete(srcPath); }
      for (const obj of listed.objects) {
        const subDest = destPath + obj.key.slice(srcPath.length);
        await env.R2_BUCKET.put(subDest, (await env.R2_BUCKET.get(obj.key)).body);
        if (action === 'move') await env.R2_BUCKET.delete(obj.key);
      }
    }
    return jsonResponse({ success: true });
  }

  // 新建文件夹
  if (path.startsWith('/api/mkdir')) {
    const { folderName } = await request.json();
    const key = (r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '') + folderName + '/.folder';
    await env.R2_BUCKET.put(key, new Uint8Array(0));
    return jsonResponse({ success: true });
  }

  // 上传
  if (path.startsWith('/api/files') && method === 'POST') {
    const file = (await request.formData()).get('file');
    const key = (r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '') + file.name;
    await env.R2_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return jsonResponse({ success: true });
  }

  // 单个删除
  if (path.startsWith('/api/files') && method === 'DELETE') {
      const listed = await env.R2_BUCKET.list({ prefix: r2Path + '/' });
      for (const obj of listed.objects) { await env.R2_BUCKET.delete(obj.key); }
      await env.R2_BUCKET.delete(r2Path);
      return jsonResponse({ success: true });
  }

  // --- 重命名核心修复逻辑 ---
  if (path.startsWith('/api/files') && method === 'PUT') {
    const { newName } = await request.json();
    const oldKey = r2Path;
    const parentDir = oldKey.substring(0, oldKey.lastIndexOf('/') + 1);
    const newKey = parentDir + newName;

    // 1. 同步更新 D1 隐藏名单 (如果该路径在隐藏名单中)
    await env.DB.prepare("UPDATE settings SET key = ? WHERE key = ?").bind(newKey, oldKey).run();

    // 2. 检查是否是文件夹 (通过检查 .folder 占位符或是否存在子前缀)
    const objectsInFolder = await env.R2_BUCKET.list({ prefix: oldKey + '/' });
    const isFolder = objectsInFolder.objects.length > 0 || oldKey.endsWith('.folder');

    if (isFolder || objectsInFolder.objects.length > 0) {
        // 递归处理文件夹内所有内容
        for (const obj of objectsInFolder.objects) {
            const subRelativePath = obj.key.slice(oldKey.length);
            const subDestPath = newKey + subRelativePath;
            const sourceObj = await env.R2_BUCKET.get(obj.key);
            await env.R2_BUCKET.put(subDestPath, sourceObj.body, { httpMetadata: sourceObj.httpMetadata });
            await env.R2_BUCKET.delete(obj.key);
        }
        // 处理文件夹占位符本身（如果有）
        const folderMarker = await env.R2_BUCKET.get(oldKey + '/.folder');
        if (folderMarker) {
            await env.R2_BUCKET.put(newKey + '/.folder', new Uint8Array(0));
            await env.R2_BUCKET.delete(oldKey + '/.folder');
        }
    } else {
        // 普通文件重命名
        const source = await env.R2_BUCKET.get(oldKey);
        if (source) {
            await env.R2_BUCKET.put(newKey, source.body, { httpMetadata: source.httpMetadata });
            await env.R2_BUCKET.delete(oldKey);
        }
    }

    await addLog(env, request, 'RENAME', `${oldKey} -> ${newName}`);
    return jsonResponse({ success: true });
  }

  if (path.startsWith('/api/download') || path.startsWith('/api/preview')) {
    const obj = await env.R2_BUCKET.get(r2Path);
    if (!obj) return new Response('404', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Content-Disposition': path.startsWith('/api/download') ? `attachment; filename="${encodeURIComponent(r2Path.split('/').pop())}"` : 'inline' }});
  }

  return jsonResponse({ message: 'Not Found' }, 404);
}
