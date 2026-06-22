import { base64UrlToUint8Array, encodeBase64Url } from "./common.js";

export const RECOMMENDED_TOKEN_SECRET_LENGTH = 32;

export function tokenSecretStatus(env) {
  const value = String(env?.TOKEN_SECRET || "");
  const configured = Boolean(value);
  return {
    configured,
    recommended: configured && value.length >= RECOMMENDED_TOKEN_SECRET_LENGTH,
    length: configured ? value.length : 0,
    source: configured
      ? "TOKEN_SECRET"
      : env?.ADMIN_PASSWORD
        ? "ADMIN_PASSWORD"
        : "fallback",
  };
}

export function getTokenSecret(env) {
  const secret = env?.TOKEN_SECRET || env?.ADMIN_PASSWORD;
  if (!secret) {
    console.warn(
      "[WARN] Neither TOKEN_SECRET nor ADMIN_PASSWORD is set. Falling back to insecure default key \"o-drive\".",
    );
  }
  return String(secret || "o-drive");
}

async function hmacKey(env, usage) {
  const cacheKey = usage === "sign" ? "_hmacSignKey" : "_hmacVerifyKey";
  if (env[cacheKey]) return env[cacheKey];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getTokenSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
  env[cacheKey] = key;
  return key;
}

export async function signHmac(env, value) {
  const key = await hmacKey(env, "sign");
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return encodeBase64Url(String.fromCharCode(...new Uint8Array(sig)));
}

export async function verifyHmac(env, value, signature) {
  if (!value || !signature) return false;
  const key = await hmacKey(env, "verify");
  return crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToUint8Array(signature),
    new TextEncoder().encode(value),
  );
}
