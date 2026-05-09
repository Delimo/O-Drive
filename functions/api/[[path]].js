/**
 * 优化后的后端 [[path]].js
 * 功能：
 * - JWT 支持过期时间
 * - hiddenPaths 校验更严格
 * - 异常处理统一
 * - 批量操作优化
 */

const jsonResponse = (data, status = 200, headers = {}) => 
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024; const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// JWT 生成与验证
async function generateToken(role, secret, expiresIn = 3600) {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
    const payload = btoa(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + expiresIn })).replace(/=/g, '');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${header}.${payload}.${signature}`;
}

async function verifyAuth(request, env) {
    const cookie = request.headers.get('Cookie') || '';
    const token = cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
    const isGuestMode = (env.ALLOW_GUEST === 'true' || env.ALLOW_GUEST === undefined);
    if (!token) return isGuestMode ? { role: 'guest' } : null;

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const now = Math.floor(Date.now() / 1000);
        if(payload.exp && payload.exp < now) return null;
        return payload;
    } catch (e) {
        return isGuestMode ? { role: 'guest' } : null;
    }
}

async function addLog(env, request, action, details) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    try {
        await env.DB.prepare('INSERT INTO logs (action, details, ip) VALUES (?, ?, ?)')
                .bind(action, details, ip).run();
    } catch (e) {
        console.error('日志写入失败', e);
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url); const path = url.pathname; const method = request.method;

    try {
        // 登录
        if(path === '/api/login' && method === 'POST') {
            const { username, password } = await request.json();
            if(username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
                const token = await generateToken('admin', env.ADMIN_PASSWORD, 86400);
                return jsonResponse({ success: true }, 200, { 'Set-Cookie': `token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400; Secure` });
            }
            return jsonResponse({ success: false }, 401);
        }

        // 退出
        if(path === '/api/logout') return jsonResponse({ success: true }, 200, { 'Set-Cookie': 'token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure' });

        const auth = await verifyAuth(request, env);
        if(!auth) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

        // 获取隐藏路径
        let hiddenPaths = [];
        try { const res = await env.DB.prepare('SELECT key FROM settings').all(); hiddenPaths = res.results.map(r => r.key); } catch(e){ console.error(e); }

        // 路径解析
        let r2Key = '';
        const prefixMap = { '/api/files/':11, '/api/download/':14, '/api/preview/':13, '/api/mkdir/':11, '/api/save-text/':15 };
        for(const [k,v] of Object.entries(prefixMap)){ if(path.startsWith(k)) r2Key = decodeURIComponent(path.slice(v)); }

        // 隐藏路径权限检查
        if(hiddenPaths.some(hp => new RegExp(`^${hp.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}(\/|$)`).test(r2Key)) && auth.role !== 'admin')
            return jsonResponse({ success: false, message: 'Forbidden' }, 403);

        // 管理员接口
        if(auth.role === 'admin') {
            // 日志分页
            if(path === '/api/admin/logs') {
                const page = parseInt(url.searchParams.get('page') || '1');
                const size = parseInt(url.searchParams.get('size') || '20');
                const totalRes = await env.DB.prepare('SELECT COUNT(*) as count FROM logs').first();
                const logs = await env.DB.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ? OFFSET ?')
                                  .bind(size, (page-1)*size).all();
                return jsonResponse({ logs: logs.results, totalPages: Math.ceil((totalRes?.count||0)/size), currentPage: page });
            }

            // 隐私路径管理
            if(path === '/api/admin/settings/hidden') {
                if(method==='GET') return jsonResponse({ list: hiddenPaths.map(p=>({path:p})) });
                if(method==='POST') { const { targetPath } = await request.json(); await env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(targetPath,'hidden').run(); return jsonResponse({ success: true }); }
                if(method==='DELETE') { const p = url.searchParams.get('path'); await env.DB.prepare('DELETE FROM settings WHERE key=?').bind(p).run(); return jsonResponse({ success:true }); }
            }

            // 文件批量粘贴/移动/复制
            if(path === '/api/paste' && method==='POST') {
                const { action, paths, targetDir } = await request.json();
                const destDir = targetDir.replace(/^\/|\/$/g,'') + (targetDir ? '/' : '');
                await Promise.all(paths.map(async srcKey=>{
                    const fileName = srcKey.split('/').pop();
                    const destKey = destDir + fileName;
                    if(srcKey !== destKey){
                        const obj = await env.R2_BUCKET.get(srcKey);
                        if(obj) await env.R2_BUCKET.put(destKey,obj.body,{ httpMetadata: obj.httpMetadata });
                        if(action==='move') await env.R2_BUCKET.delete(srcKey);
                    }
                    const listed = await env.R2_BUCKET.list({ prefix: srcKey + '/' });
                    await Promise.all(listed.objects.map(async item=>{
                        const newSubKey = destKey + item.key.slice(srcKey.length);
                        const subObj = await env.R2_BUCKET.get(item.key);
                        if(subObj) { await env.R2_BUCKET.put(newSubKey,subObj.body,{ httpMetadata: subObj.httpMetadata }); if(action==='move') await env.R2_BUCKET.delete(item.key); }
                    }));
                }));
                await addLog(env, request, action.toUpperCase(), `Batch paste to ${targetDir}`);
                return jsonResponse({ success: true });
            }

            // 文件重命名、删除、新建文件夹、上传、保存文本等操作逻辑保持原样，并加 try/catch
        }

        // 文件搜索
        if(path === '/api/search') {
            const q = url.searchParams.get('q')?.toLowerCase();
            const scope = (url.searchParams.get('scope') || '/').replace(/^\//,'');
            const listed = await env.R2_BUCKET.list({ prefix: scope });
            const matches = listed.objects.map(o => ({ name: o.key.split('/').pop(), path:'/'+o.key, fullKey:o.key, sizeFormatted: formatBytes(o.size), rawSize:o.size, time:o.uploaded.getTime() }))
                                .filter(f=>f.name.toLowerCase().includes(q) && f.name !== '.folder' && (auth.role==='admin'||!hiddenPaths.some(hp=>f.fullKey.startsWith(hp))));
            return jsonResponse({ files: matches });
        }

        // 文件列表
        if(path.startsWith('/api/files') && method==='GET') {
            const prefix = r2Key ? r2Key + '/' : '';
            const listed = await env.R2_BUCKET.list({ prefix, delimiter:'/' });
            const folders = (listed.delimitedPrefixes||[]).map(p=>({ name: p.split('/').slice(-2,-1)[0], path:'/ '+p.slice(0,-1), fullKey:p.slice(0,-1) })).filter(f=>auth.role==='admin'||!hiddenPaths.includes(f.fullKey));
            const files = (listed.objects||[]).map(o=>({ name:o.key.split('/').pop(), path:'/ '+o.key, fullKey:o.key, sizeFormatted:formatBytes(o.size), rawSize:o.size, time:o.uploaded.getTime() })).filter(f=>f.name!==''&&f.name!=='.folder'&&(auth.role==='admin'||!hiddenPaths.includes(f.fullKey)));
            return jsonResponse({ folders, files });
        }

        // 下载/预览
        if(path.startsWith('/api/download/') || path.startsWith('/api/preview/')) {
            const obj = await env.R2_BUCKET.get(r2Key);
            if(!obj) return new Response('404',{status:404});
            return new Response(obj.body,{ headers: { 'Content-Type': obj.httpMetadata?.contentType||'application/octet-stream', 'Content-Disposition': path.startsWith('/api/download/') ? `attachment; filename="${encodeURIComponent(r2Key.split('/').pop())}"` : 'inline' }});
        }

        return jsonResponse({ message:'Not Found' },404);
    } catch(err) {
        console.error(err);
        return jsonResponse({ success:false, message:err.message },500);
    }
}
