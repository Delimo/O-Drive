import { isReservedKey } from "../common/index.js";
import { recordStorageObjectReferenceChange } from "../storage-objects.js";
import { ensureFileIndexTable, INSERT_IF_ABSENT_SQL, UPSERT_SQL } from "./ensure.js";
import { indexedFileKind, nameOf, parentOf, uploadedMs, indexableKey } from "./helpers.js";
import { ensureStorageUsageTable } from "./ensure.js";
import { clearStorageUsedCache } from "./stats.js";

export function buildUpsertParams(key, meta = {}) {
  const size = Number(meta.size || 0);
  const contentType = meta.httpMetadata?.contentType || meta.contentType || "";
  const uploadedAt = uploadedMs(meta.uploaded);
  return [
    key,
    meta.storageId || meta.storage_id || "r2",
    meta.objectKey || meta.object_key || key,
    nameOf(key),
    parentOf(key),
    indexedFileKind(key),
    size,
    contentType,
    uploadedAt,
    Date.now(),
  ];
}

async function addStorageUsage(env, storageId, objectKey, size) {
  await ensureStorageUsageTable(env);
  try {
    await env.D1.prepare(
      "INSERT OR REPLACE INTO storage_usage (storage_id, object_key, size) VALUES (?, ?, ?)",
    )
      .bind(storageId, objectKey, Number(size || 0))
      .run();
    clearStorageUsedCache();
  } catch (_) {}
}

async function removeStorageUsageIfUnreferenced(env, storageId, objectKey) {
  if (!objectKey) return;
  await ensureStorageUsageTable(env);
  try {
    const row = await env.D1.prepare(
      "SELECT COUNT(*) as count FROM file_index WHERE storage_id = ? AND COALESCE(NULLIF(object_key, ''), path) = ?",
    )
      .bind(storageId || "r2", objectKey)
      .first();
    if (!Number(row?.count || 0)) {
      await env.D1.prepare(
        "DELETE FROM storage_usage WHERE storage_id = ? AND object_key = ?",
      )
        .bind(storageId || "r2", objectKey)
        .run();
      clearStorageUsedCache();
    }
  } catch (_) {}
}

async function getPreviousIndexRow(env, key) {
  try {
    return await env.D1.prepare("SELECT * FROM file_index WHERE path = ?")
      .bind(key)
      .first();
  } catch (_) {
    return null;
  }
}

function changeCount(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

export async function upsertFileIndex(env, key, meta = {}) {
  if (!indexableKey(key) || !(await ensureFileIndexTable(env))) return false;
  try {
    const previous = await getPreviousIndexRow(env, key);
    const nextStorageId = meta.storageId || meta.storage_id || "r2";
    const nextObjectKey = meta.objectKey || meta.object_key || key;
    await env.D1.prepare(UPSERT_SQL)
      .bind(...buildUpsertParams(key, meta))
      .run();
    await addStorageUsage(
      env,
      nextStorageId,
      nextObjectKey,
      Number(meta.size || 0),
    );
    if (
      previous &&
      ((previous.storage_id || "r2") !== nextStorageId ||
        (previous.object_key || previous.path || key) !== nextObjectKey)
    ) {
      await removeStorageUsageIfUnreferenced(
        env,
        previous.storage_id || "r2",
        previous.object_key || previous.path || key,
      );
    }
    await recordStorageObjectReferenceChange(env, previous, {
      storageId: nextStorageId,
      objectKey: nextObjectKey,
    });
    return true;
  } catch (_) {
    return false;
  }
}

export async function insertFileIndexIfAbsent(env, key, meta = {}) {
  if (!indexableKey(key) || !(await ensureFileIndexTable(env))) return false;
  try {
    const nextStorageId = meta.storageId || meta.storage_id || "r2";
    const nextObjectKey = meta.objectKey || meta.object_key || key;
    const res = await env.D1.prepare(INSERT_IF_ABSENT_SQL)
      .bind(...buildUpsertParams(key, meta))
      .run();
    if (changeCount(res) <= 0) return false;
    await addStorageUsage(
      env,
      nextStorageId,
      nextObjectKey,
      Number(meta.size || 0),
    );
    await recordStorageObjectReferenceChange(env, null, {
      storageId: nextStorageId,
      objectKey: nextObjectKey,
    });
    return true;
  } catch (_) {
    return false;
  }
}

export async function batchUpsertFileIndex(env, entries) {
  if (!(await ensureFileIndexTable(env))) return 0;
  const validEntries = entries.filter(([key]) => indexableKey(key));
  if (!validEntries.length) return 0;
  const BATCH_SIZE = 50;
  let written = 0;
  for (let i = 0; i < validEntries.length; i += BATCH_SIZE) {
    const chunk = validEntries.slice(i, i + BATCH_SIZE);
    try {
      const stmts = chunk.map(([key, meta]) =>
        env.D1.prepare(UPSERT_SQL).bind(...buildUpsertParams(key, meta)),
      );
      await env.D1.batch(stmts);
      written += chunk.length;
    } catch (_) {
      for (const [key, meta] of chunk) {
        try {
          await env.D1.prepare(UPSERT_SQL)
            .bind(...buildUpsertParams(key, meta))
            .run();
          written++;
        } catch (_) {}
      }
    }
  }
  return written;
}
