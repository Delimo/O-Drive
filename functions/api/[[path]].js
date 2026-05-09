const jsonResponse = (data, status = 200, headers = {}) => 
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024; const dm = decimals < 0 ? 0 : decimals;
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
  const url = new URL(request.url); const path = url.pathname; const method = request.method;

  try {
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

    let hiddenPaths = [];
    try { const hiddenRes = await env.DB.prepare("SELECT key FROM settings").all(); hiddenPaths = hiddenRes.results.map(r => r.key); } catch (e) {}

    let r2Key = "";
    if (path.startsWith('/api/files/')) r2Key = decodeURIComponent(path.slice(11));
    else if (path.startsWith('/api/download/')) r2Key = decodeURIComponent(path.slice(14));
    else if (path.startsWith('/api/preview/')) r2Key = decodeURIComponent(path.slice(13));
    else if (path.startsWith('/api/mkdir/')) r2Key = decodeURIComponent(path.slice(11));
    else if (path.startsWith('/api/save-text/')) r2Key = decodeURIComponent(path.slice(15));

    if (hiddenPaths.some(hp => r2Key === hp || r2Key.startsWith(hp + '/')) && auth.role !== 'admin') return jsonResponse({ success: false }, 403);

    if (auth.role === 'admin') {
      if (path === '/api/admin/logs') {
          const page = parseInt(url.searchParams.get('page') || '1');
          const size = parseInt(url.searchParams.get('size') || '20');
          const totalRes = await env.DB.prepare("SELECT COUNT(*) as count FROM logs").first();
          const total = totalRes ? totalRes.count : 0;
          const logs = await env.DB.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?").bind(size, (page - 1) * size).all();
          return jsonResponse({ logs: logs.results, totalPages: Math.ceil(total / size), currentPage: page });
      }
      if (path === '/api/admin/settings/hidden') {
          if (method === 'GET') return jsonResponse({ list: hiddenPaths.map(p => ({path: p})) });
          if (method === 'POST') { await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, 'hidden')").bind((await request.json()).targetPath).run(); return jsonResponse({ success: true }); }
          if (method === 'DELETE') { await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(url.searchParams.get('path')).run(); return jsonResponse({ success: true }); }
      }
      if (path === '/api/paste' && method === 'POST') {
          const { action, paths, targetDir } = await request.json();
          let destDir = targetDir.replace(/^\/|\/$/g, '');
          if (destDir !== "") destDir += "/";
          for (const srcKey of paths) {
              const fileName = srcKey.split('/').pop(); const destKey = destDir + fileName;
              if (srcKey === destKey) continue;
              const obj = await env.R2_BUCKET.get(srcKey);
              if (obj) { await env.R2_BUCKET.put(destKey, obj.body, { httpMetadata: obj.httpMetadata }); if (action === 'move') await env.R2_BUCKET.delete(srcKey); }
              const listed = await env.R2_BUCKET.list({ prefix: srcKey + '/' });
              for (const item of listed.objects) {
                  const newSubKey = destKey + item.key.slice(srcKey.length);
                  const subObj = await env.R2_BUCKET.get(item.key);
                  if (subObj) { await env.R2_BUCKET.put(newSubKey, subObj.body, { httpMetadata: subObj.httpMetadata }); if (action === 'move') await env.R2_BUCKET.delete(item.key); }
              }
              if (action === 'move') try { await env.DB.prepare("UPDATE settings SET key = ? WHERE key = ?").bind(destKey, srcKey).run(); } catch(e){}
          }
          return jsonResponse({ success: true });
      }
      if (path.startsWith('/api/files/') && method === 'PUT') {
          const { newName } = await request.json();
          const parentDir = r2Key.includes('/') ? r2Key.substring(0, r2Key.lastIndexOf('/') + 1) : '';
          const newKey = parentDir + newName;
          const obj = await env.R2_BUCKET.get(r2Key);
          if (obj) { await env.R2_BUCKET.put(newKey, obj.body, { httpMetadata: obj.httpMetadata }); await env.R2_BUCKET.delete(r2Key); }
          const listed = await env.R2_BUCKET.list({ prefix: r2Key + '/' });
          for (const item of listed.objects) {
              const subKey = newKey + item.key.slice(r2Key.length); const subObj = await env.R2_BUCKET.get(item.key);
              if (subObj) { await env.R2_BUCKET.put(subKey, subObj.body, { httpMetadata: subObj.httpMetadata }); await env.R2_BUCKET.delete(item.key); }
          }
          try { await env.DB.prepare("UPDATE settings SET key = ? WHERE key = ?").bind(newKey, r2Key).run(); } catch(e){}
          return jsonResponse({ success: true });
      }
      if (path === '/api/batch-delete' && method === 'POST') {
          const { paths } = await request.json();
          for (const p of paths) {
              const listed = await env.R2_BUCKET.list({ prefix: p + '/' });
              for (const o of listed.objects) await env.R2_BUCKET.delete(o.key);
              await env.R2_BUCKET.delete(p);
          }
          return jsonResponse({ success: true });
      }
      if (path.startsWith('/api/save-text/') && method === 'POST') {
          await env.R2_BUCKET.put(r2Key, (await request.json()).content, { httpMetadata: { contentType: 'text/plain' } });
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
    if (path.startsWith('/api/download/') || path.startsWith('/api/preview/')) {
      const obj = await env.R2_BUCKET.get(r2Key);
      if (!obj) return new Response('404', { status: 404 });
      return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Content-Disposition': path.startsWith('/api/download/') ? `attachment; filename="${encodeURIComponent(r2Key.split('/').pop())}"` : 'inline' }});
    }
    if (path.startsWith('/api/mkdir')) {
      await env.R2_BUCKET.put((r2Key ? r2Key + '/' : '') + (await request.json()).folderName + '/.folder', new Uint8Array(0));
      return jsonResponse({ success: true });
    }
    if (path.startsWith('/api/files') && method === 'POST') {
      const file = (await request.formData()).get('file');
      await env.R2_BUCKET.put((r2Key ? r2Key + '/' : '') + file.name, file.stream(), { httpMetadata: { contentType: file.type } });
      return jsonResponse({ success: true });
    }
    return jsonResponse({ message: 'Not Found' }, 404);
  } catch (err) {
    return jsonResponse({ success: false, message: err.message }, 500);
  }
}
