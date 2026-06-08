export const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
export const videoExts = ['mp4', 'webm'];
export const audioExts = ['mp3', 'wav', 'ogg', 'flac'];
export const textExts = ['txt', 'md', 'js', 'css', 'html', 'json', 'py', 'sh', 'sql', 'php', 'yml', 'yaml', 'xml', 'csv', 'log'];
export const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];

export function getExtension(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

export function getFileKind(name) {
  const ext = getExtension(name);
  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (textExts.includes(ext)) return 'text';
  if (archiveExts.includes(ext)) return 'archive';
  if (['exe', 'msi', 'app', 'deb', 'dmg'].includes(ext)) return 'exe';
  return 'file';
}

export function isImageFile(name) {
  return imageExts.includes(getExtension(name));
}

export function isPreviewable(name) {
  return ['image', 'video', 'audio', 'pdf', 'text'].includes(getFileKind(name));
}
