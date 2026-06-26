/**
 * WebDAV Basic Auth verification.
 * Uses admin credentials (ADMIN_USERNAME + ADMIN_PASSWORD) for authentication.
 */
import { timingSafeEqual } from "../../api/lib/common/crypto.js";

/**
 * Verify HTTP Basic Auth credentials.
 * Returns { role: "admin" } on success, null on failure.
 */
export async function verifyBasicAuth(request, env) {
  const header = request.headers.get("Authorization");
  if (!header || !header.startsWith("Basic ")) return null;

  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch (_) {
    return null;
  }

  const colonIndex = decoded.indexOf(":");
  if (colonIndex < 0) return null;

  const username = decoded.slice(0, colonIndex);
  const password = decoded.slice(colonIndex + 1);

  if (!username || !password) return null;

  // Verify admin credentials
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return null;
  if (!(await timingSafeEqual(username, env.ADMIN_USERNAME))) return null;
  if (!(await timingSafeEqual(password, env.ADMIN_PASSWORD))) return null;

  return { role: "admin" };
}

/** Build the 401 response with WWW-Authenticate header. */
export function unauthorizedResponse() {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="O-Drive WebDAV"',
      "Content-Type": "text/plain",
    },
  });
}
