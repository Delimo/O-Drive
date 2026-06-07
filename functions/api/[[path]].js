import { ensureCoreTables, jsonResponse } from './lib/common.js';
import { verifyAuth, verifyCsrf, handleLogin, handleLogout } from './lib/auth.js';
import { loadProtectedPaths, checkProtectedAccess } from './lib/protected-paths.js';
import { loadHiddenPaths, getR2KeyFromPath, canReadKey, canWriteUserKey, isAdmin } from './lib/request-context.js';
import { checkRateLimit, getClientIp } from './lib/rate-limiter.js';
import { resolveAdminRoute, resolvePublicRoute } from './lib/router.js';

const csrfProtectedRoutes = [
  ['/api/admin/settings/hidden', ['POST', 'DELETE']],
  ['/api/admin/settings/protected', ['POST', 'DELETE']],
  ['/api/admin/maintenance', ['POST']],
  ['/api/paste', ['POST']],
  ['/api/files', ['POST', 'PUT']],
  ['/api/batch-delete', ['POST']],
  ['/api/operation-estimate', ['POST']],
  ['/api/trash/restore', ['POST']],
  ['/api/trash/delete', ['DELETE']],
  ['/api/trash/clear', ['DELETE']],
  ['/api/trash/cleanup', ['POST']],
  ['/api/admin/settings/trash-retention', ['PUT']],
  ['/api/admin/settings/quota', ['PUT']],
  ['/api/admin/settings/webhooks', ['PUT', 'POST']],
  ['/api/mkdir', ['POST']],
  ['/api/upload-multipart/create', ['POST']],
  ['/api/upload-multipart/part', ['PUT']],
  ['/api/upload-multipart/complete', ['POST']],
  ['/api/upload-multipart/abort', ['POST']],
  ['/api/save-text/', ['POST']],
];

function needsCsrf(path, method) {
  return csrfProtectedRoutes.some(([prefix, methods]) => path.startsWith(prefix) && methods.includes(method));
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    await ensureCoreTables(env);

    // Global API rate limit: 120 requests per minute per IP (skip file download streams)
    if (!path.startsWith('/api/download/') && !path.startsWith('/api/preview/') && !path.startsWith('/api/thumbnail/')) {
      const rl = await checkRateLimit(env.D1, `ip:${getClientIp(request)}`, 120, 60000);
      if (!rl.allowed) {
        return jsonResponse(
          { success: false, code: 'RATE_LIMITED', message: 'Rate limit exceeded' },
          429,
          { 'Retry-After': String(rl.retryAfter) },
        );
      }
    }

    if (path === '/api/login' && method === 'POST') return await handleLogin(request, env, context);
    if (path === '/api/logout') return handleLogout(request);

    const auth = await verifyAuth(request, env);
    if (!auth) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
    if (path === '/api/auth/role') return jsonResponse({ role: auth.role, csrf: auth.role === 'admin' ? auth.csrf : undefined });

    const hiddenPaths = await loadHiddenPaths(env);
    const protectedPaths = await loadProtectedPaths(env);
    const r2Key = getR2KeyFromPath(path);

    if (!canReadKey(auth, r2Key, hiddenPaths)) return jsonResponse({ success: false, message: 'Forbidden' }, 403);
    if (isAdmin(auth) && needsCsrf(path, method) && !verifyCsrf(request, auth)) {
      return jsonResponse({ success: false, message: 'Invalid CSRF token' }, 403);
    }
    if (isAdmin(auth) && r2Key && needsCsrf(path, method) && !canWriteUserKey(r2Key)) {
      return jsonResponse({ success: false, message: 'Reserved system path' }, 403);
    }

    // Protected path access check for download/preview/thumbnail
    if (r2Key && (path.startsWith('/api/thumbnail/') || path.startsWith('/api/download/') || path.startsWith('/api/preview/'))) {
      const access = await checkProtectedAccess(request, env, auth, protectedPaths, r2Key);
      if (!access.ok) return jsonResponse({ success: false, code: 'password_required', path: access.rule.path, message: 'Password required' }, 403);
    }

    // Admin routes
    if (isAdmin(auth)) {
      const adminResult = await resolveAdminRoute(env, request, method, path, url, r2Key, hiddenPaths, protectedPaths, context);
      if (adminResult) return adminResult;
    }

    // Public routes (accessible by any authenticated user)
    const publicResult = await resolvePublicRoute(env, request, url, path, method, hiddenPaths, auth, r2Key, protectedPaths, context);
    if (publicResult) return publicResult;

    return jsonResponse({ success: false, message: 'Not Found' }, 404);
  } catch (err) {
    const status = Number(err.status || 500);
    const message = status >= 500 ? 'Internal Server Error' : err.message;
    return jsonResponse({ success: false, message }, status);
  }
}
