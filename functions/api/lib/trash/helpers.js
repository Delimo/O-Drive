import {
  addLog,
  assertCompleteListing,
  normalizeName,
} from "../common/index.js";
import {
  clearStorageUsedCache,
  countObjectRefs,
  deleteFileIndexKey,
  getFileIndexEntry,
  listFileIndexPrefix,
  upsertFileIndex,
} from "../file-index/index.js";
import {
  adjustStorageObjectRef,
  deleteStorageObjectRecord,
} from "../storage-objects.js";
import {
  deletePathEntry,
  mapWithConcurrency,
} from "../r2-tree.js";
import {
  resolveExistingObjectLocation,
  resolveExistingStorageId,
  storageCopy,
  storageDelete,
  storageGet,
  storageHead,
  storageList,
} from "../storage.js";
import { ensureTrashTable } from "./schema.js";

export function createTrashId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createTrashEntryId(trashId) {
  return `${trashId}:${crypto.randomUUID()}`;
}

export function normalizeRestoreConflictMode(mode = "error") {
  return ["error", "skip", "overwrite", "rename"].includes(mode)
    ? mode
    : "error";
}

export async function insertTrashEntry(env, trashId, entry) {
  const storageId = entry.storageId || entry.storage_id || "r2";
  const objectKey = entry.objectKey || entry.object_key || entry.key;
  if (!objectKey) return false;
  await env.D1.prepare(
    `INSERT INTO trash_entries
     (id, trash_id, path, storage_id, object_key, size, content_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      createTrashEntryId(trashId),
      trashId,
      entry.path || entry.key,
      storageId,
      objectKey,
      Number(entry.size || 0),
      entry.contentType || entry.content_type || "",
      Date.now(),
    )
    .run();
  await adjustStorageObjectRef(env, storageId, objectKey, 1);
  return true;
}

export async function listTrashEntries(env, trashId) {
  await ensureTrashTable(env);
  const rows = await env.D1.prepare(
    "SELECT * FROM trash_entries WHERE trash_id = ? ORDER BY path ASC",
  )
    .bind(trashId)
    .all();
  return rows.results || [];
}

async function removeStorageUsageIfUnreferenced(env, storageId, objectKey) {
  if (!objectKey || (await countObjectRefs(env, storageId, objectKey)) > 0)
    return;
  try {
    await env.D1.prepare(
      "DELETE FROM storage_usage WHERE storage_id = ? AND object_key = ?",
    )
      .bind(storageId || "r2", objectKey)
      .run();
    clearStorageUsedCache();
  } catch (_) {}
}

export async function releaseTrashEntry(env, entry) {
  const storageId = entry.storage_id || "r2";
  const objectKey = entry.object_key || "";
  await env.D1.prepare("DELETE FROM trash_entries WHERE id = ?")
    .bind(entry.id)
    .run();
  await adjustStorageObjectRef(env, storageId, objectKey, -1);
  if ((await countObjectRefs(env, storageId, objectKey)) > 0) return;
  await storageDelete(env, storageId, objectKey);
  await deleteStorageObjectRecord(env, storageId, objectKey);
  await removeStorageUsageIfUnreferenced(env, storageId, objectKey);
}

export async function keyExists(env, key) {
  if (await getFileIndexEntry(env, key)) return true;
  const storageId = await resolveExistingStorageId(env, key);
  if (await storageGet(env, storageId, key)) return true;
  const listed = await storageList(env, storageId, {
    prefix: key + "/",
    limit: 1,
  });
  return Boolean(
    (listed.objects || []).length || (listed.delimitedPrefixes || []).length,
  );
}

export async function restoreTargetForMode(env, originalKey, kind, mode) {
  const conflictMode = normalizeRestoreConflictMode(mode);
  if (!(await keyExists(env, originalKey))) {
    return { key: originalKey, conflict: false, skipped: false };
  }
  if (conflictMode === "skip") {
    return { key: originalKey, conflict: true, skipped: true };
  }
  if (conflictMode === "overwrite") {
    return { key: originalKey, conflict: true, overwrite: true };
  }
  if (conflictMode !== "rename") {
    const err = new Error("Target already exists");
    err.status = 409;
    throw err;
  }

  const slash = originalKey.lastIndexOf("/");
  const dir = slash >= 0 ? originalKey.slice(0, slash + 1) : "";
  const name = slash >= 0 ? originalKey.slice(slash + 1) : originalKey;
  const dot = kind === "file" ? name.lastIndexOf(".") : -1;
  const base = normalizeName(dot > 0 ? name.slice(0, dot) : name);
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; i <= 100; i++) {
    const candidate = `${dir}${base} (${i})${ext}`;
    if (!(await keyExists(env, candidate))) {
      return { key: candidate, conflict: true, renamed: true };
    }
  }
  throw new Error("Unable to generate unique restore path");
}

export async function deleteExistingPathTree(env, key) {
  const storageId = await resolveExistingStorageId(env, key);
  const listed = await storageList(env, storageId, { prefix: key + "/" });
  assertCompleteListing(listed, `Target ${key}`);
  const entries = new Map();
  const exactLocation = await resolveExistingObjectLocation(env, key);
  const exact = await storageGet(
    env,
    exactLocation.storageId,
    exactLocation.objectKey,
  );
  if (exact || exactLocation.indexed) {
    entries.set(key, {
      path: key,
      storageId: exactLocation.storageId,
      objectKey: exactLocation.objectKey,
    });
  }
  for (const row of await listFileIndexPrefix(env, key)) {
    entries.set(row.path, {
      path: row.path,
      storageId: row.storage_id || storageId,
      objectKey: row.object_key || row.path,
    });
  }
  for (const item of listed.objects || []) {
    if (!entries.has(item.key)) {
      const location = await resolveExistingObjectLocation(env, item.key);
      entries.set(item.key, {
        path: item.key,
        storageId: location.storageId,
        objectKey: location.objectKey,
      });
    }
  }
  await mapWithConcurrency([...entries.values()], 6, (entry) =>
    deletePathEntry(env, entry.path, entry.storageId, entry.objectKey),
  );
}

export async function trashRows(env, where = "", params = []) {
  await ensureTrashTable(env);
  let stmt = env.D1.prepare(
    `SELECT * FROM trash ${where} ORDER BY trashed_at DESC`,
  );
  if (params.length) stmt = stmt.bind(...params);
  const rows = await stmt.all();
  return rows.results || [];
}

export async function mapTrashRows(rows, worker, concurrency = 4) {
  const results = new Array(rows.length);
  await mapWithConcurrency(
    rows.map((row, index) => ({ row, index })),
    concurrency,
    async ({ row, index }) => {
      results[index] = await worker(row, index);
    },
  );
  return results;
}

export async function trashRestorePreview(env, rows) {
  const seenTargets = new Map();
  const items = [];
  for (const row of rows) {
    const originalKey = row.original_key;
    const exists = await keyExists(env, originalKey);
    const duplicateIndex = seenTargets.get(originalKey);
    const duplicateInBatch = duplicateIndex != null;
    const conflict = exists || duplicateInBatch;
    seenTargets.set(originalKey, row.id);
    items.push({
      id: row.id,
      originalKey,
      name: row.name || originalKey.split("/").pop() || originalKey,
      kind: row.kind || "file",
      conflict,
      exists,
      duplicateInBatch,
    });
  }
  const conflicts = items.filter((item) => item.conflict);
  return {
    total: items.length,
    conflictCount: conflicts.length,
    hasConflicts: conflicts.length > 0,
    items,
  };
}

export async function restoreTrashRecord(env, row, request, options = {}) {
  const conflictMode = normalizeRestoreConflictMode(options.conflict || "error");
  const resolved = await restoreTargetForMode(
    env,
    row.original_key,
    row.kind,
    conflictMode,
  );
  if (resolved.skipped) {
    await addLog(env, request, "RESTORE_SKIP", row.original_key);
    return {
      success: true,
      skipped: true,
      originalKey: row.original_key,
      restoredKey: row.original_key,
      conflict: true,
    };
  }
  if (resolved.overwrite) {
    await deleteExistingPathTree(env, row.original_key);
  }
  const logicalEntries = await listTrashEntries(env, row.id);
  if (logicalEntries.length) {
    for (const entry of logicalEntries) {
      const suffix =
        entry.path === row.original_key
          ? ""
          : String(entry.path || "").startsWith(row.original_key + "/")
            ? entry.path.slice(row.original_key.length)
            : "";
      const target = resolved.key + suffix;
      const storageId = entry.storage_id || "r2";
      const objectKey = entry.object_key || "";
      const meta = await storageHead(env, storageId, objectKey);
      if (!meta) throw new Error("Trash object missing");
      const indexed = await upsertFileIndex(env, target, {
        size: Number(meta.size ?? entry.size ?? 0),
        contentType:
          meta.httpMetadata?.contentType || entry.content_type || "",
        storageId,
        objectKey,
        uploaded: Date.now(),
      });
      if (!indexed) throw new Error("Failed to restore trash item");
      await releaseTrashEntry(env, entry);
    }
  }
  const storageId =
    row.storage_id || (await resolveExistingStorageId(env, row.trash_key));
  const listed = await storageList(env, storageId, { prefix: row.trash_key });
  assertCompleteListing(listed, `Trash item ${row.id}`);
  await mapWithConcurrency(listed.objects || [], 6, async (item) => {
    const suffix = item.key.slice(row.trash_key.length);
    const target = resolved.key + suffix;
    await storageCopy(env, storageId, item.key, storageId, target);
    const meta = await storageHead(env, storageId, target);
    await upsertFileIndex(env, target, {
      size: meta?.size,
      httpMetadata: meta?.httpMetadata,
      storageId,
      objectKey: target,
    });
    await storageDelete(env, storageId, item.key);
  });

  await env.D1.prepare("DELETE FROM trash WHERE id = ?").bind(row.id).run();
  await addLog(env, request, "RESTORE", resolved.key);
  return {
    success: true,
    skipped: false,
    originalKey: row.original_key,
    restoredKey: resolved.key,
    conflict: resolved.conflict,
    renamed: Boolean(resolved.renamed),
    overwritten: Boolean(resolved.overwrite),
  };
}

export async function purgeTrashRecord(env, row, request) {
  const logicalEntries = await listTrashEntries(env, row.id);
  if (logicalEntries.length) {
    await mapWithConcurrency(logicalEntries, 8, (entry) =>
      releaseTrashEntry(env, entry),
    );
  }
  const storageId =
    row.storage_id || (await resolveExistingStorageId(env, row.trash_key));
  const listed = await storageList(env, storageId, { prefix: row.trash_key });
  assertCompleteListing(listed, `Trash item ${row.id}`);
  await mapWithConcurrency(listed.objects || [], 8, (item) =>
    storageDelete(env, storageId, item.key),
  );
  await env.D1.prepare("DELETE FROM trash WHERE id = ?").bind(row.id).run();
  await addLog(env, request, "PURGE", row.original_key);
}
