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

// 路径标准化：移除重复斜杠和前缀斜杠
function normalize(path) {
    return path.replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 1. 登录与鉴权
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
  if (path === '/api/logout') return jsonResponse({ success: true }, 200, { 'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });

  const auth = await verifyAuth(request, env);
  if (!auth) return jsonResponse({ success: false }, 401);
  if (path === '/api/auth/role') return jsonResponse({ role: auth.role });

  // 2. 核心路径解析
  let r2Path = normalize(decodeURIComponent(path.split('/').slice(3).join('/')));
  const hiddenRes = await env.DB.prepare("SELECT key FROM settings").all();
  const hiddenPaths = hiddenRes.results.map(r => r.key);

  // 隐私检查
  if (hiddenPaths.some(hp => r2Path === hp || r2Path.startsWith(hp + '/')) && auth.role !== 'admin') {
      return jsonResponse({ success: false }, 403);
  }

  // 3. API 逻辑
  if (path === '/api/search') {
    const q = url.searchParams.get('q')?.toLowerCase();
    const scope = normalize(url.searchParams.get('scope') || '');
    const listed = await env.R2_BUCKET.list({ prefix: scope });
    const matches = listed.objects.map(o => ({ name: o.key.split('/').pop(), path: '/' + o.key, fullKey: o.key, sizeFormatted: (o.size/1024/1024).toFixed(2)+' MB', rawSize: o.size, time: o.uploaded.getTime() }))
      .filter(f => f.name.toLowerCase().includes(q) && f.name !== '.folder' && (auth.role === 'admin' || !hiddenPaths.some(hp => f.fullKey.startsWith(hp))));
    return jsonResponse({ files: matches });
  }

  // 后台管理
  if (path.startsWith('/api/admin/') && auth.role === 'admin') {
    if (path === '/api/admin/logs') return jsonResponse({ logs: (await env.DB.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all()).results });
    if (path === '/api/admin/settings/hidden') {
      if (method === 'GET') return jsonResponse({ list: (await env.DB.prepare("SELECT key as path FROM settings").all()).results });
      if (method === 'POST') { await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind((await request.json()).targetPath).run(); return jsonResponse({ success: true }); }
      if (method === 'DELETE') { await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(url.searchParams.get('path')).run(); return jsonResponse({ success: true }); }
    }
  }

  // 列表显示
  if (path.startsWith('/api/files') && method === 'GET') {
    let prefix = r2Path ? r2Path + '/' : '';
    const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
    const folders = (listed.delimitedPrefixes || []).map(p => ({ name: p.split('/').slice(-2, -1)[0], path: '/' + p.slice(0, -1), fullKey: p.slice(0, -1) })).filter(f => auth.role === 'admin' || !hiddenPaths.includes(f.fullKey));
    const files = (listed.objects || []).map(o => ({ name: o.key.split('/').pop(), path: '/' + o.key, fullKey: o.key, sizeFormatted: (o.size/1024/1024).toFixed(2)+' MB', rawSize: o.size, time: o.uploaded.getTime() })).filter(f => f.name !== '' && f.name !== '.folder' && (auth.role === 'admin' || !hiddenPaths.includes(f.fullKey)));
    return jsonResponse({ folders, files });
  }

  // 4. 写操作 (仅管理员)
  if (['POST', 'PUT', 'DELETE'].includes(method) && auth.role !== 'admin') return jsonResponse({ success: false }, 403);

  // 上传逻辑修复
  if (path.startsWith('/api/files') && method === 'POST') {
      const file = (await request.formData()).get('file');
      const key = normalize((r2Path ? r2Path + '/' : '') + file.name);
      await env.R2_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      await addLog(env, request, 'UPLOAD', key);
      return jsonResponse({ success: true });
  }

  // 粘贴逻辑加固
  if (path === '/api/paste') {
    const { action, paths, targetDir } = await request.json();
    const destDir = normalize(targetDir);
    
    for (const src of paths) {
      const srcPath = normalize(src);
      const name = srcPath.split('/').pop();
      const destPath = normalize((destDir ? destDir + '/' : '') + name);

      // 递归处理子文件
      const listed = await env.R2_BUCKET.list({ prefix: srcPath + '/' });
      for (const obj of listed.objects) {
          const subRelative = obj.key.slice(srcPath.length);
          const subDest = normalize(destPath + subRelative);
          const sourceObj = await env.R2_BUCKET.get(obj.key);
          await env.R2_BUCKET.put(subDest, sourceObj.body, { httpMetadata: sourceObj.httpMetadata });
          if (action === 'move') await env.R2_BUCKET.delete(obj.key);
      }
      // 处理自身或占位符
      const self = await env.R2_BUCKET.get(srcPath);
      if (self) {
          await env.R2_BUCKET.put(destPath, self.body, { httpMetadata: self.httpMetadata });
          if (action === 'move') {
              await env.R2_BUCKET.delete(srcPath);
              await env.DB.prepare("UPDATE settings SET key = ? WHERE key = ?").bind(destPath, srcPath).run();
          }
      }
    }
    return jsonResponse({ success: true });
  }

  // 批量删除
  if (path === '/api/batch-delete') {
      const { paths } = await request.json();
      for (const p of paths) {
          const key = normalize(p);
          const listed = await env.R2_BUCKET.list({ prefix: key + '/' });
          for (const obj of listed.objects) await env.R2_BUCKET.delete(obj.key);
          await env.R2_BUCKET.delete(key);
      }
      return jsonResponse({ success: true });
  }

  // 新建文件夹
  if (path.startsWith('/api/mkdir')) {
      const { folderName } = await request.json();
      const key = normalize((r2Path ? r2Path + '/' : '') + folderName) + '/.folder';
      await env.R2_BUCKET.put(key, new Uint8Array(0));
      return jsonResponse({ success: true });
  }

  // 重命名
  if (path.startsWith('/api/files') && method === 'PUT') {
      const { newName } = await request.json();
      const oldKey = r2Path;
      const parentDir = oldKey.includes('/') ? oldKey.substring(0, oldKey.lastIndexOf('/') + 1) : '';
      const newKey = normalize(parentDir + newName);

      const listed = await env.R2_BUCKET.list({ prefix: oldKey + '/' });
      for (const obj of listed.objects) {
          const subDest = normalize(newKey + obj.key.slice(oldKey.length));
          const sourceObj = await env.R2_BUCKET.get(obj.key);
          await env.R2_BUCKET.put(subDest, sourceObj.body);
          await env.R2_BUCKET.delete(obj.key);
      }
      const self = await env.R2_BUCKET.get(oldKey);
      if (self) {
          await env.R2_BUCKET.put(newKey, self.body);
          await env.R2_BUCKET.delete(oldKey);
          await env.DB.prepare("UPDATE settings SET key = ? WHERE key = ?").bind(newKey, oldKey).run();
      }
      return jsonResponse({ success: true });
  }

  // 下载与预览
  if (path.startsWith('/api/download') || path.startsWith('/api/preview')) {
    const obj = await env.R2_BUCKET.get(r2Path);
    if (!obj) return new Response('404 Not Found', { status: 404 });
    return new Response(obj.body, { headers: { 
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': path.startsWith('/api/download') ? `attachment; filename="${encodeURIComponent(r2Path.split('/').pop())}"` : 'inline'
    }});
  }

  return jsonResponse({ message: 'Not Found' }, 404);
}
