import { jsonResponse, normalizeHiddenPath, encodeBase64Url, base64UrlToUint8Array, decodeBase64UrlJson } from './common.js';

const ACCESS_COOKIE = 'path_access';
const ACCESS_TTL = 12 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 210000;
const DEFAULT_UNLOCK_MAX_ATTEMPTS = 5;
const DEFAULT_UNLOCK_LOCK_MINUTES = 15;
const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS path_passwords (
    path TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    note TEXT DEFAULT '',
    show_name INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  )
`;
const ATTEMPTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS path_access_attempts (
    path TEXT NOT NULL,
    ip TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (path, ip)
  )
`;

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(bytes));
}

async function pbkdf2Hex(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function hashPassword(password, salt) {
  const iterations = PASSWORD_ITERATIONS;
  const hash = await pbkdf2Hex(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${hash}`;
}

async function verifyPassword(password, rule) {
  const stored = String(rule.password_hash || '');
  const parts = stored.split('$');
  if (parts[0] === 'pbkdf2-sha256' && parts.length === 3) {
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 10000) return false;
    const candidate = await pbkdf2Hex(password, rule.salt, iterations);
    return candidate === parts[2];
  }
  const legacy = await sha256Hex(`${rule.salt}:${password}`);
  return legacy === stored;
}

async function sign(value, env) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_PASSWORD || 'o-drive'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeBase64Url(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifySignature(value, signature, env) {
  if (!value || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ADMIN_PASSWORD || 'o-drive'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToUint8Array(signature),
    new TextEncoder().encode(value)
  );
}

async function ensureTable(env) {
  const stmt = env.DB.prepare(TABLE_SQL);
  if (typeof stmt.bind === 'function') {
    await stmt.bind().run();
  } else {
    await stmt.run();
  }
  const attemptsStmt = env.DB.prepare(ATTEMPTS_TABLE_SQL);
  if (typeof attemptsStmt.bind === 'function') {
    await attemptsStmt.bind().run();
  } else {
    await attemptsStmt.run();
  }
}

function normalizeProtectedPath(path) {
  return normalizeHiddenPath(path);
}

function cookieValue(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.split('; ').find(row => row.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

async function readAccessCookie(request, env) {
  const value = cookieValue(request, ACCESS_COOKIE);
  if (!value) return { paths: [] };
  const [payload, signature] = value.split('.');
  if (!payload || !signature || !(await verifySignature(payload, signature, env))) return { paths: [] };
  try {
    const data = decodeBase64UrlJson(payload);
    if (!data?.exp || Date.now() > Number(data.exp)) return { paths: [] };
    return { paths: Array.isArray(data.paths) ? data.paths.filter(Boolean) : [] };
  } catch (_) {
    return { paths: [] };
  }
}

async function makeAccessCookie(paths, env) {
  const unique = [...new Set(paths.filter(Boolean))];
  const payload = encodeBase64Url(JSON.stringify({ paths: unique, exp: Date.now() + ACCESS_TTL }));
  const signature = await sign(payload, env);
  return `${ACCESS_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(ACCESS_TTL / 1000)}`;
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function unlockLimits(env) {
  const maxAttempts = Math.max(1, Math.min(100, Number(env.PATH_UNLOCK_MAX_ATTEMPTS || DEFAULT_UNLOCK_MAX_ATTEMPTS)));
  const lockMinutes = Math.max(1, Math.min(1440, Number(env.PATH_UNLOCK_LOCK_MINUTES || DEFAULT_UNLOCK_LOCK_MINUTES)));
  return { maxAttempts, lockMs: lockMinutes * 60 * 1000 };
}

async function checkUnlockAttempts(env, request, path) {
  const ip = clientIp(request);
  const limits = unlockLimits(env);
  try {
    const row = await env.DB.prepare('SELECT attempts, last_attempt FROM path_access_attempts WHERE path = ? AND ip = ?')
      .bind(path, ip)
      .first();
    const attempts = Number(row?.attempts || 0);
    const lastAttempt = Number(row?.last_attempt || 0);
    if (attempts >= limits.maxAttempts && Date.now() - lastAttempt < limits.lockMs) {
      return {
        ok: false,
        retryAfter: Math.ceil((limits.lockMs - (Date.now() - lastAttempt)) / 1000),
      };
    }
  } catch (_) {}
  return { ok: true, ip };
}

async function recordUnlockFailure(env, path, ip) {
  try {
    await env.DB.prepare(
      `INSERT INTO path_access_attempts (path, ip, attempts, last_attempt)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(path, ip) DO UPDATE SET attempts = attempts + 1, last_attempt = excluded.last_attempt`
    ).bind(path, ip, Date.now()).run();
  } catch (_) {}
}

async function clearUnlockFailures(env, path, ip) {
  try {
    await env.DB.prepare('DELETE FROM path_access_attempts WHERE path = ? AND ip = ?').bind(path, ip).run();
  } catch (_) {}
}

export function findProtection(rules, key) {
  const clean = String(key || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  const matches = (rules || [])
    .filter(rule => clean === rule.path || clean.startsWith(`${rule.path}/`))
    .sort((a, b) => b.path.length - a.path.length);
  return matches[0] || null;
}

export async function isUnlocked(request, env, rule) {
  if (!rule) return true;
  const access = await readAccessCookie(request, env);
  return hasPathAccess(access, rule);
}

function hasPathAccess(access, rule) {
  return (access.paths || []).some(path => rule.path === path || rule.path.startsWith(`${path}/`));
}

export async function loadProtectedPaths(env) {
  try {
    await ensureTable(env);
    const res = await env.DB.prepare('SELECT path, salt, password_hash, note, show_name, created_at FROM path_passwords ORDER BY path ASC').all();
    return (res.results || []).map(row => ({
      path: row.path,
      salt: row.salt,
      password_hash: row.password_hash,
      note: row.note || '',
      show_name: Number(row.show_name ?? 1) === 1,
      created_at: row.created_at,
    }));
  } catch (_) {
    return [];
  }
}

export async function checkProtectedAccess(request, env, auth, rules, key) {
  if (auth.role === 'admin') return { ok: true, rule: null };
  const rule = findProtection(rules, key);
  if (!rule) return { ok: true, rule: null };
  if (await isUnlocked(request, env, rule)) return { ok: true, rule };
  return { ok: false, rule };
}

export async function markProtection(entries, request, env, auth, rules) {
  if (auth.role === 'admin') {
    return entries.map(entry => ({ ...entry, protected: Boolean(findProtection(rules, entry.fullKey)) }));
  }
  const access = await readAccessCookie(request, env);
  const out = [];
  for (const entry of entries) {
    const rule = findProtection(rules, entry.fullKey);
    if (!rule) {
      out.push(entry);
      continue;
    }
    const unlocked = hasPathAccess(access, rule);
    if (unlocked || rule.show_name) out.push({ ...entry, protected: !unlocked });
  }
  return out;
}

export async function handleProtectedSettings(env, request, method, url) {
  await ensureTable(env);
  if (method === 'GET') {
    const rows = await loadProtectedPaths(env);
    return jsonResponse({ list: rows.map(({ salt, password_hash, ...row }) => row) });
  }
  if (method === 'POST') {
    const body = await request.json();
    const path = normalizeProtectedPath(body.path || body.targetPath);
    const password = String(body.password || '');
    if (password.length < 4) return jsonResponse({ success: false, message: 'Password too short' }, 400);
    const salt = randomHex();
    const passwordHash = await hashPassword(password, salt);
    const note = String(body.note || '').trim();
    const showName = body.showName === false ? 0 : 1;
    await env.DB.prepare(
      'INSERT INTO path_passwords (path, salt, password_hash, note, show_name, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET salt = excluded.salt, password_hash = excluded.password_hash, note = excluded.note, show_name = excluded.show_name'
    ).bind(path, salt, passwordHash, note, showName, Date.now()).run();
    return jsonResponse({ success: true });
  }
  if (method === 'DELETE') {
    const path = normalizeProtectedPath(url.searchParams.get('path'));
    await env.DB.prepare('DELETE FROM path_passwords WHERE path = ?').bind(path).run();
    return jsonResponse({ success: true });
  }
  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}

export async function handleProtectedUnlock(env, request, auth, rules) {
  await ensureTable(env);
  const body = await request.json();
  const target = normalizeProtectedPath(body.path);
  const password = String(body.password || '');
  const rule = findProtection(rules, target) || rules.find(item => item.path === target);
  if (!rule) return jsonResponse({ success: false, message: 'No password rule for this path' }, 404);
  if (auth.role === 'admin') return jsonResponse({ success: true });
  const attempts = await checkUnlockAttempts(env, request, rule.path);
  if (!attempts.ok) {
    return jsonResponse(
      { success: false, message: 'Too many attempts', retryAfter: attempts.retryAfter },
      429,
      { 'Retry-After': String(attempts.retryAfter) }
    );
  }
  if (!(await verifyPassword(password, rule))) {
    await recordUnlockFailure(env, rule.path, attempts.ip);
    return jsonResponse({ success: false, message: 'Invalid password' }, 403);
  }
  await clearUnlockFailures(env, rule.path, attempts.ip);
  const access = await readAccessCookie(request, env);
  const cookie = await makeAccessCookie([...access.paths, rule.path], env);
  return jsonResponse({ success: true, path: rule.path }, 200, { 'Set-Cookie': cookie });
}
