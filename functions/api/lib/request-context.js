import { isHiddenKey } from './common.js';

const keyPrefixes = [
  ['/api/files/', 11],
  ['/api/download/', 14],
  ['/api/preview/', 13],
  ['/api/thumbnail/', 15],
  ['/api/mkdir/', 11],
  ['/api/save-text/', 15],
];

export async function loadHiddenPaths(env) {
  try {
    const res = await env.DB.prepare('SELECT key FROM settings').all();
    return res.results.map(r => r.key).filter(Boolean);
  } catch (e) {
    return [];
  }
}

export function getR2KeyFromPath(path) {
  const match = keyPrefixes.find(([prefix]) => path.startsWith(prefix));
  return match ? decodeURIComponent(path.slice(match[1])) : '';
}

export function canReadKey(auth, key, hiddenPaths) {
  return auth.role === 'admin' || !isHiddenKey(key, hiddenPaths);
}

export function isAdmin(auth) {
  return auth.role === 'admin';
}
