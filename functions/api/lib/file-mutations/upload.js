import { formatBytes as formatQuotaBytes, jsonResponse, normalizeName, addLog } from "../common/index.js";
import {
  countFileIndexObjectRefs,
  getFileIndexEntry,
  upsertFileIndex,
} from "../file-index/index.js";
import { checkStorageQuota, storageDelete, storagePut } from "../storage.js";
import {
  createStorageObject,
  deleteStorageObjectRecord,
  ensureStorageObjectsTable,
  getStorageObjectByHash,
  sha256Hex,
  storageObjectKeyForSha256,
} from "../storage-objects.js";
import { assertUserKey, normalizeUserKey, resolveUploadConflict } from "./helpers.js";

async function putLegacyUpload(env, file, resolved, storageId) {
  const quota = await checkStorageQuota(
    env,
    storageId,
    Number(file.size || 0),
  );
  if (!quota.allowed) {
    return {
      response: jsonResponse(
        {
          success: false,
          code: "QUOTA_EXCEEDED",
          storageId,
          message: `${quota.storageName} 空间配额不足。已使用 ${formatQuotaBytes(quota.used)} / ${formatQuotaBytes(quota.quota)}，本次需要 ${formatQuotaBytes(file.size || 0)}。`,
        },
        507,
      ),
    };
  }
  await storagePut(env, storageId, resolved.key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  await upsertFileIndex(env, resolved.key, {
    size: file.size,
    contentType: file.type,
    uploaded: Date.now(),
    storageId,
  });
  return { response: null };
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
    const legacy = await putLegacyUpload(env, file, resolved, storageId);
    if (legacy.response) return legacy.response;
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
    });
  }

  const previous = await getFileIndexEntry(env, resolved.key);
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

  if (!storageObject) {
    const quota = await checkStorageQuota(env, storageId, size);
    if (!quota.allowed) {
      return jsonResponse(
        {
          success: false,
          code: "QUOTA_EXCEEDED",
          storageId,
          message: `${quota.storageName} 空间配额不足。已使用 ${formatQuotaBytes(quota.used)} / ${formatQuotaBytes(quota.quota)}，本次需要 ${formatQuotaBytes(size)}。`,
        },
        507,
      );
    }
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
  }

  if (!storageObject) {
    const legacy = await putLegacyUpload(env, file, resolved, storageId);
    if (legacy.response) return legacy.response;
  } else {
    const indexed = await upsertFileIndex(env, resolved.key, {
      size,
      contentType,
      uploaded: Date.now(),
      storageId,
      objectKey: storageObject.object_key,
    });
    if (indexed)
      await cleanupReplacedObject(
        env,
        previous,
        storageId,
        storageObject.object_key,
      );
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
