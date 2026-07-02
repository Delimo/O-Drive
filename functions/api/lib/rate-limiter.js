/**
 * @fileoverview Rate limiting utilities using in-memory Map + TTL.
 *
 * NOTE: This is a best-effort rate limiter. In Cloudflare Workers,
 * each isolate has its own memory space, so the Map is not shared
 * across isolates. This means rate limits can be bypassed by
 * distributed requests hitting different isolates. For stricter
 * enforcement, consider using D1 or KV-backed rate limiting.
 */

const ipRequests = new Map();
const CLEANUP_INTERVAL = 60000;
let lastCleanup = 0;

export function resetRateLimiter() {
  ipRequests.clear();
  lastCleanup = 0;
}

export function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

export function checkRateLimit(key, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = ipRequests.get(key);
  if (!timestamps) {
    timestamps = [];
    ipRequests.set(key, timestamps);
  }

  let valid = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] >= windowStart) timestamps[valid++] = timestamps[i];
  }
  timestamps.length = valid;

  if (timestamps.length >= maxRequests) {
    const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  timestamps.push(now);

  if (ipRequests.size > 10000 && now - lastCleanup > CLEANUP_INTERVAL) {
    lastCleanup = now;
    const cutoff = now - 120000;
    for (const [k, vals] of ipRequests) {
      let v = 0;
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] >= cutoff) vals[v++] = vals[i];
      }
      vals.length = v;
      if (vals.length === 0) ipRequests.delete(k);
    }
  }

  return { allowed: true, remaining: maxRequests - timestamps.length, retryAfter: 0 };
}

export async function checkRateLimitD1(
  env,
  key,
  maxRequests = 60,
  windowMs = 60000,
) {
  if (!env?.D1) return checkRateLimit(key, maxRequests, windowMs);

  const now = Date.now();
  try {
    if (Math.random() < 0.01) {
      await env.D1.prepare("DELETE FROM api_rate_limits WHERE window_start < ?")
        .bind(now - windowMs)
        .run();
    }

    const row = await env.D1.prepare(
      "SELECT request_count, window_start FROM api_rate_limits WHERE key = ?",
    )
      .bind(key)
      .first();

    const windowStart = Number(row?.window_start || 0);
    if (!row || windowStart < now - windowMs) {
      await env.D1.prepare(
        "INSERT OR REPLACE INTO api_rate_limits (key, request_count, window_start) VALUES (?, ?, ?)",
      )
        .bind(key, 1, now)
        .run();
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - 1),
        retryAfter: 0,
      };
    }

    const count = Number(row.request_count || 0);
    if (count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
      };
    }

    const nextCount = count + 1;
    await env.D1.prepare(
      "UPDATE api_rate_limits SET request_count = ? WHERE key = ?",
    )
      .bind(nextCount, key)
      .run();
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - nextCount),
      retryAfter: 0,
    };
  } catch (err) {
    console.warn("[rate-limiter] D1 rate limit error:", err?.message || err);
    return checkRateLimit(key, maxRequests, windowMs);
  }
}

export function withRateLimit(handler, options = {}) {
  const { maxRequests = 60, windowMs = 60000, keyFn } = options;
  return async (request, env, ...args) => {
    const key = keyFn ? keyFn(request, env) : `ip:${getClientIp(request)}`;
    const result = checkRateLimit(key, maxRequests, windowMs);
    if (!result.allowed) {
      return Response.json(
        { success: false, code: "RATE_LIMITED", message: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(result.retryAfter), "X-RateLimit-Limit": String(maxRequests), "X-RateLimit-Remaining": "0" } },
      );
    }
    const response = await handler(request, env, ...args);
    if (response?.headers) {
      response.headers.set("X-RateLimit-Limit", String(maxRequests));
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    }
    return response;
  };
}
