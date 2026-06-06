import { jsonResponse, base64UrlToUint8Array, decodeBase64UrlJson, encodeBase64Url, ensureCoreTables } from './common.js';

function createCsrfToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(String.fromCharCode(...bytes));
}

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function isSecureRequest(request) {
  return request && new URL(request.url).protocol === 'https:';
}

function cookieName(request) {
  return isSecureRequest(request) ? '__Host-token' : 'token';
}

function cookieAttributes(request, maxAge = SESSION_TTL_SECONDS) {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function parseCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function verifyCsrf(request, auth) {
  if (auth?.role !== 'admin') return false;
  const token = request.headers.get('X-CSRF-Token') || '';
  return Boolean(auth.csrf && token && token === auth.csrf);
}

export async function verifyAuth(request, env) {
  const token = parseCookie(request, '__Host-token') || parseCookie(request, 'token');
  const isGuestMode = env.ALLOW_GUEST === 'true';
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

async function checkAndRecordLoginAttempt(env, ip) {
  const now = Date.now();
  try {
    const row = await env.D1.prepare('SELECT attempts, last_attempt FROM login_attempts WHERE ip = ?').bind(ip).first();
    const attempts = Number(row?.attempts || 0);
    const lastAttempt = Number(row?.last_attempt || 0);
    if (attempts >= LOGIN_MAX_ATTEMPTS && now - lastAttempt < LOGIN_LOCKOUT_MS) {
      return { locked: true };
    }
    if (now - lastAttempt >= LOGIN_LOCKOUT_MS) {
      await env.D1.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
    } else {
      await env.D1.prepare(
        'INSERT INTO login_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET attempts = attempts + 1, last_attempt = excluded.last_attempt'
      ).bind(ip, now).run();
    }
  } catch (e) {}
  return { locked: false };
}

export async function handleLogin(request, env) {
  await ensureCoreTables(env);
  const { username, password } = await request.json();
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  const attemptResult = await checkAndRecordLoginAttempt(env, ip);
  if (attemptResult.locked) {
    return jsonResponse({ success: false, message: 'Too many attempts' }, 429);
  }

  if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
    try { await env.D1.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run(); } catch (e) {}
    const csrf = createCsrfToken();
    const now = Math.floor(Date.now() / 1000);
    const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = encodeBase64Url(JSON.stringify({ role: 'admin', csrf, iat: now, exp: now + SESSION_TTL_SECONDS }));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`));
    const signature = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return jsonResponse({ success: true, csrf }, 200, { 'Set-Cookie': `${cookieName(request)}=${header}.${payload}.${signature}; ${cookieAttributes(request)}` });
  }

  return jsonResponse({ success: false }, 401);
}

export function handleLogout(request) {
  const name = cookieName(request);
  return jsonResponse({ success: true }, 200, { 'Set-Cookie': `${name}=; ${cookieAttributes(request, 0)}` });
}
