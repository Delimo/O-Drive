import { formatBytes as formatQuotaBytes, jsonResponse, normalizeName, addLog } from "../common/index.js";
import { upsertFileIndex } from "../file-index/index.js";
import { checkStorageQuota, storagePut } from "../storage.js";
import { assertUserKey, normalizeUserKey, resolveUploadConflict } from "./helpers.js";

export async function handleUpload(env, request, r2Key) {
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
  const quota = await checkStorageQuota(
    env,
    storageId,
    Number(file.size || 0),
  );
  if (!quota.allowed) {
    return jsonResponse(
      {
        success: false,
        code: "QUOTA_EXCEEDED",
        storageId,
        message: `${quota.storageName} 空间配额不足。已使用 ${formatQuotaBytes(quota.used)} / ${formatQuotaBytes(quota.quota)}，本次需要 ${formatQuotaBytes(file.size || 0)}。`,
      },
      507,
    );
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
  await addLog(
    env,
    request,
    resolved.conflict ? "UPLOAD_CONFLICT" : "UPLOAD",
    resolved.key,
  );
  return jsonResponse({
    success: true,
    key: resolved.key,
    renamed: resolved.key !== key,
    storageId,
  });
}
