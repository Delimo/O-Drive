import { getClientIp } from './rate-limiter.js';

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_THRESHOLD = 20;
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;
const DEFAULT_BLOCK_MS = 30 * 60 * 1000;
const SAMPLE_LIMIT = 5;

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function settings(env) {
  return {
    windowMs: positiveNumber(env.DOWNLOAD_BURST_WINDOW_SECONDS, DEFAULT_WINDOW_MS / 1000) * 1000,
    threshold: positiveNumber(env.DOWNLOAD_BURST_THRESHOLD, DEFAULT_THRESHOLD),
    cooldownMs: positiveNumber(env.DOWNLOAD_BURST_COOLDOWN_SECONDS, DEFAULT_COOLDOWN_MS / 1000) * 1000,
    blockMs: positiveNumber(env.DOWNLOAD_BURST_BLOCK_SECONDS, DEFAULT_BLOCK_MS / 1000) * 1000,
  };
}

function parseSamples(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(item => String(item || '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function addSample(samples, path) {
  const next = [String(path || ''), ...samples].filter(Boolean);
  return [...new Set(next)].slice(0, SAMPLE_LIMIT);
}

function burstKey(request, auth) {
  return {
    ip: getClientIp(request),
    role: auth?.role || 'unknown',
  };
}

export async function checkDownloadBlocked(env, request, auth) {
  if (!env?.D1) return { blocked: false, retryAfter: 0 };
  const now = Date.now();
  const { ip, role } = burstKey(request, auth);
  const key = `download:${role}:${ip}`;
  try {
    const row = await env.D1.prepare('SELECT blocked_until FROM download_bursts WHERE key = ?').bind(key).first();
    const blockedUntil = Number(row?.blocked_until || 0);
    if (blockedUntil > now) {
      return { blocked: true, retryAfter: Math.ceil((blockedUntil - now) / 1000), ip, role };
    }
  } catch {}
  return { blocked: false, retryAfter: 0, ip, role };
}

export async function recordDownloadBurst(env, request, auth, r2Key) {
  if (!env?.D1 || !r2Key) return null;

  const { windowMs, threshold, cooldownMs, blockMs } = settings(env);
  const now = Date.now();
  const { ip, role } = burstKey(request, auth);
  const key = `download:${role}:${ip}`;
  const path = `/${r2Key}`;

  try {
    if (Math.random() < 0.01) {
      await env.D1.prepare('DELETE FROM download_bursts WHERE window_start < ? AND last_alert < ?')
        .bind(now - windowMs, now - cooldownMs)
        .run();
    }

    const row = await env.D1.prepare('SELECT request_count, window_start, last_alert, blocked_until, sample_paths FROM download_bursts WHERE key = ?')
      .bind(key)
      .first();

    const previousAlert = Number(row?.last_alert || 0);
    if (!row || Number(row.window_start || 0) < now - windowMs) {
      await env.D1.prepare(
        'INSERT OR REPLACE INTO download_bursts (key, request_count, window_start, last_alert, blocked_until, sample_paths) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(key, 1, now, previousAlert, Number(row?.blocked_until || 0), JSON.stringify([path])).run();
      return null;
    }

    const count = Number(row.request_count || 0) + 1;
    const windowStart = Number(row.window_start || now);
    const samplePaths = addSample(parseSamples(row.sample_paths), path);
    const shouldAlert = count >= threshold && now - previousAlert >= cooldownMs;
    const lastAlert = shouldAlert ? now : previousAlert;
    const blockedUntil = count >= threshold ? Math.max(Number(row.blocked_until || 0), now + blockMs) : Number(row.blocked_until || 0);

    await env.D1.prepare(
      'UPDATE download_bursts SET request_count = ?, last_alert = ?, blocked_until = ?, sample_paths = ? WHERE key = ?'
    ).bind(count, lastAlert, blockedUntil, JSON.stringify(samplePaths), key).run();

    if (!shouldAlert) return null;
    return {
      ip,
      role,
      count,
      threshold,
      windowSeconds: Math.round(windowMs / 1000),
      cooldownSeconds: Math.round(cooldownMs / 1000),
      blockSeconds: Math.round(blockMs / 1000),
      blockedUntil: new Date(blockedUntil).toISOString(),
      windowStartedAt: new Date(windowStart).toISOString(),
      samplePaths,
      userAgent: request.headers.get('user-agent') || '',
    };
  } catch {
    return null;
  }
}
