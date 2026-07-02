import { ensureCoreTables, jsonResponse, assertBodySize } from './lib/common/index.js';
import { verifyAuth, verifyCsrf, handleLogin, handleLogout } from './lib/auth.js';
import { loadProtectedPaths, checkProtectedAccess } from './lib/protected-paths.js';
import { loadHiddenPaths, getR2KeyFromPath, canReadKey, canWriteUserKey, isAdmin } from './lib/request-context.js';
import { checkRateLimitD1, getClientIp } from './lib/rate-limiter.js';
import { resolveAdminRoute, resolvePublicRoute } from './lib/router.js';
import { handlePublicShare } from './lib/shares.js';
import { getApiRoutePolicy } from './lib/route-policy.js';

let coreTablesReady;

function ensureCoreTablesOnce(env) {
  coreTablesReady ||= ensureCoreTables(env).catch(err => {
    coreTablesReady = null;
    throw err;
  });
  return coreTablesReady;
}

function unauthorizedResponse() {
  return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
}

function authRoleResponse(auth, env) {
  return jsonResponse({
    role: auth.role,
    csrf: auth.role === 'admin' ? auth.csrf : undefined,
    guestMode: env.ALLOW_GUEST === "true",
  });
}

function statusForKnownClientError(err) {
  const message = String(err?.message || "");
  if (message === "Reserved system path") return 403;
  if (/^Invalid (name|path)/.test(message)) return 400;
  return 0;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const routePolicy = getApiRoutePolicy(path, method);
  let auth = null;

  try {
    await ensureCoreTablesOnce(env);

    // Global API rate limit: 120 requests per minute per IP (skip file download streams)
    if (routePolicy.rateLimit) {
      const rl = await checkRateLimitD1(env, `ip:${getClientIp(request)}`, 120, 60000);
      if (!rl.allowed) {
        return jsonResponse(
          { success: false, code: 'RATE_LIMITED', message: 'Rate limit exceeded' },
          429,
          { 'Retry-After': String(rl.retryAfter) },
        );
      }
    }

    if (routePolicy.hasBody) assertBodySize(request, routePolicy.uploadBody);

    if (routePolicy.preAuth === 'login') return await handleLogin(request, env, context);
    if (routePolicy.preAuth === 'logout') return handleLogout(request);
    if (routePolicy.preAuth === 'publicShare') {
      const shareResult = await handlePublicShare(env, request, path);
      if (shareResult) return shareResult;
    }

    auth = await verifyAuth(request, env);
    if (!auth) return unauthorizedResponse();
    if (routePolicy.postAuth === 'authRole') return authRoleResponse(auth, env);

    const [hiddenPaths, protectedPaths] = await Promise.all([loadHiddenPaths(env), loadProtectedPaths(env)]);
    const r2Key = getR2KeyFromPath(path);

    if (!canReadKey(auth, r2Key, hiddenPaths)) return jsonResponse({ success: false, message: 'Forbidden' }, 403);
    if (isAdmin(auth) && routePolicy.csrf && !(await verifyCsrf(request, auth))) {
      return jsonResponse({ success: false, message: 'Invalid CSRF token' }, 403);
    }
    if (isAdmin(auth) && r2Key && routePolicy.userWritableKey && !canWriteUserKey(r2Key)) {
      return jsonResponse({ success: false, message: 'Reserved system path' }, 403);
    }

    // Protected path access check for download/preview/thumbnail
    if (r2Key && routePolicy.protectedAccess) {
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
    const status = Number(err.status || statusForKnownClientError(err) || 500);
    if (status >= 500)
      console.error('[api]', method, path, err?.stack || err?.message || err);
    const message =
      status >= 500 && (!auth || !isAdmin(auth))
        ? 'Internal Server Error'
        : err.message;
    return jsonResponse({ success: false, message }, status);
  }
}
