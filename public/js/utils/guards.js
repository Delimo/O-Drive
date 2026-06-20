export function inferKind(item) {
  if (item.kind === "folder" || item.virtual) return "folder";
  const key = (item.fullKey || item.path || item.name || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(key)) return "image";
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(key)) return "video";
  if (/\.(mp3|wav|aac|flac|ogg|m4a)$/.test(key)) return "audio";
  if (/\.pdf$/.test(key)) return "pdf";
  if (/\.(zip|rar|7z|tar|gz|tgz)$/.test(key)) return "archive";
  if (/\.(js|ts|tsx|jsx|json|css|less|expression)$/.test(key)) return "code";
  if (/\.(md|txt|csv|html|xml|yml|yaml)$/.test(key)) return "text";
  if (/\.(java|py|rb|php|rust|vbs|script|sh|bash)$/.test(key)) return "script";
  if (/\.(doc|docx|ppt|pptx|xls|xlsx)$/.test(key)) return "document";
  if (/\.(exe|msi|dmg|apk|ipa|dll|deb|rpm)$/.test(key)) return "app";
  if (/\.(obj|fbx|glb|gltf|stl|3ds)$/.test(key)) return "model3d";
  return "file";
}

const PREVIEWABLE_KINDS = new Set(["image", "video", "audio", "pdf", "text"]);

export function canPreview(entry) {
  const kind = entry.kind || inferKind(entry);
  return PREVIEWABLE_KINDS.has(kind);
}

export function iconForKind(kind, icons) {
  return icons[kind] || icons.file;
}

export function iconClass(kind) {
  if (["folder", "image", "video", "audio", "pdf", "archive", "code", "script", "document", "model3d"].includes(kind))
    return kind;
  return "file";
}

export function isProtectedEntry(entry) {
  return Boolean(
    entry?.protected ||
    entry?.isProtected ||
    entry?.locked ||
    entry?.requiresPassword,
  );
}
