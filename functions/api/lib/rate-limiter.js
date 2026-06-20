/**
 * @fileoverview API rate limiting middleware using D1 for persistent storage.
 * Provides both per-IP and per-user rate limiting with configurable windows.
 *
 * Uses the existing login_attempts table pattern extended with an api_rate_limits table.
 */

/**
 * Get client IP from request.
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

/**
 * Check and enforce rate limit for a given key.
 * @param {object} db - D1 database
 * @param {string} key - Rate limit key (e.g. 'ip:1.2.3.4' or 'user:admin')
 * @param {number} maxRequests - Max requests allowed in window
 * @param {number} windowMs - Window duration in milliseconds
 * @returns {Promise<{allowed: boolean, remaining: number, retryAfter: number}>}
 */
export async function checkRateLimit(
  db,
  key,
  maxRequests = 60,
  windowMs = 60000,
) {
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Clean up old entries periodically (1% chance)
    if (Math.random() < 0.01) {
      await db
        .prepare("DELETE FROM api_rate_limits WHERE window_start < ?")
        .bind(windowStart)
        .run();
    }

    // Atomic UPSERT with RETURNING: single query instead of INSERT + SELECT
    const row = await db
      .prepare(
        `INSERT INTO api_rate_limits (key, request_count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         request_count = CASE WHEN ? > window_start + ? THEN 1 ELSE request_count + 1 END,
         window_start = CASE WHEN ? > window_start + ? THEN ? ELSE window_start END
       RETURNING request_count, window_start`,
      )
      .bind(key, now, now, windowMs, now, windowMs, now)
      .first();

    if (row.request_count > maxRequests) {
      const retryAfter = Math.ceil((row.window_start + windowMs - now) / 1000);
      return { allowed: false, remaining: 0, retryAfter };
    }

    return {
      allowed: true,
      remaining: maxRequests - row.request_count,
      retryAfter: 0,
    };
  } catch {
    // If rate limiting fails, allow the request (fail open)
    return { allowed: true, remaining: maxRequests, retryAfter: 0 };
  }
}

/**
 * Middleware wrapper that enforces rate limiting on a route.
 * @param {Function} handler - Route handler
 * @param {object} options
 * @param {number} [options.maxRequests=60]
 * @param {number} [options.windowMs=60000]
 * @param {(req: Request, env: object) => string} [options.keyFn]
 * @returns {Function}
 */
export function withRateLimit(handler, options = {}) {
  const { maxRequests = 60, windowMs = 60000, keyFn } = options;

  return async (request, env, ...args) => {
    const key = keyFn ? keyFn(request, env) : `ip:${getClientIp(request)}`;
    const result = await checkRateLimit(env.D1, key, maxRequests, windowMs);

    if (!result.allowed) {
      return Response.json(
        {
          success: false,
          code: "RATE_LIMITED",
          message: "Rate limit exceeded",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfter),
            "X-RateLimit-Limit": String(maxRequests),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    const response = await handler(request, env, ...args);
    // Add rate limit headers to successful responses
    if (response?.headers) {
      response.headers.set("X-RateLimit-Limit", String(maxRequests));
      response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    }
    return response;
  };
}
