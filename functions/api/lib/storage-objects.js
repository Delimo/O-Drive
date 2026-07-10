import { bytesToHex } from "./common/index.js";

const STORAGE_OBJECTS_SQL = `
  CREATE TABLE IF NOT EXISTS storage_objects (
    id TEXT PRIMARY KEY,
    storage_id TEXT NOT NULL DEFAULT 'r2',
    object_key TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    content_type TEXT DEFAULT '',
    ref_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (storage_id, sha256, size),
    UNIQUE (storage_id, object_key)
  )
`;

const STORAGE_OBJECTS_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS idx_storage_objects_hash ON storage_objects(storage_id, sha256, size)";

const initializedStorageObjects = new WeakSet();

function normalizeStorageId(storageId = "r2") {
  return String(storageId || "r2");
}

function normalizeHash(sha256 = "") {
  return String(sha256 || "").toLowerCase();
}

function storageObjectId(storageId, sha256, size) {
  return `${normalizeStorageId(storageId)}:${normalizeHash(sha256)}:${Number(size || 0)}`;
}

export async function ensureStorageObjectsTable(env) {
  if (!env?.D1) return false;
  if (initializedStorageObjects.has(env)) return true;
  try {
    await env.D1.prepare(STORAGE_OBJECTS_SQL).run();
    await env.D1.prepare(STORAGE_OBJECTS_INDEX_SQL).run();
    initializedStorageObjects.add(env);
    return true;
  } catch (_) {
    console.warn("[storage-objects] Failed to ensure storage_objects table");
    return false;
  }
}

export async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

export function storageObjectKeyForSha256(sha256) {
  const hash = normalizeHash(sha256);
  return `objects/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

export async function getStorageObjectByHash(
  env,
  storageId = "r2",
  sha256 = "",
  size = 0,
) {
  if (!(await ensureStorageObjectsTable(env))) return null;
  try {
    return await env.D1.prepare(
      "SELECT * FROM storage_objects WHERE storage_id = ? AND sha256 = ? AND size = ?",
    )
      .bind(normalizeStorageId(storageId), normalizeHash(sha256), Number(size || 0))
      .first();
  } catch (_) {
    return null;
  }
}

export async function getStorageObjectByKey(
  env,
  storageId = "r2",
  objectKey = "",
) {
  if (!objectKey || !(await ensureStorageObjectsTable(env))) return null;
  try {
    return await env.D1.prepare(
      "SELECT * FROM storage_objects WHERE storage_id = ? AND object_key = ?",
    )
      .bind(normalizeStorageId(storageId), objectKey)
      .first();
  } catch (_) {
    return null;
  }
}

export async function createStorageObject(
  env,
  { storageId = "r2", sha256 = "", size = 0, contentType = "" } = {},
) {
  if (!(await ensureStorageObjectsTable(env))) return null;
  const normalizedStorageId = normalizeStorageId(storageId);
  const normalizedSha256 = normalizeHash(sha256);
  const normalizedSize = Number(size || 0);
  const objectKey = storageObjectKeyForSha256(normalizedSha256);
  const now = Date.now();
  const row = {
    id: storageObjectId(normalizedStorageId, normalizedSha256, normalizedSize),
    storage_id: normalizedStorageId,
    object_key: objectKey,
    sha256: normalizedSha256,
    size: normalizedSize,
    content_type: contentType || "",
    ref_count: 0,
    created_at: now,
    updated_at: now,
  };
  try {
    await env.D1.prepare(
      `INSERT INTO storage_objects
       (id, storage_id, object_key, sha256, size, content_type, ref_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
      .bind(
        row.id,
        row.storage_id,
        row.object_key,
        row.sha256,
        row.size,
        row.content_type,
        row.created_at,
        row.updated_at,
      )
      .run();
    return row;
  } catch (_) {
    return (
      (await getStorageObjectByHash(
        env,
        normalizedStorageId,
        normalizedSha256,
        normalizedSize,
      )) || (await getStorageObjectByKey(env, normalizedStorageId, objectKey))
    );
  }
}

export async function adjustStorageObjectRef(
  env,
  storageId = "r2",
  objectKey = "",
  delta = 0,
) {
  if (!objectKey || !delta || !(await ensureStorageObjectsTable(env))) return;
  const now = Date.now();
  try {
    if (delta > 0) {
      await env.D1.prepare(
        "UPDATE storage_objects SET ref_count = ref_count + ?, updated_at = ? WHERE storage_id = ? AND object_key = ?",
      )
        .bind(Number(delta), now, normalizeStorageId(storageId), objectKey)
        .run();
      return;
    }
    const amount = Math.abs(Number(delta));
    await env.D1.prepare(
      "UPDATE storage_objects SET ref_count = CASE WHEN ref_count > ? THEN ref_count - ? ELSE 0 END, updated_at = ? WHERE storage_id = ? AND object_key = ?",
    )
      .bind(amount, amount, now, normalizeStorageId(storageId), objectKey)
      .run();
  } catch (err) {
    console.warn(
      `[storage-objects] ref adjust failed (${objectKey}, delta ${delta}): ${err?.message || err}`,
    );
  }
}

export async function deleteStorageObjectRecord(
  env,
  storageId = "r2",
  objectKey = "",
) {
  if (!objectKey || !(await ensureStorageObjectsTable(env))) return;
  try {
    await env.D1.prepare(
      "DELETE FROM storage_objects WHERE storage_id = ? AND object_key = ?",
    )
      .bind(normalizeStorageId(storageId), objectKey)
      .run();
  } catch (err) {
    console.warn(
      `[storage-objects] record delete failed (${objectKey}): ${err?.message || err}`,
    );
  }
}

export async function recordStorageObjectReferenceChange(
  env,
  previous,
  next,
) {
  const nextStorageId = normalizeStorageId(next?.storageId || next?.storage_id);
  const nextObjectKey = next?.objectKey || next?.object_key || "";
  const previousStorageId = previous
    ? normalizeStorageId(previous.storage_id || previous.storageId)
    : "";
  const previousObjectKey = previous
    ? previous.object_key || previous.objectKey || previous.path || ""
    : "";

  if (
    previousObjectKey &&
    previousStorageId === nextStorageId &&
    previousObjectKey === nextObjectKey
  ) {
    return;
  }

  if (nextObjectKey)
    await adjustStorageObjectRef(env, nextStorageId, nextObjectKey, 1);
  if (previousObjectKey)
    await adjustStorageObjectRef(
      env,
      previousStorageId || "r2",
      previousObjectKey,
      -1,
    );
}
