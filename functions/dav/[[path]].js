/**
 * WebDAV entry point.
 * Handles /dav/* requests with Basic Auth and WebDAV method dispatch.
 *
 * Supported methods: OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL, MOVE, COPY
 * DAV Level: 1 (no LOCK/UNLOCK)
 */
import { verifyBasicAuth, unauthorizedResponse } from "./lib/auth.js";
import { handlePropfind } from "./lib/propfind.js";
import {
  handleGet,
  handlePut,
  handleDelete,
  handleMkcol,
  handleMove,
  handleCopy,
} from "./lib/methods.js";
import { ensureCoreTables } from "../api/lib/common/index.js";
import { checkRateLimitD1, getClientIp } from "../api/lib/rate-limiter.js";

const ALLOW_METHODS = "OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND";
const DAV_RATE_LIMIT = 30;
const DAV_RATE_WINDOW = 60000;
let coreTablesReady;

function ensureCoreTablesOnce(env) {
  coreTablesReady ||= ensureCoreTables(env).catch(err => {
    coreTablesReady = null;
    throw err;
  });
  return coreTablesReady;
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;
  const url = new URL(request.url);
  const path = url.pathname;

  // WebDAV is enabled when admin credentials are configured.
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    return new Response("WebDAV not configured", { status: 404 });
  }

  // OPTIONS does not require authentication
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: ALLOW_METHODS,
        DAV: "1",
        "MS-Author-Via": "DAV",
        "Content-Length": "0",
      },
    });
  }

  await ensureCoreTablesOnce(env);

  // Rate limit per IP before authentication
  const ip = getClientIp(request);
  const rl = await checkRateLimitD1(env, `dav:${ip}`, DAV_RATE_LIMIT, DAV_RATE_WINDOW);
  if (!rl.allowed) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(rl.retryAfter),
        "Content-Type": "text/plain",
      },
    });
  }

  // Basic Auth
  const auth = await verifyBasicAuth(request, env);
  if (!auth) return unauthorizedResponse();

  // Resolve r2Key from path: /dav/<key> or /dav/
  const r2Key = decodeURIComponent(path.replace(/^\/dav\/?/, ""));

  try {
    switch (method) {
      case "PROPFIND":
        return await handlePropfind(env, request, r2Key);

      case "GET":
      case "HEAD":
        return await handleGet(env, request, r2Key, method);

      case "PUT":
        return await handlePut(env, request, r2Key);

      case "DELETE":
        return await handleDelete(env, r2Key, request);

      case "MKCOL":
        return await handleMkcol(env, r2Key);

      case "MOVE":
        return await handleMove(env, request, r2Key);

      case "COPY":
        return await handleCopy(env, request, r2Key);

      default:
        return new Response("Method Not Allowed", {
          status: 405,
          headers: {
            Allow: ALLOW_METHODS,
            DAV: "1",
          },
        });
    }
  } catch (err) {
    const status = Number(err.status || 500);
    const message = status >= 500 ? "Internal Server Error" : err.message;
    return new Response(message, { status });
  }
}
