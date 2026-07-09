import { jsonResponse, addLog, normalizeName } from "../common/index.js";
import { releaseReservedQuota, tryReserveStorageQuota } from "../storage.js";
import {
  getStorageObjectByHash,
  ensureStorageObjectsTable,
  createStorageObject,
} from "../storage-objects.js";
import { assertUserKey, normalizeUserKey, resolveUploadConflict, writeUploadIndex } from "./helpers.js";

export async function handleUploadCheck(env, request) {
  const { targetDir, name, size, sha256, conflict } = await request.json().catch(() => ({}));
  if (!name || !size || !sha256) {
    return jsonResponse({ success: false, message: "Missing required fields: name, size, sha256" }, 400);
  }
  const cleanName = normalizeName(String(name).split(/[\/\\]/).pop());
  const key = (targetDir ? normalizeUserKey(String(targetDir)) + "/" : "") + cleanName;
  const conflictMode = conflict || "error";
  assertUserKey(key);
  const resolved = await resolveUploadConflict(env, key, conflictMode);
  if (resolved.skipped) {
    return jsonResponse({ success: true, exists: true, key, skipped: true });
  }
  const storageId = "r2";
  if (!(await ensureStorageObjectsTable(env))) {
    return jsonResponse({ success: false, message: "Storage objects table unavailable" }, 500);
  }
  const storageObject = await getStorageObjectByHash(
    env,
    storageId,
    String(sha256).toLowerCase(),
    Number(size || 0),
  );
  if (!storageObject) {
    return jsonResponse({ success: true, exists: false });
  }
  const sizeNum = Number(size || 0);
  let reserved = false;
  if (sizeNum > 0) {
    if (!(await tryReserveStorageQuota(env, storageId, sizeNum))) {
      return jsonResponse({ success: false, exists: true, code: "QUOTA_EXCEEDED", message: "Cloudflare R2 空间配额不足" }, 507);
    }
    reserved = true;
  }
  try {
    const indexed = await writeUploadIndex(env, key, {
      size: sizeNum,
      contentType: "",
      uploaded: Date.now(),
      storageId,
      objectKey: storageObject.object_key,
    }, conflictMode, { firstKey: resolved.key });
    resolved.key = indexed.key;
  } finally {
    if (reserved) await releaseReservedQuota(env, storageId, sizeNum);
  }
  await addLog(env, request, resolved.conflict ? "UPLOAD_CONFLICT" : "UPLOAD", resolved.key);
  return jsonResponse({
    success: true,
    exists: true,
    key: resolved.key,
    renamed: resolved.key !== key,
    storageId,
    skippedUpload: true,
  });
}
