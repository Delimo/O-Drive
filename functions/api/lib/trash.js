import {
  addLog,
  assertCompleteListing,
  jsonResponse,
  apiError,
  normalizeName,
} from "./common/index.js";
import {
  clearStorageUsedCache,
  countObjectRefs,
  deleteFileIndexKey,
  getFileIndexEntry,
  listFileIndexPrefix,
  upsertFileIndex,
} from "./file-index/index.js";
import {
  adjustStorageObjectRef,
  deleteStorageObjectRecord,
} from "./storage-objects.js";
import {
  copyR2Object,
  deletePathEntry,
  mapWithConcurrency,
} from "./r2-tree.js";
import {
  resolveExistingObjectLocation,
  resolveExistingStorageId,
  storageCopy,
  storageDelete,
  storageGet,
  storageHead,
  storageList,
  storagePut,
} from "./storage.js";

const TRASH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS trash (
    id TEXT PRIMARY KEY,
    original_key TEXT NOT NULL,
    trash_key TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    trashed_at INTEGER NOT NULL
  )
`;

const TRASH_ENTRIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS trash_entries (
    id TEXT PRIMARY KEY,
    trash_id TEXT NOT NULL,
    path TEXT NOT NULL,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    object_key TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  )
`;

const SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`;

let _trashTableReady;
let _settingsTableReady;

async function ensureTrashTable(env) {
  if (_trashTableReady) return;
  const stmt = env.D1.prepare(TRASH_TABLE_SQL);
  if (typeof stmt.bind === "function") {
    await stmt.bind().run();
  } else {
    await stmt.run();
  }
  try {
    await env.D1.prepare(
      "ALTER TABLE trash ADD COLUMN storage_id TEXT NOT NULL DEFAULT 'r2'",
    ).run();
  } catch (_) {}
  await env.D1.prepare(TRASH_ENTRIES_TABLE_SQL).run();
  try {
    await env.D1.prepare(
      "CREATE INDEX IF NOT EXISTS idx_trash_entries_trash_id ON trash_entries(trash_id)",
    ).run();
  } catch (_) {}
  try {
    await env.D1.prepare(
      "CREATE INDEX IF NOT EXISTS idx_trash_entries_object ON trash_entries(storage_id, object_key)",
    ).run();
  } catch (_) {}
  _trashTableReady = true;
}

async function ensureSettingsTable(env) {
  if (_settingsTableReady) return;
  const stmt = env.D1.prepare(SETTINGS_TABLE_SQL);
  if (typeof stmt.bind === "function") {
    await stmt.bind().run();
  } else {
    await stmt.run();
  }
  _settingsTableReady = true;
}

function createTrashId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createTrashEntryId(trashId) {
  return `${trashId}:${crypto.randomUUID()}`;
}

function normalizeRestoreConflictMode(mode = "error") {
  return ["error", "skip", "overwrite", "rename"].includes(mode)
    ? mode
    : "error";
}

async function insertTrashEntry(env, trashId, entry) {
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

async function listTrashEntries(env, trashId) {
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

async function releaseTrashEntry(env, entry) {
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

async function keyExists(env, key) {
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

async function restoreTargetForMode(env, originalKey, kind, mode) {
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

async function deleteExistingPathTree(env, key) {
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
  for (const row of await listFileIndexPrefix(env, sourceKey)) {
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

  const kind =
    exact && listed.objects.length === 0 && entryList.length === 1
      ? "file"
      : "folder";
  const size = exact?.size || 0;

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

  await addLog(env, request, "TRASH", sourceKey);
  return { id: trashId, originalKey: sourceKey, trashKey, kind };
}

export async function handleTrashList(env, url) {
  await ensureTrashTable(env);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const size = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("size") || "20")),
  );
  const filters = [];
  const params = [];
  const q = String(url.searchParams.get("q") || "").trim();
  const kind = String(url.searchParams.get("kind") || "").trim();
  const from = Number(url.searchParams.get("from") || 0);
  const to = Number(url.searchParams.get("to") || 0);
  if (q) {
    filters.push("(original_key LIKE ? OR name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (["file", "folder"].includes(kind)) {
    filters.push("kind = ?");
    params.push(kind);
  }
  if (Number.isFinite(from) && from > 0) {
    filters.push("trashed_at >= ?");
    params.push(from);
  }
  if (Number.isFinite(to) && to > 0) {
    filters.push("trashed_at <= ?");
    params.push(to);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  let totalStmt = env.D1.prepare(
    `SELECT COUNT(*) as count FROM trash ${where}`,
  );
  if (params.length) totalStmt = totalStmt.bind(...params);
  const totalRes = await totalStmt.first();
  const rows = await env.D1.prepare(
    `SELECT * FROM trash ${where} ORDER BY trashed_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...params, size, (page - 1) * size)
    .all();
  return jsonResponse({
    items: rows.results || [],
    totalPages: Math.max(1, Math.ceil((totalRes?.count || 0) / size)),
    currentPage: page,
    total: Number(totalRes?.count || 0),
  });
}

async function trashRows(env, where = "", params = []) {
  await ensureTrashTable(env);
  let stmt = env.D1.prepare(
    `SELECT * FROM trash ${where} ORDER BY trashed_at DESC`,
  );
  if (params.length) stmt = stmt.bind(...params);
  const rows = await stmt.all();
  return rows.results || [];
}

async function mapTrashRows(rows, worker, concurrency = 4) {
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

async function trashRestorePreview(env, rows) {
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

async function restoreTrashRecord(env, row, request, options = {}) {
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

async function purgeTrashRecord(env, row, request) {
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

export async function handleTrashRestore(env, request) {
  const { id, conflict } = await request.json().catch(() => ({}));
  if (!id)
    return jsonResponse(
      { success: false, message: "Invalid trash record" },
      400,
    );
  await ensureTrashTable(env);
  const row = await env.D1.prepare("SELECT * FROM trash WHERE id = ?")
    .bind(id)
    .first();
  if (!row)
    return jsonResponse(
      { success: false, message: "Trash item not found" },
      404,
    );
  const result = await restoreTrashRecord(env, row, request, { conflict });
  return jsonResponse(result);
}

export async function handleTrashRestorePreview(env, request) {
  const { ids } = await request.json().catch(() => ({}));
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length || uniqueIds.length > 100)
    return jsonResponse(
      { success: false, message: "Invalid trash records" },
      400,
    );
  await ensureTrashTable(env);
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = await env.D1.prepare(
    `SELECT * FROM trash WHERE id IN (${placeholders})`,
  )
    .bind(...uniqueIds)
    .all();
  const byId = new Map((rows.results || []).map((row) => [row.id, row]));
  const orderedRows = uniqueIds.map((id) => byId.get(id)).filter(Boolean);
  if (orderedRows.length !== uniqueIds.length) {
    return jsonResponse(
      { success: false, message: "Some trash items were not found" },
      404,
    );
  }
  return jsonResponse({
    success: true,
    ...(await trashRestorePreview(env, orderedRows)),
  });
}

export async function handleTrashBatchRestore(env, request) {
  const { ids, conflict } = await request.json().catch(() => ({}));
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length || uniqueIds.length > 100)
    return jsonResponse(
      { success: false, message: "Invalid trash records" },
      400,
    );
  await ensureTrashTable(env);
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = await env.D1.prepare(
    `SELECT * FROM trash WHERE id IN (${placeholders})`,
  )
    .bind(...uniqueIds)
    .all();
  const byId = new Map((rows.results || []).map((row) => [row.id, row]));
  const orderedRows = uniqueIds.map((id) => byId.get(id)).filter(Boolean);
  if (orderedRows.length !== uniqueIds.length) {
    return jsonResponse(
      { success: false, message: "Some trash items were not found" },
      404,
    );
  }

  let completed = 0;
  let skipped = 0;
  const restored = [];
  const failed = [];
  for (const row of orderedRows) {
    try {
      const result = await restoreTrashRecord(env, row, request, { conflict });
      if (result.skipped) skipped++;
      else completed++;
      restored.push(result);
    } catch (e) {
      failed.push({
        id: row.id,
        originalKey: row.original_key,
        message: e.message || "Failed",
      });
    }
  }
  return jsonResponse(
    {
      success: failed.length === 0,
      completed,
      skipped,
      total: orderedRows.length,
      restored,
      failed: failed.length ? failed : undefined,
    },
    failed.length && !completed && !skipped ? 409 : 200,
  );
}

export async function handleTrashDelete(env, request) {
  const { id } = await request.json().catch(() => ({}));
  if (!id)
    return jsonResponse(
      { success: false, message: "Invalid trash record" },
      400,
    );
  await ensureTrashTable(env);
  const row = await env.D1.prepare("SELECT * FROM trash WHERE id = ?")
    .bind(id)
    .first();
  if (!row)
    return jsonResponse(
      { success: false, message: "Trash item not found" },
      404,
    );
  await purgeTrashRecord(env, row, request);
  return jsonResponse({ success: true, originalKey: row.original_key });
}

export async function handleTrashClear(env, request) {
  const rows = await trashRows(env);
  let deleted = 0;
  const errors = [];
  const results = await mapTrashRows(rows, async (row) => {
    try {
      await purgeTrashRecord(env, row, request);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  results.forEach((result, index) => {
    if (result?.ok) deleted++;
    else
      errors.push({
        id: rows[index].id,
        original: rows[index].original_key,
        error: result?.error || "Failed",
      });
  });
  await addLog(env, request, "TRASH_CLEAR", `${deleted}/${rows.length} items`);
  return jsonResponse({
    success: true,
    deleted,
    total: rows.length,
    errors: errors.length ? errors : undefined,
  });
}

export async function handleTrashCleanup(env, request) {
  await ensureSettingsTable(env);
  const setting = await env.D1.prepare(
    "SELECT value FROM settings WHERE key = 'trash_retention_days'",
  ).first();
  const days = Math.max(0, Number(setting?.value || 0));
  if (!days)
    return jsonResponse({ success: true, deleted: 0, retentionDays: days });
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await trashRows(env, "WHERE trashed_at < ?", [cutoff]);
  let deleted = 0;
  const errors = [];
  const BATCH_SIZE = 10;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (row) => {
        try {
          await purgeTrashRecord(env, row, request);
          deleted++;
        } catch (e) {
          errors.push({
            id: row.id,
            original: row.original_key,
            error: e.message,
          });
        }
      }),
    );
  }
  await addLog(
    env,
    request,
    "TRASH_CLEANUP",
    `${deleted}/${rows.length} items older than ${days} days`,
  );
  return jsonResponse({
    success: true,
    deleted,
    total: rows.length,
    retentionDays: days,
    errors: errors.length ? errors : undefined,
  });
}

export async function handleTrashRetention(env, request, method) {
  await ensureSettingsTable(env);
  if (method === "GET") {
    const row = await env.D1.prepare(
      "SELECT value FROM settings WHERE key = 'trash_retention_days'",
    ).first();
    return jsonResponse({ days: Number(row?.value || 0) });
  }
  if (method === "PUT") {
    const body = await request.json();
    const days = Math.max(0, Math.min(3650, Number(body.days || 0)));
    await env.D1.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('trash_retention_days', ?)",
    )
      .bind(String(days))
      .run();
    await addLog(env, request, "TRASH_RETENTION", `${days} days`);
    return jsonResponse({ success: true, days });
  }
  return apiError("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
}
