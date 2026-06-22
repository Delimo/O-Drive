import { jsonResponse, normalizeName, addLog } from "../common/index.js";
import { copyTree } from "../r2-tree.js";
import { assertUserKey, normalizeUserKey, keyExists, assertTargetAvailable } from "./helpers.js";

export async function handleRename(env, request, r2Key) {
  const { newName } = await request.json();
  const cleanName = normalizeName(newName);
  r2Key = normalizeUserKey(r2Key);
  const parentDir = r2Key.includes("/")
    ? r2Key.substring(0, r2Key.lastIndexOf("/") + 1)
    : "";
  const newKey = parentDir + cleanName;
  assertUserKey(r2Key);
  assertUserKey(newKey);
  if (!(await keyExists(env, r2Key))) {
    const err = new Error("File or folder not found");
    err.status = 404;
    throw err;
  }
  if (r2Key === newKey) return jsonResponse({ success: true });
  if (r2Key !== newKey) await assertTargetAvailable(env, newKey);
  await copyTree(env, r2Key, newKey, true);
  await addLog(env, request, "RENAME", `${r2Key} -> ${cleanName}`);
  return jsonResponse({ success: true });
}
