import { formatBytes, isReservedKey } from "../common/index.js";
import { ensureFileIndexTable } from "./ensure.js";

export function indexedFileKind(key) {
  const ext = String(key || "")
    .split(".")
    .pop()
    .toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext))
    return "image";
  if (["mp4", "webm", "mov", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (
    [
      "txt",
      "md",
      "json",
      "js",
      "css",
      "html",
      "xml",
      "csv",
      "log",
      "yml",
      "yaml",
    ].includes(ext)
  )
    return "text";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["exe", "msi", "app", "deb", "dmg"].includes(ext)) return "exe";
  return "other";
}

export function nameOf(path) {
  return (
    String(path || "")
      .split("/")
      .pop() || ""
  );
}

export function parentOf(path) {
  const parts = String(path || "").split("/");
  parts.pop();
  return parts.join("/");
}

export function uploadedMs(value) {
  if (!value) return Date.now();
  if (typeof value.getTime === "function") return value.getTime();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function indexableKey(key) {
  return Boolean(
    key && !isReservedKey(key) && !String(key).endsWith("/.folder"),
  );
}

export function normalizeIndexRow(row) {
  if (!row) return null;
  return {
    ...row,
    storage_id: row.storage_id || "r2",
    object_key: row.object_key || row.path,
  };
}

export function mapIndexRow(row) {
  const normalized = normalizeIndexRow(row);
  const size = Number(row.size || 0);
  const time = Number(row.uploaded_at || row.updated_at || 0);
  return {
    name: row.name,
    path: "/" + row.path,
    fullKey: row.path,
    storageId: normalized.storage_id,
    objectKey: normalized.object_key,
    isAlias: normalized.object_key !== row.path,
    sizeFormatted: formatBytes(size),
    rawSize: size,
    time,
  };
}

export async function indexedFileCount(env) {
  if (!(await ensureFileIndexTable(env))) return 0;
  try {
    const row = await env.D1.prepare(
      "SELECT COUNT(*) as count FROM file_index",
    ).first();
    return Number(row?.count || 0);
  } catch (_) {
    return 0;
  }
}
