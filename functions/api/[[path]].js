const jsonResponse = (data, status = 200, headers = {}) => 
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function createJWT(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '');
  const data = `${header}.${encodedPayload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${encodedSignature}`;
}

async function verifyAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
  
  if (!token) {
    // 默认访客模式逻辑：如果没设 ALLOW_GUEST 或设为 true，则允许访客。
    // 如果你确定要默认关闭，请将下方改为 env.ALLOW_GUEST === "true"
    const isGuestAllowed = (env.ALLOW_GUEST === "true" || env.ALLOW_GUEST === undefined);
    return isGuestAllowed ? { role: 'guest' } : null;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch (e) {
    return (env.ALLOW_GUEST === "true" || env.ALLOW_GUEST === undefined) ? { role: 'guest' } : null;
  }
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
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  // 1. 登录与登出
  if (path === '/api/login' && method === 'POST') {
    const { username, password } = await request.json();
    const now = Date.now();
    const attempt = await env.DB.prepare("SELECT * FROM login_attempts WHERE ip = ?").bind(ip).first();
    if (attempt && attempt.attempts >= 5 && (now - attempt.last_attempt < 600000)) return jsonResponse({ success: false, message: '尝试过多' }, 429);
    
    if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
      await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
      const token = await createJWT({ role: 'admin' }, env.ADMIN_PASSWORD);
      return jsonResponse({ success: true }, 200, { 'Set-Cookie': `token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400` });
    } else {
      await env.DB.prepare("INSERT INTO login_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET attempts = attempts + 1, last_attempt = ?").bind(ip, now, now).run();
      return jsonResponse({ success: false, message: '错误' }, 401);
    }
  }

  if (path === '/api/logout') {
    return jsonResponse({ success: true }, 200, { 'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' });
  }

  // 2. 鉴权
  const auth = await verifyAuth(request, env);
  if (!auth) return jsonResponse({ success: false, message: 'Private Mode' }, 401);

  // 3. 角色接口
  if (path === '/api/auth/role') return jsonResponse({ role: auth.role });

  // 4. 搜索接口
  if (path === '/api/search') {
    const query = url.searchParams.get('q')?.toLowerCase();
    const scope = url.searchParams.get('scope') || '/';
    if (!query) return jsonResponse({ files: [] });
    const hiddenRes = await env.DB.prepare("SELECT key FROM settings").all();
    const hiddenPaths = hiddenRes.results.map(r => r.key);
    let prefix = scope.startsWith('/') ? scope.slice(1) : scope;
    if (prefix && !prefix.endsWith('/')) prefix += '/';
    const listed = await env.R2_BUCKET.list({ prefix }); 
    const matches = listed.objects.map(o => ({
        name: o.key.split('/').pop(), path: '/' + o.key, fullKey: o.key,
        sizeFormatted: (o.size/1024/1024).toFixed(2)+' MB', rawSize: o.size, time: o.uploaded.getTime()
    })).filter(f => {
        const nameMatch = f.name.toLowerCase().includes(query);
        const isNotHidden = auth.role === 'admin' || !hiddenPaths.some(hp => f.fullKey === hp || f.fullKey.startsWith(hp + '/'));
        return nameMatch && f.name !== '' && f.name !== '.folder' && isNotHidden;
    });
    return jsonResponse({ files: matches });
  }

  // 5. 管理后台接口 (仅管理员)
  if (path.startsWith('/api/admin/')) {
    if (auth.role !== 'admin') return jsonResponse({ success: false }, 403);
    if (path === '/api/admin/logs') {
      const { results } = await env.DB.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all();
      return jsonResponse({ success: true, logs: results });
    }
    if (path === '/api/admin/settings/hidden') {
      if (method === 'GET') {
        const { results } = await env.DB.prepare("SELECT key as path FROM settings").all();
        return jsonResponse({ success: true, list: results });
      }
      if (method === 'POST') {
        const { targetPath } = await request.json();
        await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind(targetPath).run();
        return jsonResponse({ success: true });
      }
      if (method === 'DELETE') {
        const targetPath = url.searchParams.get('path');
        await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(targetPath).run();
        return jsonResponse({ success: true });
      }
    }
  }

  // 6. 路径解析
  let r2Path = "";
  if (path.startsWith('/api/files/')) r2Path = decodeURIComponent(path.slice(11));
  else if (path.startsWith('/api/download/')) r2Path = decodeURIComponent(path.slice(14));
  else if (path.startsWith('/api/preview/')) r2Path = decodeURIComponent(path.slice(13));
  else if (path.startsWith('/api/mkdir/')) r2Path = decodeURIComponent(path.slice(11));

  // 7. 隐私拦截
  const hiddenRes = await env.DB.prepare("SELECT key FROM settings").all();
  const hiddenPaths = hiddenRes.results.map(r => r.key);
  const isTargetHidden = hiddenPaths.some(hp => r2Path === hp || r2Path.startsWith(hp + '/'));
  if (isTargetHidden && auth.role !== 'admin') return jsonResponse({ success: false, message: 'Forbidden' }, 403);

  // 8. 列表获取
  if (path.startsWith('/api/files') && method === 'GET') {
    let prefix = r2Path; if (prefix && !prefix.endsWith('/')) prefix += '/';
    const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
    const folders = (listed.delimitedPrefixes || []).map(p => {
        const fullKey = p.slice(0, -1);
        return { name: p.slice(prefix.length, -1), path: '/' + fullKey, fullKey, time: Date.now() };
    }).filter(f => auth.role === 'admin' || !hiddenPaths.includes(f.fullKey));
    const files = (listed.objects || []).map(o => ({
        name: o.key.split('/').pop(), path: '/' + o.key, fullKey: o.key,
        sizeFormatted: (o.size/1024/1024).toFixed(2)+' MB', rawSize: o.size, time: o.uploaded.getTime()
    })).filter(f => f.name !== '' && f.name !== '.folder' && (auth.role === 'admin' || !hiddenPaths.includes(f.fullKey)));
    return jsonResponse({ folders, files });
  }

  // 9. 写操作拦截 (仅管理员)
  const isWriteAction = ['POST', 'PUT', 'DELETE'].includes(method);
  if (isWriteAction && auth.role !== 'admin') return jsonResponse({ success: false }, 403);

  if (path.startsWith('/api/mkdir')) {
    const { folderName } = await request.json();
    let prefix = r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '';
    await env.R2_BUCKET.put(prefix + folderName + '/.folder', new Uint8Array(0));
    await addLog(env, request, 'MKDIR', prefix + folderName);
    return jsonResponse({ success: true });
  }
  if (path.startsWith('/api/files') && method === 'POST') {
    const formData = await request.formData(); const file = formData.get('file');
    let prefix = r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '';
    await env.R2_BUCKET.put(prefix + file.name, file.stream(), { httpMetadata: { contentType: file.type } });
    await addLog(env, request, 'UPLOAD', prefix + file.name);
    return jsonResponse({ success: true });
  }
  if (path.startsWith('/api/files') && method === 'DELETE') {
    await env.R2_BUCKET.delete(r2Path); await addLog(env, request, 'DELETE', r2Path);
    return jsonResponse({ success: true });
  }
  if (path.startsWith('/api/files') && method === 'PUT') {
    const { newName } = await request.json();
    const source = await env.R2_BUCKET.get(r2Path);
    const dir = r2Path.substring(0, r2Path.lastIndexOf('/') + 1);
    await env.R2_BUCKET.put(dir + newName, source.body, { httpMetadata: source.httpMetadata });
    await env.R2_BUCKET.delete(r2Path);
    await addLog(env, request, 'RENAME', `${r2Path} -> ${newName}`);
    return jsonResponse({ success: true });
  }

  // 10. 下载与预览
  if (path.startsWith('/api/download') || path.startsWith('/api/preview')) {
    const obj = await env.R2_BUCKET.get(r2Path);
    if (!obj) return new Response('Not Found', { status: 404 });
    const isDownload = path.startsWith('/api/download');
    return new Response(obj.body, { headers: { 
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': isDownload ? `attachment; filename="${encodeURIComponent(r2Path.split('/').pop())}"` : 'inline'
    }});
  }

  return jsonResponse({ message: 'Not Found' }, 404);
}
