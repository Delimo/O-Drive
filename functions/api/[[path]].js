/* --- [[path]].js 最终修正版 --- */
const jsonResponse = (data, status = 200, headers = {}) => 
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

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
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  if (path === '/api/login' && method === 'POST') {
    const { username, password } = await request.json();
    const now = Date.now();
    const attempt = await env.DB.prepare("SELECT * FROM login_attempts WHERE ip = ?").bind(ip).first();
    if (attempt && attempt.attempts >= 5 && (now - attempt.last_attempt < 600000)) return jsonResponse({ success: false, message: '尝试过多' }, 429);
    if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
      const payload = btoa(JSON.stringify({ role: 'admin' })).replace(/=/g, '');
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
      const signature = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
      return jsonResponse({ success: true }, 200, { 'Set-Cookie': `token=${header}.${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400` });
    } else {
      await env.DB.prepare("INSERT INTO login_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET attempts = attempts + 1, last_attempt = ?").bind(ip, now, now).run();
      return jsonResponse({ success: false }, 401);
    }
  }

  if (path === '/api/logout') return jsonResponse({ success: true }, 200, { 'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' });
  const auth = await verifyAuth(request, env);
  if (!auth) return jsonResponse({ success: false }, 401);
  if (path === '/api/auth/role') return jsonResponse({ role: auth.role });

  let r2Key = "";
  if (path.startsWith('/api/files/')) r2Key = decodeURIComponent(path.slice(11));
  else if (path.startsWith('/api/download/')) r2Key = decodeURIComponent(path.slice(14));
  else if (path.startsWith('/api/preview/')) r2Key = decodeURIComponent(path.slice(13));
  else if (path.startsWith('/api/mkdir/')) r2Key = decodeURIComponent(path.slice(11));
  else if (path.startsWith('/api/save-text/')) r2Key = decodeURIComponent(path.slice(15));
  
  const hiddenRes = await env.DB.prepare("SELECT key FROM settings").all();
  const hiddenPaths = hiddenRes.results.map(r => r.key);
  if (hiddenPaths.some(hp => r2Key === hp || r2Key.startsWith(hp + '/')) && auth.role !== 'admin') return jsonResponse({ success: false, message: 'Forbidden' }, 403);

  // 管理员 API 路由 (找回这部分)
  if (auth.role === 'admin') {
    if (path.startsWith('/api/admin/')) {
        if (path === '/api/admin/logs') return jsonResponse({ logs: (await env.DB.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100").all()).results });
        if (path === '/api/admin/settings/hidden') {
            if (method === 'GET') return jsonResponse({ list: (await env.DB.prepare("SELECT key as path FROM settings").all()).results });
            if (method === 'POST') { await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind((await request.json()).targetPath).run(); return jsonResponse({ success: true }); }
            if (method === 'DELETE') { await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(url.searchParams.get('path')).run(); return jsonResponse({ success: true }); }
        }
    }
    if (path.startsWith('/api/save-text/') && method === 'POST') {
        const { content } = await request.json();
        await env.R2_BUCKET.put(r2Key, content, { httpMetadata: { contentType: 'text/plain' } });
        await addLog(env, request, 'SAVE_TEXT', r2Key);
        return jsonResponse({ success: true });
    }
    if (path === '/api/batch-delete') {
        const { paths } = await request.json();
        for (const p of paths) {
            const listed = await env.R2_BUCKET.list({ prefix: p + '/' });
            for (const obj of listed.objects) await env.R2_BUCKET.delete(obj.key);
            await env.R2_BUCKET.delete(p);
        }
        return jsonResponse({ success: true });
    }
    if (path === '/api/paste') {
        const { action, paths, targetDir } = await request.json();
        const destPrefix = targetDir === '/' ? '' : (targetDir.endsWith('/') ? targetDir : targetDir + '/');
        for (const src of paths) {
            const name = src.split('/').pop(); const dest = destPrefix + name;
            const listed = await env.R2_BUCKET.list({ prefix: src + '/' });
            const self = await env.R2_BUCKET.get(src);
            if (self) await env.R2_BUCKET.put(dest, self.body);
            for (const obj of listed.objects) await env.R2_BUCKET.put(dest + obj.key.slice(src.length), (await env.R2_BUCKET.get(obj.key)).body);
            if (action === 'move') {
                for (const obj of listed.objects) await env.R2_BUCKET.delete(obj.key); await env.R2_BUCKET.delete(src);
                await env.DB.prepare("UPDATE settings SET key = ? WHERE key = ?").bind(dest, src).run();
            }
        }
        return jsonResponse({ success: true });
    }
    if (path.startsWith('/api/files') && method === 'PUT') {
        const { newName } = await request.json();
        const parentDir = r2Key.includes('/') ? r2Key.substring(0, r2Key.lastIndexOf('/') + 1) : '';
        const newKey = parentDir + newName;
        const source = await env.R2_BUCKET.get(r2Key);
        if (source) { await env.R2_BUCKET.put(newKey, source.body); await env.R2_BUCKET.delete(r2Key); }
        const listed = await env.R2_BUCKET.list({ prefix: r2Key + '/' });
        for (const obj of listed.objects) { await env.R2_BUCKET.put(newKey + obj.key.slice(r2Key.length), (await env.R2_BUCKET.get(obj.key)).body); await env.R2_BUCKET.delete(obj.key); }
        await env.DB.prepare("UPDATE settings SET key = ? WHERE key = ?").bind(newKey, r2Key).run();
        return jsonResponse({ success: true });
    }
  }

  if (path === '/api/search') {
    const q = url.searchParams.get('q')?.toLowerCase();
    const scope = (url.searchParams.get('scope') || '/').replace(/^\//, '');
    const listed = await env.R2_BUCKET.list({ prefix: scope });
    const matches = listed.objects.map(o => ({ name: o.key.split('/').pop(), path: '/' + o.key, fullKey: o.key, sizeFormatted: formatBytes(o.size), rawSize: o.size, time: o.uploaded.getTime() }))
      .filter(f => f.name.toLowerCase().includes(q) && f.name !== '.folder' && (auth.role === 'admin' || !hiddenPaths.some(hp => f.fullKey.startsWith(hp))));
    return jsonResponse({ files: matches });
  }

  if (path.startsWith('/api/files') && method === 'GET') {
    let prefix = r2Key ? r2Key + '/' : '';
    const listed = await env.R2_BUCKET.list({ prefix, delimiter: '/' });
    const folders = (listed.delimitedPrefixes || []).map(p => ({ name: p.split('/').slice(-2, -1)[0], path: '/' + p.slice(0, -1), fullKey: p.slice(0, -1) })).filter(f => auth.role === 'admin' || !hiddenPaths.includes(f.fullKey));
    const files = (listed.objects || []).map(o => ({ name: o.key.split('/').pop(), path: '/' + o.key, fullKey: o.key, sizeFormatted: formatBytes(o.size), rawSize: o.size, time: o.uploaded.getTime() })).filter(f => f.name !== '' && f.name !== '.folder' && (auth.role === 'admin' || !hiddenPaths.includes(f.fullKey)));
    return jsonResponse({ folders, files });
  }

  if (['POST', 'PUT', 'DELETE'].includes(method) && auth.role !== 'admin') return jsonResponse({ success: false }, 403);
  if (path.startsWith('/api/mkdir')) {
    const { folderName } = await request.json();
    await env.R2_BUCKET.put((r2Key ? r2Key + '/' : '') + folderName + '/.folder', new Uint8Array(0));
    return jsonResponse({ success: true });
  }
  if (path.startsWith('/api/files') && method === 'POST') {
    const file = (await request.formData()).get('file');
    await env.R2_BUCKET.put((r2Key ? r2Key + '/' : '') + file.name, file.stream(), { httpMetadata: { contentType: file.type } });
    return jsonResponse({ success: true });
  }
  if (path.startsWith('/api/download') || path.startsWith('/api/preview')) {
    const obj = await env.R2_BUCKET.get(r2Key);
    if (!obj) return new Response('404', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Content-Disposition': path.startsWith('/api/download') ? `attachment; filename="${encodeURIComponent(r2Key.split('/').pop())}"` : 'inline' }});
  }
  return jsonResponse({ message: 'Not Found' }, 404);
}
