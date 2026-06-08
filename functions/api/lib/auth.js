import { jsonResponse, decodeBase64UrlJson, encodeBase64Url, ensureCoreTables } from './common.js';
import { signHmac, verifyHmac } from './secrets.js';
import { normalizeWebhookEndpoints, notifyLoginBurst } from './webhooks.js';

function createCsrfToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(String.fromCharCode(...bytes));
}

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

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
    const valid = await verifyHmac(env, `${header}.${payload}`, signature);
    if (!valid) return isGuestMode ? { role: 'guest' } : null;
    const claims = decodeBase64UrlJson(payload);
    if (!claims?.exp || Date.now() >= Number(claims.exp) * 1000) return isGuestMode ? { role: 'guest' } : null;
    return claims?.role === 'admin' && claims.csrf ? claims : (isGuestMode ? { role: 'guest' } : null);
  } catch (e) {
    return isGuestMode ? { role: 'guest' } : null;
  }
}

async function checkLoginLocked(env, ip) {
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
    }
  } catch (e) {}
  return { locked: false };
}

async function recordLoginFailure(env, ip) {
  try {
    await env.D1.prepare(
      'INSERT INTO login_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET attempts = attempts + 1, last_attempt = excluded.last_attempt'
    ).bind(ip, Date.now()).run();
    const row = await env.D1.prepare('SELECT attempts, last_attempt FROM login_attempts WHERE ip = ?').bind(ip).first();
    return Number(row?.attempts || 0);
  } catch (e) {}
  return 0;
}

function waitForWebhook(context, promise) {
  if (!promise) return;
  if (typeof context?.waitUntil === 'function') context.waitUntil(promise.catch(() => {}));
  else promise.catch(() => {});
}

async function loadWebhookEndpoints(env) {
  const row = await env.D1.prepare("SELECT value FROM kv_config WHERE key = 'webhooks'").first();
  const items = row?.value ? JSON.parse(row.value) : [];
  return normalizeWebhookEndpoints(items);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

async function shouldSendLoginAlert(env, ip) {
  const now = Date.now();
  const cooldownMs = positiveNumber(env.LOGIN_ALERT_COOLDOWN_SECONDS, LOGIN_ALERT_COOLDOWN_MS / 1000) * 1000;
  const key = `login:${ip}`;
  try {
    const row = await env.D1.prepare('SELECT last_alert FROM login_alerts WHERE key = ?').bind(key).first();
    const lastAlert = Number(row?.last_alert || 0);
    if (now - lastAlert < cooldownMs) return { ok: false, cooldownSeconds: Math.round(cooldownMs / 1000) };
    await env.D1.prepare('INSERT OR REPLACE INTO login_alerts (key, last_alert) VALUES (?, ?)').bind(key, now).run();
    return { ok: true, cooldownSeconds: Math.round(cooldownMs / 1000) };
  } catch {
    return { ok: false, cooldownSeconds: Math.round(cooldownMs / 1000) };
  }
}

async function notifyLoginFailureBurst(env, request, username, ip, attempts, context) {
  const alert = await shouldSendLoginAlert(env, ip);
  if (!alert.ok) return;
  const endpoints = await loadWebhookEndpoints(env);
  await notifyLoginBurst(endpoints, {
    ip,
    username: String(username || ''),
    attempts,
    threshold: LOGIN_MAX_ATTEMPTS,
    lockoutSeconds: Math.round(LOGIN_LOCKOUT_MS / 1000),
    cooldownSeconds: alert.cooldownSeconds,
    userAgent: request.headers.get('user-agent') || '',
  });
}

export async function handleLogin(request, env, context = {}) {
  await ensureCoreTables(env);
  const { username, password } = await request.json();
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';

  const attemptResult = await checkLoginLocked(env, ip);
  if (attemptResult.locked) {
    return jsonResponse({ success: false, message: 'Too many attempts' }, 429);
  }

  if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
    try { await env.D1.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run(); } catch (e) {}
    const csrf = createCsrfToken();
    const now = Math.floor(Date.now() / 1000);
    const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = encodeBase64Url(JSON.stringify({ role: 'admin', csrf, iat: now, exp: now + SESSION_TTL_SECONDS }));
    const signature = await signHmac(env, `${header}.${payload}`);
    return jsonResponse({ success: true, csrf }, 200, { 'Set-Cookie': `${cookieName(request)}=${header}.${payload}.${signature}; ${cookieAttributes(request)}` });
  }

  const attempts = await recordLoginFailure(env, ip);
  if (attempts >= LOGIN_MAX_ATTEMPTS) waitForWebhook(context, notifyLoginFailureBurst(env, request, username, ip, attempts, context));
  return jsonResponse({ success: false }, 401);
}

export function handleLogout(request) {
  const name = cookieName(request);
  return jsonResponse({ success: true }, 200, { 'Set-Cookie': `${name}=; ${cookieAttributes(request, 0)}` });
}
