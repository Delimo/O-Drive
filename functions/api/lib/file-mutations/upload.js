import { jsonResponse, normalizeName, addLog } from "../common/index.js";
import {
  countFileIndexObjectRefs,
  getFileIndexEntry,
} from "../file-index/index.js";
import { releaseReservedQuota, storageDelete, storagePut, tryReserveStorageQuota } from "../storage.js";
import {
  createStorageObject,
  deleteStorageObjectRecord,
  ensureStorageObjectsTable,
  getStorageObjectByHash,
  sha256Hex,
  storageObjectKeyForSha256,
} from "../storage-objects.js";
import { assertUserKey, normalizeUserKey, resolveUploadConflict, writeUploadIndex } from "./helpers.js";

async function putLegacyUpload(env, file, originalKey, resolved, storageId, conflictMode) {
  const size = Number(file.size || 0);
  const objectKey =
    conflictMode === "overwrite"
      ? resolved.key
      : `.system/uploads/${crypto.randomUUID()}-${resolved.key.split("/").pop() || "upload"}`;
  let reserved = false;
  if (size > 0) {
    if (!(await tryReserveStorageQuota(env, storageId, size))) {
      return {
        response: jsonResponse(
          { success: false, code: "QUOTA_EXCEEDED", storageId, message: "Cloudflare R2 空间配额不足。" },
          507,
        ),
      };
    }
    reserved = true;
  }
  try {
    await storagePut(env, storageId, objectKey, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    const indexed = await writeUploadIndex(env, originalKey, {
      size,
      contentType: file.type,
      uploaded: Date.now(),
      storageId,
      objectKey,
    }, conflictMode, { firstKey: resolved.key });
    return { response: null, key: indexed.key, renamed: indexed.key !== originalKey };
  } catch (err) {
    try { await storageDelete(env, storageId, objectKey); } catch (_) {}
    throw err;
  } finally {
    if (reserved) await releaseReservedQuota(env, storageId, size);
  }
}

async function cleanupReplacedObject(env, previous, nextStorageId, nextObjectKey) {
  if (!previous) return;
  const previousStorageId = previous.storage_id || "r2";
  const previousObjectKey = previous.object_key || previous.path || "";
  if (
    !previousObjectKey ||
    (previousStorageId === nextStorageId && previousObjectKey === nextObjectKey)
  ) {
    return;
  }
  const refs = await countFileIndexObjectRefs(
    env,
    previousStorageId,
    previousObjectKey,
  );
  if (refs > 0) return;
  await storageDelete(env, previousStorageId, previousObjectKey);
  await deleteStorageObjectRecord(env, previousStorageId, previousObjectKey);
}

export async function handleUpload(env, request, r2Key, meta = {}) {
  const file = (await request.formData()).get("file");
  if (!file || typeof file.stream !== "function")
    return jsonResponse({ success: false, message: "Missing file" }, 400);
  const cleanName = normalizeName((file?.name || "").split(/[\/\\]/).pop());
  const key = (r2Key ? normalizeUserKey(r2Key) + "/" : "") + cleanName;
  const conflict = new URL(request.url).searchParams.get("conflict") || "error";
  assertUserKey(key);
  const resolved = await resolveUploadConflict(env, key, conflict);
  if (resolved.skipped)
    return jsonResponse({ success: true, skipped: true, key });
  const storageId = "r2";

  if (
    typeof file.arrayBuffer !== "function" ||
    !(await ensureStorageObjectsTable(env))
  ) {
    const legacy = await putLegacyUpload(env, file, key, resolved, storageId, conflict);
    if (legacy.response) return legacy.response;
    await addLog(
      env,
      request,
      resolved.conflict ? "UPLOAD_CONFLICT" : "UPLOAD",
      legacy.key,
    );
    meta.webhook = { key: legacy.key };
    return jsonResponse({
      success: true,
      key: legacy.key,
      renamed: legacy.renamed,
      storageId,
    });
  }

  const previous = conflict === "overwrite" ? await getFileIndexEntry(env, resolved.key) : null;
  const buffer = await file.arrayBuffer();
  const size = Number(file.size || buffer.byteLength || 0);
  const contentType = file.type || "";
  const sha256 = await sha256Hex(buffer);
  let storageObject = await getStorageObjectByHash(
    env,
    storageId,
    sha256,
    size,
  );
  const skippedUpload = Boolean(storageObject);

  let reserved = false;
  if (!storageObject) {
    if (!(await tryReserveStorageQuota(env, storageId, size))) {
      return jsonResponse(
        { success: false, code: "QUOTA_EXCEEDED", storageId, message: "Cloudflare R2 空间配额不足。" },
        507,
      );
    }
    reserved = true;
    try {
      const objectKey = storageObjectKeyForSha256(sha256);
      await storagePut(env, storageId, objectKey, buffer, {
        httpMetadata: { contentType },
      });
      storageObject = await createStorageObject(env, {
        storageId,
        sha256,
        size,
        contentType,
      });
    } finally {
      if (!storageObject) {
        await releaseReservedQuota(env, storageId, size);
        reserved = false;
      }
    }
  }

  if (!storageObject) {
    const legacy = await putLegacyUpload(env, file, key, resolved, storageId, conflict);
    if (legacy.response) return legacy.response;
  } else {
    let indexed = { key: resolved.key, renamed: resolved.key !== key };
    try {
      indexed = await writeUploadIndex(env, key, {
        size,
        contentType,
        uploaded: Date.now(),
        storageId,
        objectKey: storageObject.object_key,
      }, conflict, { firstKey: resolved.key });
      if (indexed)
        await cleanupReplacedObject(
          env,
          previous,
          storageId,
          storageObject.object_key,
        );
    } finally {
      if (reserved) await releaseReservedQuota(env, storageId, size);
    }
    resolved.key = indexed.key;
  }
  await addLog(
    env,
    request,
    resolved.conflict ? "UPLOAD_CONFLICT" : "UPLOAD",
    resolved.key,
  );
  meta.webhook = { key: resolved.key };
  return jsonResponse({
    success: true,
    key: resolved.key,
    renamed: resolved.key !== key,
    storageId,
    skippedUpload,
  });
}
