import { jsonResponse, addLog } from "../common/index.js";
import { listFileIndexPrefix } from "../file-index/index.js";
import {
  resolveExistingObjectLocation,
  resolveExistingStorageId,
  storageHead,
  storageList,
} from "../storage.js";
import { softDeleteTree } from "../trash.js";
import { assertUserKey, assertPathList, mapPathResults } from "./helpers.js";

export async function handleBatchDelete(env, request, body) {
  const { paths } = body || await request.json();
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
    {
      details: `Move to trash ${completed}/${normalizedPaths.length} items`,
      targetPath:
        normalizedPaths.length === 1
          ? normalizedPaths[0]
          : normalizedPaths.join(", "),
    },
  );
  const allFailed = failed.length && !completed;
  return jsonResponse(
    {
      success: failed.length === 0,
      completed,
      failed,
      ...(allFailed ? { message: failed[0]?.message || "Delete failed" } : {}),
    },
    allFailed ? 400 : 200,
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
    const location = await resolveExistingObjectLocation(env, key);
    const storageId =
      location.storageId || (await resolveExistingStorageId(env, key));
    const exact = await storageHead(env, location.storageId, location.objectKey);
    const indexedRows = await listFileIndexPrefix(env, key);
    const listed = await storageList(
      env,
      storageId,
      { prefix: key + "/" },
      { maxObjects: 1001 },
    );
    const objectPaths = new Set();
    if (exact || location.indexed) objectPaths.add(key);
    for (const row of indexedRows || []) {
      if (row?.path) objectPaths.add(row.path);
    }
    for (const item of listed.objects || []) {
      if (item?.key) objectPaths.add(item.key);
    }
    const childCount = [...objectPaths].filter((path) => path !== key).length;
    const isFolder = childCount > 0;
    const exists = objectPaths.size > 0;
    const objectCount = objectPaths.size;
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
