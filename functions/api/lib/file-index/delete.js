import { ensureFileIndexTable, ensureStorageUsageTable } from "./ensure.js";
import { listFileIndexPrefix } from "./query.js";
import { clearStorageUsedCache } from "./stats.js";
import { adjustStorageObjectRef } from "../storage-objects.js";

async function removeStorageUsage(env, storageId, objectKey) {
  await ensureStorageUsageTable(env);
  try {
    const row = await env.D1.prepare(
      "SELECT COUNT(*) as cnt FROM file_index WHERE storage_id = ? AND COALESCE(NULLIF(object_key, ''), path) = ?",
    )
      .bind(storageId, objectKey)
      .first();
    if (!Number(row?.cnt || 0)) {
      await env.D1.prepare(
        "DELETE FROM storage_usage WHERE storage_id = ? AND object_key = ?",
      )
        .bind(storageId, objectKey)
        .run();
      clearStorageUsedCache();
    }
  } catch (_) {}
}

export async function deleteFileIndexKey(env, key) {
  if (!(await ensureFileIndexTable(env))) return;
  try {
    const row = await env.D1.prepare(
      "SELECT storage_id, COALESCE(NULLIF(object_key, ''), path) AS object_key FROM file_index WHERE path = ?",
    )
      .bind(key)
      .first();
    await env.D1.prepare("DELETE FROM file_index WHERE path = ?")
      .bind(key)
      .run();
    if (row) {
      await adjustStorageObjectRef(
        env,
        row.storage_id || "r2",
        row.object_key || key,
        -1,
      );
      await removeStorageUsage(
        env,
        row.storage_id || "r2",
        row.object_key || key,
      );
    }
  } catch (_) {}
}

export async function deleteFileIndexPrefix(env, prefix) {
  if (!(await ensureFileIndexTable(env))) return;
  const clean = String(prefix || "").replace(/^\/+|\/+$/g, "");
  if (!clean) return;
  try {
    const rows = await listFileIndexPrefix(env, clean);
    const refCounts = new Map();
    for (const row of rows || []) {
      const storageId = row.storage_id || "r2";
      const objectKey = row.object_key || row.path;
      const refKey = `${storageId}\0${objectKey}`;
      const current = refCounts.get(refKey) || {
        storageId,
        objectKey,
        count: 0,
      };
      current.count++;
      refCounts.set(refKey, current);
    }
    await env.D1.prepare("DELETE FROM file_index WHERE path = ? OR path LIKE ?")
      .bind(clean, `${clean}/%`)
      .run();
    for (const row of refCounts.values()) {
      await adjustStorageObjectRef(
        env,
        row.storageId,
        row.objectKey,
        -row.count,
      );
      await removeStorageUsage(env, row.storageId, row.objectKey);
    }
  } catch (_) {}
}

export async function countFileIndexObjectRefs(
  env,
  storageId = "r2",
  objectKey = "",
) {
  if (!objectKey || !(await ensureFileIndexTable(env))) return 0;
  try {
    const row = await env.D1.prepare(
      "SELECT COUNT(*) as count FROM file_index WHERE storage_id = ? AND COALESCE(NULLIF(object_key, ''), path) = ?",
    )
      .bind(storageId || "r2", objectKey)
      .first();
    return Number(row?.count || 0);
  } catch (_) {
    return 0;
  }
}

export async function updateFileIndexObjectKey(
  env,
  storageId = "r2",
  oldObjectKey = "",
  newObjectKey = "",
) {
  if (!oldObjectKey || !newObjectKey || !(await ensureFileIndexTable(env)))
    return;
  try {
    await env.D1.prepare(
      "UPDATE file_index SET object_key = ?, updated_at = ? WHERE storage_id = ? AND COALESCE(NULLIF(object_key, ''), path) = ?",
    )
      .bind(newObjectKey, Date.now(), storageId || "r2", oldObjectKey)
      .run();
  } catch (_) {}
}
