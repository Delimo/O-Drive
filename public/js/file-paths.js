export function encodeR2Path(path = '') {
  return String(path)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

export function apiFileUrl(prefix, path = '') {
  const key = encodeR2Path(path);
  return key ? `${prefix}/${key}` : prefix;
}
