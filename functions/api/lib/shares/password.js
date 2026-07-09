import { jsonResponse, parseCookie, pbkdf2Hex, timingSafeEqual } from "../common/index.js";
import { signHmac } from "../secrets.js";
import {
  SHARE_ACCESS_TTL_SECONDS,
  SHARE_PASSWORD_ITERATIONS,
} from "./constants.js";

export async function hashSharePassword(password, salt) {
  const hash = await pbkdf2Hex(password, salt);
  return `pbkdf2-sha256$${SHARE_PASSWORD_ITERATIONS}$${hash}`;
}

export async function verifySharePassword(password, row) {
  const stored = String(row?.password_hash || "");
  const salt = String(row?.password_salt || "");
  if (!stored || !salt) return true;
  const parts = stored.split("$");
  if (parts[0] !== "pbkdf2-sha256" || parts.length !== 3) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000) return false;
  const candidate = await pbkdf2Hex(password, salt, iterations);
  return candidate === parts[2];
}

function isSecureRequest(request) {
  return request && new URL(request.url).protocol === "https:";
}

export function cookieAttributes(request, maxAge = SHARE_ACCESS_TTL_SECONDS) {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function shareAccessCookieName(token) {
  return `share_access_${token.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

export async function signShareAccess(env, token, exp) {
  const value = `${token}.${exp}`;
  return `${value}.${await signHmac(env, value)}`;
}

export async function hasShareAccess(env, request, token, row) {
  if (!row?.password_hash) return true;
  const value = parseCookie(request, shareAccessCookieName(token));
  if (!value) return false;
  const [cookieToken, exp, signature] = value.split(".");
  if (
    cookieToken !== token ||
    !exp ||
    !signature ||
    Date.now() >= Number(exp) * 1000
  )
    return false;
  return timingSafeEqual(value, await signShareAccess(env, token, Number(exp)));
}

export function sharePasswordRequiredResponse(item) {
  return jsonResponse(
    {
      success: false,
      code: "SHARE_PASSWORD_REQUIRED",
      message: "Share password required",
      hasPassword: true,
      item,
    },
    403,
  );
}
