import {
  jsonResponse,
  decodeBase64UrlJson,
  encodeBase64Url,
  ensureCoreTables,
  waitForWebhook,
  parseCookie,
  timingSafeEqual,
} from "./common/index.js";
import { signHmac, verifyHmac } from "./secrets.js";
import { loadWebhookEndpoints, notifyLoginBurst } from "./webhooks.js";

function createCsrfToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(String.fromCharCode(...bytes));
}

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const LOGIN_ACCOUNT_THROTTLE_ATTEMPTS = 20;
const LOGIN_ACCOUNT_DELAY_MS = 750;

function isSecureRequest(request) {
  return request && new URL(request.url).protocol === "https:";
}

function cookieName(request) {
  return isSecureRequest(request) ? "__Host-token" : "token";
}

function cookieAttributes(request, maxAge = SESSION_TTL_SECONDS) {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function verifyCsrf(request, auth) {
  if (auth?.role !== "admin") return false;
  const token = request.headers.get("X-CSRF-Token") || "";
  if (!auth.csrf || !token) return false;
  return timingSafeEqual(token, auth.csrf);
}

export async function verifyAuth(request, env) {
  const token =
    parseCookie(request, "__Host-token") || parseCookie(request, "token");
  const isGuestMode = env.ALLOW_GUEST === "true";
  if (!token) return isGuestMode ? { role: "guest" } : null;
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature || !env.ADMIN_PASSWORD)
      return isGuestMode ? { role: "guest" } : null;
    const valid = await verifyHmac(env, `${header}.${payload}`, signature);
    if (!valid) return isGuestMode ? { role: "guest" } : null;
    const claims = decodeBase64UrlJson(payload);
    if (!claims?.exp || Date.now() >= Number(claims.exp) * 1000)
      return isGuestMode ? { role: "guest" } : null;
    return claims?.role === "admin" && claims.csrf
      ? claims
      : isGuestMode
        ? { role: "guest" }
        : null;
  } catch (e) {
    return isGuestMode ? { role: "guest" } : null;
  }
}

async function checkLoginLocked(env, ip) {
  const now = Date.now();
  try {
    const row = await env.D1.prepare(
      "SELECT attempts, last_attempt FROM login_attempts WHERE ip = ?",
    )
      .bind(ip)
      .first();
    const attempts = Number(row?.attempts || 0);
    const lastAttempt = Number(row?.last_attempt || 0);
    if (
      attempts >= LOGIN_MAX_ATTEMPTS &&
      now - lastAttempt < LOGIN_LOCKOUT_MS
    ) {
      return { locked: true };
    }
    if (now - lastAttempt >= LOGIN_LOCKOUT_MS) {
      await env.D1.prepare("DELETE FROM login_attempts WHERE ip = ?")
        .bind(ip)
        .run();
    }
  } catch (e) {
    console.warn("[auth] checkLoginLocked error:", e.message);
  }
  return { locked: false };
}

function loginAccountKey(username) {
  const normalized = String(username || "").trim().toLowerCase();
  return normalized ? `user:${normalized.slice(0, 128)}` : "";
}

async function clearLoginAttempt(env, key) {
  if (!key) return;
  try {
    await env.D1.prepare("DELETE FROM login_attempts WHERE ip = ?")
      .bind(key)
      .run();
  } catch (e) {
    console.warn("[auth] clear login attempts error:", e.message);
  }
}

async function recordLoginAttempt(env, key) {
  if (!key) return 0;
  try {
    const row = await env.D1.prepare(
      "INSERT INTO login_attempts (ip, attempts, last_attempt) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET attempts = attempts + 1, last_attempt = excluded.last_attempt RETURNING attempts",
    )
      .bind(key, Date.now())
      .first();
    return Number(row?.attempts || 0);
  } catch (e) {
    console.warn("[auth] recordLoginFailure error:", e.message);
  }
  return 0;
}

async function recordLoginFailure(env, ip, accountKey) {
  const [ipAttempts, accountAttempts] = await Promise.all([
    recordLoginAttempt(env, ip),
    accountKey ? recordLoginAttempt(env, accountKey) : Promise.resolve(0),
  ]);
  return { ipAttempts, accountAttempts };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function boundedPositiveNumber(value, fallback, max) {
  return Math.min(positiveNumber(value, fallback), max);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkLoginAccountThrottled(env, accountKey) {
  if (!accountKey) return { throttled: false, attempts: 0, delayMs: 0 };
  const now = Date.now();
  const threshold = positiveNumber(
    env.LOGIN_ACCOUNT_THROTTLE_ATTEMPTS,
    LOGIN_ACCOUNT_THROTTLE_ATTEMPTS,
  );
  const delayMs = boundedPositiveNumber(
    env.LOGIN_ACCOUNT_DELAY_MS,
    LOGIN_ACCOUNT_DELAY_MS,
    3000,
  );
  try {
    const row = await env.D1.prepare(
      "SELECT attempts, last_attempt FROM login_attempts WHERE ip = ?",
    )
      .bind(accountKey)
      .first();
    const attempts = Number(row?.attempts || 0);
    const lastAttempt = Number(row?.last_attempt || 0);
    if (attempts >= threshold && now - lastAttempt < LOGIN_LOCKOUT_MS) {
      return { throttled: true, attempts, delayMs };
    }
    if (now - lastAttempt >= LOGIN_LOCKOUT_MS) {
      await clearLoginAttempt(env, accountKey);
    }
  } catch (e) {
    console.warn("[auth] checkLoginAccountThrottled error:", e.message);
  }
  return { throttled: false, attempts: 0, delayMs: 0 };
}

async function shouldSendLoginAlert(env, ip) {
  const now = Date.now();
  const cooldownMs =
    positiveNumber(
      env.LOGIN_ALERT_COOLDOWN_SECONDS,
      LOGIN_ALERT_COOLDOWN_MS / 1000,
    ) * 1000;
  const key = `login:${ip}`;
  try {
    const row = await env.D1.prepare(
      "SELECT last_alert FROM login_alerts WHERE key = ?",
    )
      .bind(key)
      .first();
    const lastAlert = Number(row?.last_alert || 0);
    if (now - lastAlert < cooldownMs)
      return { ok: false, cooldownSeconds: Math.round(cooldownMs / 1000) };
    await env.D1.prepare(
      "INSERT OR REPLACE INTO login_alerts (key, last_alert) VALUES (?, ?)",
    )
      .bind(key, now)
      .run();
    return { ok: true, cooldownSeconds: Math.round(cooldownMs / 1000) };
  } catch {
    return { ok: false, cooldownSeconds: Math.round(cooldownMs / 1000) };
  }
}

async function notifyLoginFailureBurst(
  env,
  request,
  username,
  ip,
  attempts,
  context,
) {
  const alert = await shouldSendLoginAlert(env, ip);
  if (!alert.ok) return;
  const endpoints = await loadWebhookEndpoints(env);
  await notifyLoginBurst(endpoints, {
    ip,
    username: String(username || ""),
    attempts,
    threshold: LOGIN_MAX_ATTEMPTS,
    lockoutSeconds: Math.round(LOGIN_LOCKOUT_MS / 1000),
    cooldownSeconds: alert.cooldownSeconds,
    userAgent: request.headers.get("user-agent") || "",
  });
}

export async function handleLogin(request, env, context = {}) {
  await ensureCoreTables(env);
  const { username, password } = await request.json().catch(() => ({}));
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const accountKey = loginAccountKey(username);

  const attemptResult = await checkLoginLocked(env, ip);
  if (attemptResult.locked) {
    return jsonResponse({ success: false, message: "Too many attempts" }, 429);
  }

  const accountThrottle = await checkLoginAccountThrottled(env, accountKey);
  if (accountThrottle.throttled) {
    await sleep(accountThrottle.delayMs);
  }

  if (username === env.ADMIN_USERNAME && await timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    await Promise.all([clearLoginAttempt(env, ip), clearLoginAttempt(env, accountKey)]);
    const csrf = createCsrfToken();
    const now = Math.floor(Date.now() / 1000);
    const header = encodeBase64Url(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    );
    const payload = encodeBase64Url(
      JSON.stringify({
        role: "admin",
        csrf,
        iat: now,
        exp: now + SESSION_TTL_SECONDS,
      }),
    );
    const signature = await signHmac(env, `${header}.${payload}`);
    return jsonResponse({ success: true, csrf }, 200, {
      "Set-Cookie": `${cookieName(request)}=${header}.${payload}.${signature}; ${cookieAttributes(request)}`,
    });
  }

  const { ipAttempts } = await recordLoginFailure(env, ip, accountKey);
  if (ipAttempts >= LOGIN_MAX_ATTEMPTS)
    waitForWebhook(
      context,
      notifyLoginFailureBurst(env, request, username, ip, ipAttempts, context),
    );
  return jsonResponse({ success: false }, 401);
}

export function handleLogout(request) {
  const name = cookieName(request);
  return jsonResponse({ success: true }, 200, {
    "Set-Cookie": `${name}=; ${cookieAttributes(request, 0)}`,
  });
}
