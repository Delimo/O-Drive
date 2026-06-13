export function inferKind(item) {
  if (item.kind === 'folder' || item.virtual) return 'folder';
  const key = (item.fullKey || item.path || item.name || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(key)) return 'image';
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(key)) return 'video';
  if (/\.(mp3|wav|aac|flac|ogg|m4a)$/.test(key)) return 'audio';
  if (/\.pdf$/.test(key)) return 'pdf';
  if (/\.(zip|rar|7z|tar|gz|tgz)$/.test(key)) return 'archive';
  if (/\.(js|ts|tsx|jsx|json|md|txt|csv|html|css|xml|yml|yaml)$/.test(key)) return 'text';
  if (/\.(exe|msi|dmg|apk|ipa)$/.test(key)) return 'app';
  return 'file';
}

export function iconForKind(kind, icons) {
  return icons[kind] || icons.file;
}

export function iconClass(kind) {
  if (['folder', 'image', 'video', 'audio', 'pdf', 'archive'].includes(kind)) return kind;
  return 'file';
}

export function isProtectedEntry(entry) {
  return Boolean(
    entry?.protected
    || entry?.isProtected
    || entry?.locked
    || entry?.requiresPassword,
  );
}
