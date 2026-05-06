// ============================================================================
// 工具函数
// ============================================================================

const jsonResponse = (data, status = 200, headers = {}) => 
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// 创建 JWT Token
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

// 验证鉴权状态 (支持游客模式)
async function verifyAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
  
  if (!token) return env.ALLOW_GUEST === "true" ? { role: 'guest' } : null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch (e) {
    return env.ALLOW_GUEST === "true" ? { role: 'guest' } : null;
  }
}

// 记录审计日志
async function addLog(env, request, action, details) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    await env.DB.prepare("INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)").bind(action, details, ip).run();
  } catch (e) {}
}

// ============================================================================
// 主入口
// ============================================================================

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  // 1. 登录路由 (带用户名校验与频率限制)
  if (path === '/api/login' && method === 'POST') {
    const { username, password } = await request.json();
    const now = Date.now();

    // 频率限制检查
    const attempt = await env.DB.prepare("SELECT * FROM login_attempts WHERE ip = ?").bind(ip).first();
    if (attempt) {
        const timePassed = now - attempt.last_attempt;
        if (attempt.attempts >= 5 && timePassed < 600000) {
            const remain = Math.ceil((600000 - timePassed) / 60000);
            return jsonResponse({ success: false, message: `尝试次数过多，请在 ${remain} 分钟后再试` }, 429);
        }
        if (timePassed >= 600000) await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
    }

    if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
      await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
      const token = await createJWT({ role: 'admin' }, env.ADMIN_PASSWORD);
      // 设置 HttpOnly Cookie
      return jsonResponse({ success: true }, 200, { 
          'Set-Cookie': `token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400` 
      });
    } else {
      await env.DB.prepare(`
        INSERT INTO login_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?)
        ON CONFLICT(ip) DO UPDATE SET attempts = attempts + 1, last_attempt = ?
      `).bind(ip, now, now).run();
      return jsonResponse({ success: false, message: '用户名或密码错误' }, 401);
    }
  }

  // 2. 登出路由 (彻底清理 Cookie)
  if (path === '/api/logout') {
    return jsonResponse({ success: true }, 200, { 
        'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' 
    });
  }

  // 3. 鉴权
  const auth = await verifyAuth(request, env);
  if (!auth) return jsonResponse({ success: false, message: '需要登录' }, 401);

  // 4. 后台管理接口 (仅管理员)
  if (path.startsWith('/api/admin/')) {
    if (auth.role !== 'admin') return jsonResponse({ success: false }, 403);
    
    // 审计日志
    if (path === '/api/admin/logs') {
      const { results } = await env.DB.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all();
      return jsonResponse({ success: true, logs: results });
    }
    // 隐私路径管理
    if (path === '/api/admin/settings/hidden' && method === 'GET') {
      const { results } = await env.DB.prepare("SELECT key as path FROM settings").all();
      return jsonResponse({ success: true, list: results });
    }
    if (path === '/api/admin/settings/hidden' && method === 'POST') {
      const { targetPath } = await request.json();
      await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind(targetPath).run();
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/settings/hidden' && method === 'DELETE') {
      const targetPath = url.searchParams.get('path');
      await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(targetPath).run();
      return jsonResponse({ success: true });
    }
  }

  // 5. 权限角色查询
  if (path === '/api/auth/role') return jsonResponse({ role: auth.role });

  // 6. 路径解析与隐私过滤
  let r2Path = "";
  if (path.startsWith('/api/files/')) r2Path = decodeURIComponent(path.slice(11));
  else if (path.startsWith('/api/download/')) r2Path = decodeURIComponent(path.slice(14));
  else if (path.startsWith('/api/preview/')) r2Path = decodeURIComponent(path.slice(13));
  else if (path.startsWith('/api/mkdir/')) r2Path = decodeURIComponent(path.slice(11));

  // 从 D1 加载隐藏路径名单
  const hiddenSettings = await env.DB.prepare("SELECT key FROM settings").all();
  const hiddenPaths = hiddenSettings.results.map(r => r.key);

  // 安全检查：如果访问路径包含隐私路径，访客被拒绝
  const isTargetHidden = hiddenPaths.some(hp => r2Path === hp || r2Path.startsWith(hp + '/'));
  if (isTargetHidden && auth.role !== 'admin') {
      return jsonResponse({ success: false, message: 'Forbidden' }, 403);
  }

  // 7. 文件列表 (带隐私过滤)
  if (path.startsWith('/api/files') && method === 'GET') {
    let prefix = r2Path; if (prefix && !prefix.endsWith('/')) prefix += '/';
    const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
    
    const folders = (listed.delimitedPrefixes || []).map(p => {
        const fullKey = p.slice(0, -1);
        return { name: p.slice(prefix.length, -1), path: '/' + fullKey, fullKey, time: Date.now() };
    }).filter(f => auth.role === 'admin' || !hiddenPaths.includes(f.fullKey));

    const files = (listed.objects || []).map(o => ({
        name: o.key.slice(prefix.length),
        path: '/' + o.key,
        fullKey: o.key,
        sizeFormatted: (o.size / 1024 / 1024).toFixed(2) + ' MB',
        rawSize: o.size,
        time: o.uploaded.getTime()
    })).filter(f => f.name !== '' && f.name !== '.folder' && (auth.role === 'admin' || !hiddenPaths.includes(f.fullKey)));

    return jsonResponse({ folders, files });
  }

  // 8. 敏感操作拦截 (仅管理员)
  const isWriteAction = ['POST', 'PUT', 'DELETE'].includes(method);
  if (isWriteAction && auth.role !== 'admin') {
      return jsonResponse({ success: false, message: '无管理员权限' }, 403);
  }

  // 新建文件夹
  if (path.startsWith('/api/mkdir') && method === 'POST') {
    const { folderName } = await request.json();
    let prefix = r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '';
    await env.R2_BUCKET.put(prefix + folderName + '/.folder', new Uint8Array(0));
    await addLog(env, request, 'MKDIR', prefix + folderName);
    return jsonResponse({ success: true });
  }

  // 上传文件
  if (path.startsWith('/api/files') && method === 'POST') {
    const formData = await request.formData();
    const file = formData.get('file');
    let prefix = r2Path ? (r2Path.endsWith('/') ? r2Path : r2Path + '/') : '';
    const key = prefix + file.name;
    await env.R2_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    await addLog(env, request, 'UPLOAD', key);
    return jsonResponse({ success: true });
  }

  // 删除
  if (path.startsWith('/api/files') && method === 'DELETE') {
    await env.R2_BUCKET.delete(r2Path);
    await addLog(env, request, 'DELETE', r2Path);
    return jsonResponse({ success: true });
  }

  // 重命名
  if (path.startsWith('/api/files') && method === 'PUT') {
    const { newName } = await request.json();
    const source = await env.R2_BUCKET.get(r2Path);
    if (!source) return jsonResponse({ success: false, message: '源文件不存在' }, 404);
    const dir = r2Path.substring(0, r2Path.lastIndexOf('/') + 1);
    const newKey = dir + newName;
    await env.R2_BUCKET.put(newKey, source.body, { httpMetadata: source.httpMetadata });
    await env.R2_BUCKET.delete(r2Path);
    await addLog(env, request, 'RENAME', `${r2Path} -> ${newName}`);
    return jsonResponse({ success: true });
  }

  // 预览与下载
  if (path.startsWith('/api/preview') || path.startsWith('/api/download')) {
    const obj = await env.R2_BUCKET.get(r2Path);
    if (!obj) return new Response('Not Found', { status: 404 });
    const isDownload = path.startsWith('/api/download');
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': isDownload ? `attachment; filename="${encodeURIComponent(r2Path.split('/').pop())}"` : 'inline'
      }
    });
  }

  return jsonResponse({ message: 'API Path Not Found' }, 404);
}
