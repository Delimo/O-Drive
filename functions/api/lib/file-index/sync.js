import { listR2Objects } from "../common/index.js";
import { ensureFileIndexTable } from "./ensure.js";
import { indexableKey } from "./helpers.js";
import { batchUpsertFileIndex } from "./upsert.js";
import { clearStorageUsedCache } from "./stats.js";

export async function syncFileIndexFromR2(env, { maxObjects = 20000 } = {}) {
  if (!(await ensureFileIndexTable(env)))
    return { synced: 0, truncated: false };
  const listed = await listR2Objects(env.R2, {}, { maxObjects });
  const entries = (listed.objects || [])
    .filter((obj) => indexableKey(obj.key))
    .map((obj) => [obj.key, { ...obj, storageId: "r2", objectKey: obj.key }]);
  const synced = await batchUpsertFileIndex(env, entries);
  return { synced, truncated: Boolean(listed.truncated), entries };
}

// 非破坏性重建：只 upsert 路径命名的 R2 对象，绝不清空 file_index。
// 去重上传（objects/sha256/...）和 legacy 上传（.system/uploads/...）的索引行
// 的用户路径只存在于 D1，清空后无法从 R2 恢复。
// 清理死行时只删除 object_key 为路径式（object_key == path）且 R2 中已不存在的行；
// 扫描被截断时跳过清理，避免把未扫描到的对象当作已删除。
export async function rebuildFileIndex(env, { maxObjects = 50000 } = {}) {
  if (!(await ensureFileIndexTable(env)))
    return { synced: 0, truncated: false, removed: 0 };
  const { synced, truncated, entries } = await syncFileIndexFromR2(env, {
    maxObjects,
  });
  let removed = 0;
  if (!truncated) {
    try {
      const seen = new Set((entries || []).map(([key]) => key));
      const rows = await env.D1.prepare(
        "SELECT path FROM file_index WHERE COALESCE(storage_id, 'r2') = 'r2' AND COALESCE(NULLIF(object_key, ''), path) = path",
      ).all();
      const stale = (rows?.results || [])
        .map((row) => row.path)
        .filter((path) => path && !seen.has(path));
      const BATCH_SIZE = 50;
      for (let i = 0; i < stale.length; i += BATCH_SIZE) {
        const chunk = stale.slice(i, i + BATCH_SIZE);
        await env.D1.batch(
          chunk.flatMap((path) => [
            env.D1.prepare("DELETE FROM file_index WHERE path = ?").bind(path),
            env.D1
              .prepare(
                "DELETE FROM storage_usage WHERE storage_id = ? AND object_key = ?",
              )
              .bind("r2", path),
          ]),
        );
        removed += chunk.length;
      }
      if (removed) clearStorageUsedCache();
    } catch (_) {}
  }
  return { synced, truncated, removed };
}
