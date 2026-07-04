import {
  addLog,
  assertCompleteListing,
} from "../common/index.js";
import {
  deleteFileIndexKey,
  listFileIndexPrefix,
} from "../file-index/index.js";
import {
  copyR2Object,
  deletePathEntry,
  mapWithConcurrency,
} from "../r2-tree.js";
import {
  resolveExistingObjectLocation,
  storageDelete,
  storageGet,
  storageList,
  storagePut,
} from "../storage.js";
import { createTrashId, insertTrashEntry } from "./helpers.js";
import { ensureTrashTable } from "./schema.js";

export async function softDeleteTree(env, sourceKey, request) {
  const sourceLocation = await resolveExistingObjectLocation(env, sourceKey);
  const storageId = sourceLocation.storageId;
  const exact = await storageGet(
    env,
    sourceLocation.storageId,
    sourceLocation.objectKey,
  );
  const listed = await storageList(env, storageId, { prefix: sourceKey + "/" });
  assertCompleteListing(listed, `Path ${sourceKey}`);
  const entries = new Map();

  if (exact)
    entries.set(sourceKey, {
      key: sourceKey,
      size: exact.size || 0,
      contentType: exact.httpMetadata?.contentType || "",
      indexed: Boolean(sourceLocation.indexed),
      storageId: sourceLocation.storageId,
      objectKey: sourceLocation.objectKey,
    });
  const indexedRows = await listFileIndexPrefix(env, sourceKey);
  if (
    sourceLocation.indexed &&
    !indexedRows.find((row) => row.path === sourceKey)
  ) {
    const entry = sourceLocation.indexed;
    entries.set(sourceKey, {
      key: sourceKey,
      size: Number(entry.size || 0),
      contentType: entry.content_type || "",
      indexed: true,
      storageId: entry.storage_id || storageId,
      objectKey: entry.object_key || sourceKey,
    });
  }
  for (const row of indexedRows) {
    entries.set(row.path, {
      key: row.path,
      size: Number(row.size || 0),
      contentType: row.content_type || "",
      indexed: true,
      storageId: row.storage_id || storageId,
      objectKey: row.object_key || row.path,
    });
  }
  const newKeys = (listed.objects || [])
    .filter((item) => !entries.has(item.key))
    .map((item) => item.key);
  if (newKeys.length) {
    const placeholders = newKeys.map(() => "?").join(",");
    const rows = await env.D1.prepare(
      `SELECT path FROM file_index WHERE path IN (${placeholders})`,
    )
      .bind(...newKeys)
      .all()
      .catch(() => ({ results: [] }));
    const indexedPaths = new Set((rows.results || []).map((r) => r.path));
    for (const key of newKeys) {
      const item = listed.objects.find((o) => o.key === key);
      entries.set(key, {
        key,
        size: item.size || 0,
        contentType: item.httpMetadata?.contentType || "",
        indexed: indexedPaths.has(key),
        storageId,
        objectKey: key,
      });
    }
  }
  const entryList = [...entries.values()];
  if (entryList.length === 0) {
    throw new Error("File or folder not found");
  }

  const trashId = createTrashId();
  const trashKey = `.trash/${trashId}/${sourceKey}`;

  const kind =
    exact && listed.objects.length === 0 && entryList.length === 1
      ? "file"
      : "folder";
  const size = exact?.size || 0;

  // Insert the trash DB row FIRST so orphaned .trash/ objects never exist
  // without a corresponding database record.
  await ensureTrashTable(env);
  await env.D1.prepare(
    "INSERT INTO trash (id, original_key, trash_key, name, kind, size, storage_id, trashed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      trashId,
      sourceKey,
      trashKey,
      sourceKey.split("/").pop() || sourceKey,
      kind,
      size,
      storageId,
      Date.now(),
    )
    .run();

  await mapWithConcurrency(entryList, 6, async (entry) => {
    const source = entry.key;
    const objectKey = entry.objectKey || source;
    if (entry.indexed && objectKey !== source) {
      const inserted = await insertTrashEntry(env, trashId, {
        path: source,
        storageId: entry.storageId || storageId,
        objectKey,
        size: entry.size,
        contentType: entry.contentType,
      });
      if (inserted) await deleteFileIndexKey(env, source);
      return;
    }
    const target = `.trash/${trashId}/${entry.key}`;
    const copied = await copyR2Object(env, source, target);
    if (!copied) return;
    const location = await resolveExistingObjectLocation(env, source);
    if (entry.indexed || location.indexed)
      await deletePathEntry(
        env,
        source,
        location.storageId,
        location.objectKey,
      );
    else await storageDelete(env, location.storageId, location.objectKey);
  });

  if (
    !exact &&
    entryList.length === 1 &&
    entryList[0].key === `${sourceKey}/.folder`
  ) {
    await storagePut(env, storageId, `${trashKey}/.folder`, new Uint8Array(0));
  }

  await addLog(env, request, "TRASH", sourceKey);
  return { id: trashId, originalKey: sourceKey, trashKey, kind };
}
