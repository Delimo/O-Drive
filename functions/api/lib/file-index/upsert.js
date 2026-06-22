import { isReservedKey } from "../common/index.js";
import { ensureFileIndexTable, UPSERT_SQL } from "./ensure.js";
import { indexedFileKind, nameOf, parentOf, uploadedMs, indexableKey } from "./helpers.js";
import { ensureStorageUsageTable } from "./ensure.js";

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
  } catch (_) {}
}

export async function upsertFileIndex(env, key, meta = {}) {
  if (!indexableKey(key) || !(await ensureFileIndexTable(env))) return;
  try {
    await env.D1.prepare(UPSERT_SQL)
      .bind(...buildUpsertParams(key, meta))
      .run();
    await addStorageUsage(
      env,
      meta.storageId || meta.storage_id || "r2",
      meta.objectKey || meta.object_key || key,
      Number(meta.size || 0),
    );
  } catch (_) {}
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
