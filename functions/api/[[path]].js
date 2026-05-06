// ================= 工具函数 =================
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
  if (!token) return null;
  try {
    const [header, payload, sig] = token.split('.');
    return JSON.parse(atob(payload));
  } catch (e) { return null; }
}

async function addLog(env, request, action, details) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  await env.DB.prepare("INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)").bind(action, details, ip).run();
}

// ================= 主处理程序 =================
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 1. 登录路由
  if (path === '/api/login' && method === 'POST') {
    const { password } = await request.json();
    if (password === env.ADMIN_PASSWORD) {
      const token = await createJWT({ role: 'admin' }, env.ADMIN_PASSWORD);
      return jsonResponse({ success: true }, 200, { 'Set-Cookie': `token=${token}; Path=/; HttpOnly; Max-Age=86400` });
    }
    return jsonResponse({ success: false, message: '密码错误' }, 401);
  }

  // 2. 退出
  if (path === '/api/logout') return jsonResponse({ success: true }, 200, { 'Set-Cookie': 'token=; Path=/; Max-Age=0' });

  // 3. 鉴权
  const auth = await verifyAuth(request, env);
  if (!auth) return jsonResponse({ success: false, message: '未授权' }, 401);

  // 4. 日志查询
  if (path === '/api/admin/logs') {
    const { results } = await env.DB.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all();
    return jsonResponse({ logs: results });
  }

  // 5. 文件操作
  const r2Path = path.replace('/api/files/', '').replace('/api/download/', '');
  const decodedPath = decodeURIComponent(r2Path);

  // 列出文件
  if (path.startsWith('/api/files') && method === 'GET') {
    const prefix = decodedPath === 'api/files' ? '' : (decodedPath.endsWith('/') ? decodedPath : decodedPath + '/');
    const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
    
    const folders = (listed.delimitedPrefixes || []).map(p => ({ name: p.split('/').slice(-2, -1)[0], path: '/' + p.slice(0, -1) }));
    const files = (listed.objects || []).map(o => ({
      name: o.key.split('/').pop(),
      path: '/' + o.key,
      sizeFormatted: (o.size / 1024 / 1024).toFixed(2) + ' MB'
    })).filter(f => f.name !== '');

    return jsonResponse({ folders, files });
  }

  // 上传
  if (path.startsWith('/api/files') && method === 'POST') {
    const formData = await request.formData();
    const file = formData.get('file');
    const key = (decodedPath ? decodedPath + '/' : '') + file.name;
    await env.R2_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await addLog(env, request, 'UPLOAD', key);
    return jsonResponse({ success: true });
  }

  // 删除
  if (path.startsWith('/api/files') && method === 'DELETE') {
    await env.R2_BUCKET.delete(decodedPath);
    await addLog(env, request, 'DELETE', decodedPath);
    return jsonResponse({ success: true });
  }

  // 重命名 (简易版: 复制并删除)
  if (path.startsWith('/api/files') && method === 'PUT') {
    const { newName } = await request.json();
    const obj = await env.R2_BUCKET.get(decodedPath);
    const newKey = decodedPath.substring(0, decodedPath.lastIndexOf('/') + 1) + newName;
    await env.R2_BUCKET.put(newKey, obj.body);
    await env.R2_BUCKET.delete(decodedPath);
    await addLog(env, request, 'RENAME', `${decodedPath} -> ${newName}`);
    return jsonResponse({ success: true });
  }

  // 下载
  if (path.startsWith('/api/download')) {
    const obj = await env.R2_BUCKET.get(decodedPath);
    if (!obj) return new Response('Not Found', { status: 404 });
    await addLog(env, request, 'DOWNLOAD', decodedPath);
    return new Response(obj.body, {
      headers: { 'Content-Type': obj.httpMetadata.contentType || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${encodeURIComponent(decodedPath.split('/').pop())}"` }
    });
  }

  return jsonResponse({ message: 'Not Found' }, 404);
}
