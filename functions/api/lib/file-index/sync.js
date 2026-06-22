import { listR2Objects } from "../common/index.js";
import { ensureFileIndexTable } from "./ensure.js";
import { indexableKey } from "./helpers.js";
import { batchUpsertFileIndex } from "./upsert.js";

export async function syncFileIndexFromR2(env, { maxObjects = 20000 } = {}) {
  if (!(await ensureFileIndexTable(env)))
    return { synced: 0, truncated: false };
  const listed = await listR2Objects(env.R2, {}, { maxObjects });
  const entries = (listed.objects || [])
    .filter((obj) => indexableKey(obj.key))
    .map((obj) => [obj.key, { ...obj, storageId: "r2", objectKey: obj.key }]);
  const synced = await batchUpsertFileIndex(env, entries);
  return { synced, truncated: Boolean(listed.truncated) };
}

export async function rebuildFileIndex(env, { maxObjects = 50000 } = {}) {
  if (!(await ensureFileIndexTable(env)))
    return { synced: 0, truncated: false };
  try {
    await env.D1.prepare("DELETE FROM file_index").run();
  } catch (_) {}
  return syncFileIndexFromR2(env, { maxObjects });
}
