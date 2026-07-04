import { formatBytes } from "../common/index.js";
import { EXPIRED_SHARE_AUTO_DELETE_MS } from "./constants.js";
import { normalizeSharePath } from "./paths.js";

export function parseShareItems(row = {}) {
  if (row.target_type !== "bundle") return [];
  try {
    const items = JSON.parse(row.items_json || "[]");
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => ({
        path: normalizeSharePath(item.path),
        name: item.name || String(item.path || "").split("/").pop() || "",
        targetType: item.targetType === "folder" ? "folder" : "file",
        size: Number(item.size || 0),
        sizeFormatted:
          item.targetType === "folder" ? "" : formatBytes(Number(item.size || 0)),
        contentType: item.contentType || "",
      }))
      .filter((item) => item.path);
  } catch (_) {
    return [];
  }
}

export function mapShareItem(path, target) {
  return {
    path,
    name: path.split("/").pop() || path,
    targetType: target.targetType,
    size: Number(target.size || 0),
    contentType: target.contentType || "",
  };
}

export function mapShare(row) {
  const expiresAt = Number(row.expires_at || 0);
  const maxDownloads = Number(row.max_downloads || 0);
  const downloadCount = Number(row.download_count || 0);
  const autoDeleteAt =
    expiresAt > 0 ? expiresAt + EXPIRED_SHARE_AUTO_DELETE_MS : 0;
  const expired = Boolean(expiresAt && expiresAt <= Date.now());
  const exhausted = Boolean(maxDownloads && downloadCount >= maxDownloads);
  const items = parseShareItems(row);
  return {
    token: row.token,
    path: row.path,
    name: row.name,
    targetType: row.target_type || "file",
    itemCount: row.target_type === "bundle" ? items.length : 1,
    items,
    size: Number(row.size || 0),
    sizeFormatted: formatBytes(Number(row.size || 0)),
    contentType: row.content_type || "",
    allowPreview: Number(row.allow_preview ?? 1) === 1,
    allowDownload: Number(row.allow_download ?? 1) === 1,
    hasPassword: Boolean(row.password_hash),
    expiredNotifiedAt: Number(row.expired_notified_at || 0),
    expiresAt,
    expired,
    autoDeleteAt,
    canReactivate: Boolean(expired && !exhausted && autoDeleteAt > Date.now()),
    maxDownloads,
    downloadCount,
    visitCount: Number(row.visit_count || 0),
    accessLogs: Array.isArray(row.accessLogs) ? row.accessLogs : [],
    exhausted,
    createdAt: Number(row.created_at || 0),
    lastAccessedAt: Number(row.last_accessed_at || 0),
    lastAccessIp: row.last_access_ip || "",
  };
}

export function mapFolderEntry(entry = {}, type = "file") {
  const fullKey = String(entry.fullKey || entry.key || "").replace(/^\/+/, "");
  const name = entry.name || fullKey.split("/").pop() || "";
  return {
    name,
    path: "/" + fullKey,
    fullKey,
    targetType: type,
    kind: type,
    size: Number(entry.rawSize ?? entry.size ?? 0),
    sizeFormatted:
      type === "folder" ? "" : formatBytes(Number(entry.rawSize ?? entry.size ?? 0)),
    contentType: entry.contentType || entry.content_type || "",
    uploadedAt: Number(entry.time || entry.uploaded_at || entry.uploadedAt || 0),
  };
}
