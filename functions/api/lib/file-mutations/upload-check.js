import { jsonResponse, addLog, normalizeName } from "../common/index.js";
import { checkStorageQuota } from "../storage.js";
import {
  getStorageObjectByHash,
  ensureStorageObjectsTable,
  createStorageObject,
} from "../storage-objects.js";
import { upsertFileIndex } from "../file-index/index.js";
import { assertUserKey, normalizeUserKey, resolveUploadConflict } from "./helpers.js";

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
  const quota = await checkStorageQuota(env, storageId, Number(size || 0));
  if (!quota.allowed) {
    return jsonResponse({
      success: false,
      exists: true,
      code: "QUOTA_EXCEEDED",
      message: "存储配额不足",
    }, 507);
  }
  await upsertFileIndex(env, resolved.key, {
    size: Number(size || 0),
    contentType: "",
    uploaded: Date.now(),
    storageId,
    objectKey: storageObject.object_key,
  });
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
