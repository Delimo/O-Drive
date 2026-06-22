import { ensureFileIndexTable, ensureStorageUsageTable } from "./ensure.js";

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
    if (row)
      await removeStorageUsage(
        env,
        row.storage_id || "r2",
        row.object_key || key,
      );
  } catch (_) {}
}

export async function deleteFileIndexPrefix(env, prefix) {
  if (!(await ensureFileIndexTable(env))) return;
  const clean = String(prefix || "").replace(/^\/+|\/+$/g, "");
  try {
    const rows = await env.D1.prepare(
      "SELECT DISTINCT storage_id, COALESCE(NULLIF(object_key, ''), path) AS object_key FROM file_index WHERE path = ? OR path LIKE ?",
    )
      .bind(clean, `${clean}/%`)
      .all();
    await env.D1.prepare("DELETE FROM file_index WHERE path = ? OR path LIKE ?")
      .bind(clean, `${clean}/%`)
      .run();
    for (const row of rows.results || []) {
      await removeStorageUsage(env, row.storage_id || "r2", row.object_key);
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
