import { base64UrlToUint8Array, encodeBase64Url } from './common.js';

export const RECOMMENDED_TOKEN_SECRET_LENGTH = 32;

export function tokenSecretStatus(env) {
  const value = String(env?.TOKEN_SECRET || '');
  const configured = Boolean(value);
  return {
    configured,
    recommended: configured && value.length >= RECOMMENDED_TOKEN_SECRET_LENGTH,
    length: configured ? value.length : 0,
    source: configured ? 'TOKEN_SECRET' : (env?.ADMIN_PASSWORD ? 'ADMIN_PASSWORD' : 'fallback'),
  };
}

export function getTokenSecret(env) {
  return String(env?.TOKEN_SECRET || env?.ADMIN_PASSWORD || 'o-drive');
}

export async function signHmac(env, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getTokenSecret(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeBase64Url(String.fromCharCode(...new Uint8Array(sig)));
}

export async function verifyHmac(env, value, signature) {
  if (!value || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getTokenSecret(env)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToUint8Array(signature),
    new TextEncoder().encode(value)
  );
}
