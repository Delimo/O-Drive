import { jsonResponse, normalizeName, addLog } from "../common/index.js";
import { storagePut } from "../storage.js";
import { assertUserKey, normalizeUserKey, assertTargetAvailable } from "./helpers.js";

export async function handleMkdir(env, request, r2Key) {
  const { folderName } = await request.json();
  const cleanName = normalizeName(folderName);
  const dir = r2Key ? normalizeUserKey(r2Key) + "/" : "";
  const folderKey = dir + cleanName;
  const key = folderKey + "/.folder";
  assertUserKey(key);
  await assertTargetAvailable(env, folderKey);
  await storagePut(env, "r2", key, new Uint8Array(0));
  await addLog(env, request, "MKDIR", cleanName);
  return jsonResponse({
    success: true,
    key: folderKey,
    path: `/${folderKey}/`,
    storageId: "r2",
  });
}
