export function base64UrlToUint8Array(value) {
  const base64 =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeBase64Url(value) {
  return btoa(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeBase64UrlJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(value)));
}

export function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function timingSafeEqual(a, b) {
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

export async function pbkdf2Hex(password, salt, iterations = 210000) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}
