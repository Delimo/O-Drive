import { jsonResponse, addLog } from "../common/index.js";
import { countFileIndexObjectRefs, getFileIndexEntry, upsertFileIndex } from "../file-index/index.js";
import {
  releaseReservedQuota,
  resolveExistingStorageId,
  storageAbortMultipartUpload,
  storageCompleteMultipartUpload,
  storageCopy,
  storageCreateMultipartUpload,
  storageDelete,
  storageHead,
  storageUploadPart,
  tryReserveStorageQuota,
} from "../storage.js";
import {
  createStorageObject,
  deleteStorageObjectRecord,
  ensureStorageObjectsTable,
  getStorageObjectByHash,
  storageObjectKeyForSha256,
} from "../storage-objects.js";
import { assertUserKey, resolveUploadConflict, uploadKey } from "./helpers.js";

const ORPHAN_MULTIPART_TTL_MS = 24 * 60 * 60 * 1000;
const _trackingReady = new WeakSet();

async function ensureMultipartTrackingTable(env) {
  if (_trackingReady.has(env)) return;
  try {
    await env.D1.prepare(
      `CREATE TABLE IF NOT EXISTS multipart_uploads (
        upload_id TEXT PRIMARY KEY,
        storage_id TEXT NOT NULL DEFAULT 'r2',
        key TEXT NOT NULL,
        total_size INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
    ).run();
    _trackingReady.add(env);
  } catch (_) {}
}

async function trackMultipartUpload(env, storageId, uploadId, key, totalSize) {
  await ensureMultipartTrackingTable(env);
  try {
    await env.D1.prepare(
      "INSERT OR IGNORE INTO multipart_uploads (upload_id, storage_id, key, total_size, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(uploadId, storageId, key, Number(totalSize || 0), Date.now()).run();
  } catch (_) {}
}

async function untrackMultipartUpload(env, uploadId) {
  try {
    await env.D1.prepare(
      "DELETE FROM multipart_uploads WHERE upload_id = ?",
    ).bind(uploadId).run();
  } catch (_) {}
}

/**
 * List and abort multipart uploads that have been idle longer than the TTL.
 * Returns the count of aborted uploads.
 */
export async function cleanupOrphanMultipartUploads(env) {
  await ensureMultipartTrackingTable(env);
  const cutoff = Date.now() - ORPHAN_MULTIPART_TTL_MS;
  let aborted = 0;
  try {
    const rows = await env.D1.prepare(
      "SELECT upload_id, storage_id, key, total_size FROM multipart_uploads WHERE created_at < ?",
    ).bind(cutoff).all();
    for (const row of (rows.results || [])) {
      try {
        await storageAbortMultipartUpload(env, row.storage_id || "r2", row.key || "", row.upload_id);
      } catch (_) {}
      try {
        await env.D1.prepare(
          "DELETE FROM multipart_uploads WHERE upload_id = ?",
        ).bind(row.upload_id).run();
      } catch (_) {}
      aborted++;
    }
  } catch (_) {}
  return { aborted };
}

export async function handleMultipartCreate(env, request) {
  const {
    targetDir,
    name,
    type,
    totalSize,
    size,
    conflict = "error",
  } = await request.json();
  const key = uploadKey(targetDir, name);
  assertUserKey(key);
  const resolved = await resolveUploadConflict(env, key, conflict);
  if (resolved.skipped) return jsonResponse({ key, skipped: true });
  const storageId = "r2";
  const upload = await storageCreateMultipartUpload(env, storageId, resolved.key, {
    httpMetadata: { contentType: type || "application/octet-stream" },
  });
  await trackMultipartUpload(env, storageId, upload.uploadId, resolved.key, Number(totalSize || size || 0));
  return jsonResponse({
    key: upload.key,
    uploadId: upload.uploadId,
    storageId,
    renamed: resolved.key !== key,
  });
}

export async function handleMultipartPart(env, request, url) {
  const key = url.searchParams.get("key");
  const uploadId = url.searchParams.get("uploadId");
  const partNumber = Number(url.searchParams.get("partNumber"));
  if (!key || !uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
    return jsonResponse(
      { success: false, message: "Invalid multipart part request" },
      400,
    );
  }
  assertUserKey(key);
  if (!request.body)
    return jsonResponse(
      { success: false, message: "Missing request body" },
      400,
    );
  const storageId =
    url.searchParams.get("storageId") ||
    (await resolveExistingStorageId(env, key));
  const part = await storageUploadPart(
    env,
    storageId,
    key,
    uploadId,
    partNumber,
    request.body,
  );
  return jsonResponse(part);
}

async function completeAndDeduplicate(env, request, body, storageId, key) {
  const { uploadId, parts, sha256, size: bodySize } = body;
  const object = await storageCompleteMultipartUpload(
    env,
    storageId,
    key,
    uploadId,
    parts,
  );
  if (!sha256 || !(await ensureStorageObjectsTable(env))) {
    const meta = await storageHead(env, storageId, key);
    await upsertFileIndex(env, key, {
      ...(meta || { uploaded: Date.now() }),
      storageId,
    });
    await addLog(env, request, "UPLOAD", key);
    return jsonResponse({
      success: true,
      key: object.key,
      etag: object.httpEtag,
      storageId,
    });
  }
  const meta = await storageHead(env, storageId, key);
  const size = Number(bodySize || meta?.size || 0);
  const contentType = meta?.httpMetadata?.contentType || "";
  const previous = await getFileIndexEntry(env, key);
  let storageObject = await getStorageObjectByHash(
    env,
    storageId,
    sha256,
    size,
  );
  const skippedUpload = Boolean(storageObject);
  if (storageObject) {
    // Dedup hit: existing storage_object found. The assembled temp at `key`
    // will be cleaned up after upsertFileIndex succeeds (see finally below).
  } else {
    if (size > 0) {
      if (!(await tryReserveStorageQuota(env, storageId, size))) {
        await storageAbortMultipartUpload(env, storageId, key, uploadId);
        return jsonResponse({ success: false, code: "QUOTA_EXCEEDED", message: "存储配额不足" }, 507);
      }
    }
    try {
      const objectKey = storageObjectKeyForSha256(sha256);
      // Copy to permanent location first, then create the tracking record,
      // then delete the temp. This way a failure between copy and create
      // still leaves the assembled object at `key` for recovery.
      await storageCopy(env, storageId, key, storageId, objectKey, {
        httpMetadata: { contentType },
      });
      storageObject = await createStorageObject(env, {
        storageId,
        sha256,
        size,
        contentType,
      });
      await storageDelete(env, storageId, key);
    } catch (err) {
      if (size > 0) await releaseReservedQuota(env, storageId, size);
      throw err;
    }
  }
  if (storageObject) {
    try {
      await upsertFileIndex(env, key, {
        size,
        contentType,
        uploaded: Date.now(),
        storageId,
        objectKey: storageObject.object_key,
      });
      // Clean up the assembled temp key now that the index is updated.
      // For the dedup path this removes the assembled multipart object;
      // for the non-dedup path it was already deleted above.
      if (skippedUpload) {
        try { await storageDelete(env, storageId, key); } catch (_) {}
      }
    } finally {
      if (size > 0) await releaseReservedQuota(env, storageId, size);
    }
    if (previous && previous.object_key && previous.object_key !== storageObject.object_key) {
      const refs = await countFileIndexObjectRefs(env, storageId, previous.object_key);
      if (refs <= 0) {
        await storageDelete(env, storageId, previous.object_key);
        await deleteStorageObjectRecord(env, storageId, previous.object_key);
      }
    }
  }
  await addLog(env, request, "UPLOAD", key);
  return jsonResponse({
    success: true,
    key,
    etag: object.httpEtag,
    storageId,
    skippedUpload,
  });
}

export async function handleMultipartComplete(env, request, body) {
  const {
    key,
    uploadId,
    parts,
    sha256,
    size: bodySize,
    storageId: bodyStorageId,
  } = body || await request.json();
  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return jsonResponse(
      { success: false, message: "Invalid multipart complete request" },
      400,
    );
  }
  assertUserKey(key);
  const storageId = bodyStorageId || (await resolveExistingStorageId(env, key));
  try {
    return await completeAndDeduplicate(env, request, { ...body, key, uploadId, parts, sha256, size: bodySize }, storageId, key);
  } finally {
    await untrackMultipartUpload(env, uploadId);
  }
}

export async function handleMultipartAbort(env, request) {
  const { key, uploadId, storageId: bodyStorageId } = await request.json();
  if (!key || !uploadId)
    return jsonResponse(
      { success: false, message: "Invalid multipart abort request" },
      400,
    );
  assertUserKey(key);
  const storageId = bodyStorageId || (await resolveExistingStorageId(env, key));
  await storageAbortMultipartUpload(env, storageId, key, uploadId);
  await untrackMultipartUpload(env, uploadId);
  await addLog(env, request, "UPLOAD_ABORT", key);
  return jsonResponse({ success: true });
}
