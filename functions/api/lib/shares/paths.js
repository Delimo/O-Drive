import {
  isReservedKey,
  normalizeName,
} from "../common/index.js";

export function normalizeSharePath(path) {
  const clean = String(path || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!clean) throw new Error("Invalid path");
  const normalized = clean.split("/").map(normalizeName).join("/");
  if (isReservedKey(normalized)) {
    const err = new Error("Reserved system path");
    err.status = 403;
    throw err;
  }
  return normalized;
}

export function cleanShareSubPath(path = "") {
  const clean = String(path || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  const normalized = clean.split("/").map(normalizeName).join("/");
  if (isReservedKey(normalized)) {
    const err = new Error("Reserved system path");
    err.status = 403;
    throw err;
  }
  return normalized;
}

export function childPath(root, subPath = "") {
  const cleanRoot = normalizeSharePath(root);
  const cleanSub = cleanShareSubPath(subPath);
  return cleanSub ? `${cleanRoot}/${cleanSub}` : cleanRoot;
}

export function ttlToExpiresAt(body) {
  const explicit = Number(body.expiresAt || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const days = Number(body.expiresInDays || body.days || 7);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Date.now() + Math.min(days, 3650) * 24 * 60 * 60 * 1000;
}

export function normalizeSharePathList(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 100) {
    const err = new Error("Invalid paths");
    err.status = 400;
    throw err;
  }
  const seen = new Set();
  const normalized = [];
  for (const rawPath of paths) {
    const path = normalizeSharePath(rawPath);
    if (seen.has(path)) continue;
    seen.add(path);
    normalized.push(path);
  }
  if (!normalized.length) {
    const err = new Error("Invalid paths");
    err.status = 400;
    throw err;
  }
  return normalized;
}
