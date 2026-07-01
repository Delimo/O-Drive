import { isHiddenKey, isReservedKey } from "./common/index.js";

const keyPrefixes = [
  ["/api/files/", 11],
  ["/api/download/", 14],
  ["/api/preview/", 13],
  ["/api/thumbnail/", 15],
  ["/api/folder-stats/", 18],
  ["/api/mkdir/", 11],
  ["/api/save-text/", 15],
];

let _hiddenPathsCache = null;
let _hiddenPathsCacheTime = 0;
const HIDDEN_PATHS_CACHE_TTL = 30000;

export function clearHiddenPathsCache() {
  _hiddenPathsCache = null;
  _hiddenPathsCacheTime = 0;
}

export async function loadHiddenPaths(env) {
  if (_hiddenPathsCache && Date.now() - _hiddenPathsCacheTime < HIDDEN_PATHS_CACHE_TTL) {
    return _hiddenPathsCache;
  }
  try {
    const res = await env.D1.prepare(
      "SELECT key FROM settings WHERE value = 'hidden'",
    ).all();
    _hiddenPathsCache = res.results.map((r) => r.key).filter(Boolean);
    _hiddenPathsCacheTime = Date.now();
    return _hiddenPathsCache;
  } catch (e) {
    return [];
  }
}

export function getR2KeyFromPath(path) {
  const match = keyPrefixes.find(([prefix]) => path.startsWith(prefix));
  return match ? decodeURIComponent(path.slice(match[1])) : "";
}

export function canReadKey(auth, key, hiddenPaths) {
  if (key && isReservedKey(key)) return auth.role === "admin";
  return auth.role === "admin" || !isHiddenKey(key, hiddenPaths);
}

export function canWriteUserKey(key) {
  return !isReservedKey(key);
}

export function isAdmin(auth) {
  return auth.role === "admin";
}
