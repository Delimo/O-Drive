import { formatBytes } from "./common.js";
import { indexedFileCount, syncFileIndexFromR2 } from "./file-index.js";

const QUOTA_CONFIG_KEY = "storage_quota_bytes";

function ensureStorageUsage(db) {
  return db
    .prepare(
      `CREATE TABLE IF NOT EXISTS storage_usage (
      storage_id TEXT NOT NULL DEFAULT 'r2',
      object_key TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (storage_id, object_key)
    )`,
    )
    .run()
    .catch(() => {});
}

async function rebuildStorageUsage(db) {
  await ensureStorageUsage(db);
  await db.prepare("DELETE FROM storage_usage").run();
  await db
    .prepare(
      `INSERT INTO storage_usage (storage_id, object_key, size)
     SELECT storage_id, COALESCE(NULLIF(object_key, ''), path), MAX(size)
     FROM file_index GROUP BY storage_id, COALESCE(NULLIF(object_key, ''), path)`,
    )
    .run()
    .catch(() => {});
}

async function ensureStorageUsagePopulated(db) {
  await ensureStorageUsage(db);
  const row = await db
    .prepare("SELECT COUNT(*) as cnt FROM storage_usage")
    .first()
    .catch(() => ({ cnt: 0 }));
  if (!Number(row?.cnt || 0)) await rebuildStorageUsage(db);
}

export async function getStorageQuota(db) {
  try {
    const row = await db
      .prepare("SELECT value FROM kv_config WHERE key = ?")
      .bind(QUOTA_CONFIG_KEY)
      .first();
    return row ? Math.max(0, Number(row.value) || 0) : 0;
  } catch {
    return 0;
  }
}

export async function setStorageQuota(db, bytes) {
  const val = Math.max(0, Math.floor(bytes));
  await db
    .prepare("INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)")
    .bind(QUOTA_CONFIG_KEY, String(val))
    .run();
}

export async function getStorageUsed(db) {
  try {
    await ensureStorageUsagePopulated(db);
    const row = await db
      .prepare("SELECT COALESCE(SUM(size), 0) AS total FROM storage_usage")
      .first();
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

export async function checkQuota(target, incomingBytes = 0) {
  const db = target?.D1 || target;
  let syncedIndex = false;
  let indexTruncated = false;
  const quota = await getStorageQuota(db);
  if (
    quota &&
    target?.D1 &&
    target?.R2 &&
    (await indexedFileCount(target)) === 0
  ) {
    const sync = await syncFileIndexFromR2(target, { maxObjects: 50000 });
    syncedIndex = true;
    indexTruncated = Boolean(sync.truncated);
  }
  const used = await getStorageUsed(db);
  if (!quota) return { allowed: true, used, quota: 0, remaining: Infinity };
  const remaining = Math.max(0, quota - used);
  return {
    allowed: incomingBytes <= remaining,
    used,
    quota,
    remaining,
    syncedIndex,
    indexTruncated,
  };
}
