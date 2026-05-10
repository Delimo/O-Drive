import { jsonResponse, base64UrlToUint8Array, decodeBase64UrlJson, encodeBase64Url } from './common.js';

function createCsrfToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(String.fromCharCode(...bytes));
}

const SESSION_TTL_SECONDS = 24 * 60 * 60;

function cookieAttributes(request, maxAge = SESSION_TTL_SECONDS) {
  const secure = request && new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function verifyCsrf(request, auth) {
  if (auth?.role !== 'admin') return false;
  const token = request.headers.get('X-CSRF-Token') || '';
  return Boolean(auth.csrf && token && token === auth.csrf);
}

export async function verifyAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
  const isGuestMode = (env.ALLOW_GUEST === 'true' || env.ALLOW_GUEST === undefined);
  if (!token) return isGuestMode ? { role: 'guest' } : null;
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature || !env.ADMIN_PASSWORD) return isGuestMode ? { role: 'guest' } : null;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.ADMIN_PASSWORD),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToUint8Array(signature),
      new TextEncoder().encode(`${header}.${payload}`)
    );
    if (!valid) return isGuestMode ? { role: 'guest' } : null;
    const claims = decodeBase64UrlJson(payload);
    if (!claims?.exp || Date.now() >= Number(claims.exp) * 1000) return isGuestMode ? { role: 'guest' } : null;
    return claims?.role === 'admin' && claims.csrf ? claims : (isGuestMode ? { role: 'guest' } : null);
  } catch (e) {
    return isGuestMode ? { role: 'guest' } : null;
  }
}

export async function handleLogin(request, env) {
  const { username, password } = await request.json();
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    const row = await env.DB.prepare('SELECT attempts, last_attempt FROM login_attempts WHERE ip = ?').bind(ip).first();
    const recentAttempt = row?.last_attempt ? Number(row.last_attempt) : 0;
    if (row && Number(row.attempts || 0) >= 5 && Date.now() - recentAttempt < 15 * 60 * 1000) {
      return jsonResponse({ success: false, message: 'Too many attempts' }, 429);
    }
  } catch (e) {}

  if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
    try { await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run(); } catch (e) {}
    const csrf = createCsrfToken();
    const now = Math.floor(Date.now() / 1000);
    const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = encodeBase64Url(JSON.stringify({ role: 'admin', csrf, iat: now, exp: now + SESSION_TTL_SECONDS }));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return jsonResponse({ success: true, csrf }, 200, { 'Set-Cookie': `token=${header}.${payload}.${signature}; ${cookieAttributes(request)}` });
  }

  try {
    await env.DB.prepare(
      'INSERT INTO login_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET attempts = attempts + 1, last_attempt = excluded.last_attempt'
    ).bind(ip, Date.now()).run();
  } catch (e) {}
  return jsonResponse({ success: false }, 401);
}

export function handleLogout(request) {
  return jsonResponse({ success: true }, 200, { 'Set-Cookie': `token=; ${cookieAttributes(request, 0)}` });
}
