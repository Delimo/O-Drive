import { formatBytes as formatQuotaBytes, jsonResponse, addLog } from "../common/index.js";
import { countFileIndexObjectRefs, getFileIndexEntry, upsertFileIndex } from "../file-index/index.js";
import {
  checkStorageQuota,
  resolveExistingStorageId,
  storageAbortMultipartUpload,
  storageCompleteMultipartUpload,
  storageCopy,
  storageCreateMultipartUpload,
  storageDelete,
  storageHead,
  storageUploadPart,
} from "../storage.js";
import {
  createStorageObject,
  deleteStorageObjectRecord,
  ensureStorageObjectsTable,
  getStorageObjectByHash,
  storageObjectKeyForSha256,
} from "../storage-objects.js";
import { assertUserKey, resolveUploadConflict, uploadKey } from "./helpers.js";

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
  const incomingBytes = Number(totalSize || size || 0);
  if (incomingBytes > 0) {
    const quota = await checkStorageQuota(env, storageId, incomingBytes);
    if (!quota.allowed) {
      return jsonResponse(
        {
          success: false,
          code: "QUOTA_EXCEEDED",
          storageId,
          message: `${quota.storageName} 空间配额不足。剩余 ${formatQuotaBytes(quota.remaining)} / ${formatQuotaBytes(quota.quota)}。`,
        },
        507,
      );
    }
  }
  const upload = await storageCreateMultipartUpload(env, storageId, resolved.key, {
    httpMetadata: { contentType: type || "application/octet-stream" },
  });
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
    await storageDelete(env, storageId, key);
  } else {
    const objectKey = storageObjectKeyForSha256(sha256);
    await storageCopy(env, storageId, key, storageId, objectKey, {
      httpMetadata: { contentType },
    });
    await storageDelete(env, storageId, key);
    storageObject = await createStorageObject(env, {
      storageId,
      sha256,
      size,
      contentType,
    });
  }
  if (storageObject) {
    await upsertFileIndex(env, key, {
      size,
      contentType,
      uploaded: Date.now(),
      storageId,
      objectKey: storageObject.object_key,
    });
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
  return completeAndDeduplicate(env, request, { ...body, key, uploadId, parts, sha256, size: bodySize }, storageId, key);
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
  await addLog(env, request, "UPLOAD_ABORT", key);
  return jsonResponse({ success: true });
}
