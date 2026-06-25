import { jsonResponse, addLog } from "../common/index.js";
import { upsertFileIndex } from "../file-index/index.js";
import { resolveExistingStorageId, storagePut } from "../storage.js";
import { assertUserKey, normalizeUserKey } from "./helpers.js";

export async function handleSaveText(env, request, r2Key) {
  r2Key = normalizeUserKey(r2Key);
  assertUserKey(r2Key);
  const body = await request.json();
  if (typeof body.content !== "string")
    return jsonResponse({ success: false, message: "Invalid content" }, 400);
  const storageId = await resolveExistingStorageId(env, r2Key);
  await storagePut(env, storageId, r2Key, body.content, {
    httpMetadata: { contentType: "text/plain" },
  });
  await upsertFileIndex(env, r2Key, {
    size: new TextEncoder().encode(body.content).byteLength,
    contentType: "text/plain",
    uploaded: Date.now(),
    storageId,
  });
  await addLog(env, request, "SAVE_TEXT", r2Key);
  return jsonResponse({ success: true });
}
