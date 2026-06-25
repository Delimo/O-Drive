/**
 * WebDAV Basic Auth verification.
 * Uses DAV_TOKEN environment variable for token-based authentication.
 */

async function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigA = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(a)),
  );
  const sigB = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  );
  if (sigA.length !== sigB.length) return false;
  let diff = 0;
  for (let i = 0; i < sigA.length; i++) diff |= sigA[i] ^ sigB[i];
  return diff === 0;
}

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
  const token = decoded.slice(colonIndex + 1);

  if (!username || !token) return null;

  // Verify username
  if (!(await timingSafeEqual(username, env.ADMIN_USERNAME))) return null;

  // Verify DAV token
  if (!env.DAV_TOKEN) return null;
  if (!(await timingSafeEqual(token, env.DAV_TOKEN))) return null;

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
