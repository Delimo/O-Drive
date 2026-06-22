/**
 * @fileoverview Rate limiting utilities using D1.
 */
export function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

export async function checkRateLimit(db, key, maxRequests = 60, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  try {
    await db.prepare("DELETE FROM api_rate_limits WHERE window_start < ?").bind(windowStart).run();
    const row = await db.prepare("SELECT COUNT(*) as count FROM api_rate_limits WHERE key = ? AND window_start >= ?").bind(key, windowStart).first();
    const count = Number(row?.count || 0);
    if (count >= maxRequests) {
      return { allowed: false, remaining: 0, retryAfter: Math.ceil(windowMs / 1000) };
    }
    await db.prepare("INSERT INTO api_rate_limits (key, window_start, level, source) VALUES (?, ?, ?, ?)").bind(key, now, 'global', 'api').run();
    return { allowed: true, remaining: maxRequests - count - 1, retryAfter: 0 };
  } catch {
    return { allowed: true, remaining: maxRequests, retryAfter: 0 };
  }
}

export function withRateLimit(handler, options = {}) {
  const { maxRequests = 60, windowMs = 60000, keyFn } = options;
  return async (request, env, ...args) => {
    const key = keyFn ? keyFn(request, env) : `ip:${getClientIp(request)}`;
    const result = await checkRateLimit(env.D1, key, maxRequests, windowMs);
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
