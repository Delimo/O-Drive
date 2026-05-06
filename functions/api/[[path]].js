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
  if (!token) return { role: 'guest' }; // 无 Token 默认为访客
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch (e) { return { role: 'guest' }; }
}

async function addLog(env, request, action, details) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    await env.DB.prepare("INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)").bind(action, details, ip).run();
  } catch (e) {}
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 1. 登录与登出
  if (path === '/api/login' && method === 'POST') {
    const { password } = await request.json();
    if (password === env.ADMIN_PASSWORD) {
      const token = await createJWT({ role: 'admin' }, env.ADMIN_PASSWORD);
      return jsonResponse({ success: true }, 200, { 'Set-Cookie': `token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400` });
    }
    return jsonResponse({ success: false, message: '密码错误' }, 401);
  }
  if (path === '/api/logout') return jsonResponse({ success: true }, 200, { 'Set-Cookie': 'token=; Path=/; Max-Age=0' });

  // 2. 获取权限状态
  const auth = await verifyAuth(request, env);

  // 3. 权限控制：只有管理员能执行的操作
  const isAdminPath = path === '/api/admin/logs';
  const isWriteAction = ['POST', 'PUT', 'DELETE'].includes(method);
  
  if ((isAdminPath || (isWriteAction && path.startsWith('/api/'))) && auth.role !== 'admin') {
    // 排除登录接口自身
    if (path !== '/api/login') {
      return jsonResponse({ success: false, message: '需要管理员权限' }, 403);
    }
  }

  // 4. API 逻辑
  if (path === '/api/auth/role') return jsonResponse({ role: auth.role });

  if (path === '/api/admin/logs') {
    const { results } = await env.DB.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all();
    return jsonResponse({ success: true, logs: results });
  }

  let r2Path = "";
  if (path.startsWith('/api/files/')) r2Path = decodeURIComponent(path.slice(11));
  else if (path.startsWith('/api/download/')) r2Path = decodeURIComponent(path.slice(14));
  else if (path.startsWith('/api/preview/')) r2Path = decodeURIComponent(path.slice(13));
  else if (path.startsWith('/api/mkdir/')) r2Path = decodeURIComponent(path.slice(11));

  // 获取文件列表 (公开)
  if (path.startsWith('/api/files') && method === 'GET') {
    let prefix = r2Path;
    if (prefix && !prefix.endsWith('/')) prefix += '/';
    const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
    const folders = (listed.delimitedPrefixes || []).map(p => ({ name: p.slice(prefix.length, -1), path: '/' + p.slice(0, -1), time: Date.now() }));
    const files = (listed.objects || []).map(o => ({ name: o.key.slice(prefix.length), path: '/' + o.key, sizeFormatted: (o.size / 1024 / 1024).toFixed(2) + ' MB', rawSize: o.size, time: o.uploaded.getTime() })).filter(f => f.name !== '' && f.name !== '.folder');
    return jsonResponse({ folders, files });
  }

  // 以下操作上方已做拦截，只有管理员能进
  if (path.startsWith('/api/mkdir') && method === 'POST') {
    const { folderName } = await request.json();
    let prefix = r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '';
    await env.R2_BUCKET.put(prefix + folderName + '/.folder', new Uint8Array(0));
    await addLog(env, request, 'MKDIR', prefix + folderName);
    return jsonResponse({ success: true });
  }

  if (path.startsWith('/api/files') && method === 'POST') {
    const formData = await request.formData();
    const file = formData.get('file');
    let prefix = r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '';
    await env.R2_BUCKET.put(prefix + file.name, file.stream(), { httpMetadata: { contentType: file.type } });
    await addLog(env, request, 'UPLOAD', prefix + file.name);
    return jsonResponse({ success: true });
  }

  if (path.startsWith('/api/files') && method === 'DELETE') {
    await env.R2_BUCKET.delete(r2Path);
    await addLog(env, request, 'DELETE', r2Path);
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

  if (path.startsWith('/api/download')) {
    const obj = await env.R2_BUCKET.get(r2Path);
    if (!obj) return new Response('Not Found', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${encodeURIComponent(r2Path.split('/').pop())}"` } });
  }

  if (path.startsWith('/api/preview')) {
    const obj = await env.R2_BUCKET.get(r2Path);
    if (!obj) return new Response('Not Found', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });
  }

  return jsonResponse({ message: 'Not Found' }, 404);
}
