import { formatBytes } from "../common/index.js";
import { ensureFileIndexTable, ensureStorageUsageTable } from "./ensure.js";
import { indexedFileCount } from "./helpers.js";

const STORAGE_USED_CACHE_TTL = 30000;
const storageUsedCache = {};

export function clearStorageUsedCache() {
  for (const k of Object.keys(storageUsedCache)) delete storageUsedCache[k];
}

export async function getIndexedStorageUsed(env, storageId = "r2") {
  const cached = storageUsedCache[storageId];
  if (cached && Date.now() - cached.ts < STORAGE_USED_CACHE_TTL) return cached.value;
  if (!(await ensureFileIndexTable(env))) return 0;
  let result = 0;
  try {
    await ensureStorageUsageTable(env);
    const row = await env.D1.prepare(
      "SELECT COALESCE(SUM(size), 0) AS total FROM storage_usage WHERE storage_id = ?",
    )
      .bind(storageId)
      .first();
    if (row?.total != null) { result = Number(row.total); } else {
      const r = await env.D1.prepare(
        "SELECT COALESCE(SUM(size), 0) AS total FROM (SELECT storage_id, COALESCE(NULLIF(object_key, ''), path) AS object_key, MAX(size) AS size FROM file_index WHERE storage_id = ? GROUP BY storage_id, COALESCE(NULLIF(object_key, ''), path))",
      )
        .bind(storageId)
        .first();
      result = Number(r?.total || 0);
    }
  } catch (_) { result = 0; }
  storageUsedCache[storageId] = { value: result, ts: Date.now() };
  return result;
}

export async function fileIndexStatus(env) {
  if (!(await ensureFileIndexTable(env)))
    return { count: 0, totalSize: 0, latestUpdatedAt: 0 };
  try {
    const row = await env.D1.prepare(
      "SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as totalSize, COALESCE(MAX(updated_at), 0) as latestUpdatedAt FROM file_index",
    ).first();
    return {
      count: Number(row?.count || 0),
      totalSize: Number(row?.totalSize || 0),
      latestUpdatedAt: Number(row?.latestUpdatedAt || 0),
    };
  } catch (_) {
    return { count: 0, totalSize: 0, latestUpdatedAt: 0 };
  }
}

export async function getIndexedStats(env) {
  const count = await indexedFileCount(env);
  if (!count) return null;
  try {
    const [kindRows, totalRow, latestRows] = await env.D1.batch([
      env.D1.prepare(
        "SELECT kind, COUNT(*) as count, SUM(size) as size FROM file_index GROUP BY kind",
      ),
      env.D1.prepare(
        "SELECT COUNT(*) as count, SUM(size) as totalSize FROM file_index",
      ),
      env.D1.prepare(
        "SELECT path, size, uploaded_at, updated_at FROM file_index ORDER BY uploaded_at DESC LIMIT 10",
      ),
    ]);
    const allKinds = [
      "image",
      "video",
      "audio",
      "pdf",
      "text",
      "archive",
      "exe",
      "other",
    ];
    const breakdown = {};
    for (const kind of allKinds) {
      breakdown[kind] = { count: 0, size: 0, sizeFormatted: formatBytes(0) };
    }
    for (const row of kindRows.results || []) {
      const kind = row.kind || "other";
      const size = Number(row.size || 0);
      breakdown[kind] = {
        count: Number(row.count || 0),
        size,
        sizeFormatted: formatBytes(size),
      };
    }
    const total = totalRow.results?.[0] || {};
    const totalSize = Number(total.totalSize || 0);
    return {
      files: {
        count: Number(total.count || 0),
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        folderMarkers: 0,
        truncated: false,
      },
      breakdown,
      latest: (latestRows.results || []).map((row) => ({
        key: row.path,
        size: Number(row.size || 0),
        sizeFormatted: formatBytes(row.size || 0),
        uploaded: Number(row.uploaded_at || row.updated_at || 0),
      })),
    };
  } catch (_) {
    console.warn("[file-index] getIndexedStats batch query failed");
    return null;
  }
}
