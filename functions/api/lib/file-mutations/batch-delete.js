import { jsonResponse, addLog } from "../common/index.js";
import { resolveExistingStorageId, storageHead, storageList } from "../storage.js";
import { softDeleteTree } from "../trash.js";
import { assertUserKey, assertPathList, mapPathResults } from "./helpers.js";

export async function handleBatchDelete(env, request) {
  const { paths } = await request.json();
  const normalizedPaths = assertPathList(paths);
  const firstByPath = new Map();
  const uniquePaths = [];
  const results = new Array(normalizedPaths.length);

  for (let index = 0; index < normalizedPaths.length; index++) {
    const path = normalizedPaths[index];
    const firstIndex = firstByPath.get(path);
    if (firstIndex != null) {
      results[index] = { duplicateOf: firstIndex };
      continue;
    }
    firstByPath.set(path, index);
    uniquePaths.push(path);
  }

  const uniqueResults = await mapPathResults(uniquePaths, async (path) => {
    try {
      assertUserKey(path);
      await softDeleteTree(env, path, request);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: e.message || "Failed",
        code: e.code || undefined,
      };
    }
  });

  for (let i = 0; i < uniquePaths.length; i++) {
    results[firstByPath.get(uniquePaths[i])] = uniqueResults[i];
  }
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (!result?.duplicateOf && result?.duplicateOf !== 0) continue;
    const prior = results[result.duplicateOf];
    results[index] = prior?.ok
      ? { ok: false, message: "File or folder not found" }
      : { ok: false, message: prior?.message || "Failed", code: prior?.code };
  }

  const failed = [];
  let completed = 0;
  for (let index = 0; index < normalizedPaths.length; index++) {
    const result = results[index];
    if (result?.ok) {
      completed++;
      continue;
    }
    failed.push({
      path: normalizedPaths[index],
      message: result?.message || "Failed",
      code: result?.code || undefined,
    });
  }
  await addLog(
    env,
    request,
    "DELETE",
    `Move to trash ${completed}/${normalizedPaths.length} items`,
  );
  return jsonResponse(
    { success: failed.length === 0, completed, failed },
    failed.length && !completed ? 400 : 200,
  );
}

export async function handleOperationEstimate(env, request) {
  const { paths } = await request.json();
  const normalizedPaths = assertPathList(paths);
  const items = [];
  let totalObjects = 0;
  let truncated = false;
  const maxObjectsPerRequest = 1000;

  for (const key of normalizedPaths) {
    assertUserKey(key);
    const storageId = await resolveExistingStorageId(env, key);
    const exact = await storageHead(env, storageId, key);
    const listed = await storageList(
      env,
      storageId,
      { prefix: key + "/" },
      { maxObjects: 1001 },
    );
    const childCount = (listed.objects || []).length;
    const isFolder = childCount > 0;
    const exists = Boolean(exact || isFolder);
    const objectCount = (exact ? 1 : 0) + childCount;
    totalObjects += objectCount;
    truncated = truncated || Boolean(listed.truncated);
    items.push({
      path: key,
      exists,
      kind: isFolder ? "folder" : "file",
      objectCount,
      truncated: Boolean(listed.truncated),
    });
  }

  return jsonResponse({
    success: true,
    items,
    totalObjects,
    truncated,
    large: truncated || totalObjects > 500,
    shouldBatch: truncated || totalObjects > maxObjectsPerRequest,
    recommendedBatchSize: maxObjectsPerRequest,
  });
}
