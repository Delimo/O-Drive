import { jsonResponse, normalizeName, addLog } from "../common/index.js";
import { copyTree } from "../r2-tree.js";
import {
  assertUserKey,
  assertPathList,
  normalizeDir,
  keyExists,
  assertTargetAvailable,
  mapPathResults,
} from "./helpers.js";

export async function handlePaste(env, request, body) {
  const { action, paths, targetDir } = body || await request.json();
  if (!["copy", "move"].includes(action))
    return jsonResponse(
      { success: false, message: "Invalid paste action" },
      400,
    );
  const normalizedPaths = assertPathList(paths);
  let destDir = normalizeDir(targetDir);
  if (destDir !== "") destDir += "/";
  const primaryTasks = [];
  const aliases = [];
  const firstByDest = new Map();
  const immediateResults = new Array(normalizedPaths.length);

  for (let index = 0; index < normalizedPaths.length; index++) {
    const srcKey = normalizedPaths[index];
    try {
      const sourceName = normalizeName(srcKey.split("/").pop());
      const destKey = destDir + sourceName;
      assertUserKey(srcKey);
      assertUserKey(destKey);
      if (srcKey === destKey) {
        immediateResults[index] = { ok: true, skipped: true };
        continue;
      }
      const firstIndex = firstByDest.get(destKey);
      if (firstIndex != null) {
        aliases.push({
          index,
          srcKey,
          destKey,
          firstIndex,
          sameSource: normalizedPaths[firstIndex] === srcKey,
        });
        continue;
      }
      firstByDest.set(destKey, index);
      primaryTasks.push({ srcKey, destKey, index });
    } catch (e) {
      immediateResults[index] = { ok: false, message: e.message || "Failed" };
    }
  }

  const primaryResults = await mapPathResults(primaryTasks, async (task) => {
    try {
      if (!(await keyExists(env, task.srcKey)))
        throw new Error("File or folder not found");
      await assertTargetAvailable(env, task.destKey);
      const copyResult = await copyTree(
        env,
        task.srcKey,
        task.destKey,
        action === "move",
      );
      return { ok: true, failed: copyResult.failed || [] };
    } catch (e) {
      return { ok: false, message: e.message || "Failed" };
    }
  });

  const results = [...immediateResults];
  for (let i = 0; i < primaryTasks.length; i++) {
    results[primaryTasks[i].index] = primaryResults[i];
  }
  for (const alias of aliases) {
    const prior = results[alias.firstIndex];
    if (prior?.ok && prior?.skipped) {
      results[alias.index] = { ok: true, skipped: true };
      continue;
    }
    if (prior?.ok) {
      results[alias.index] = {
        ok: false,
        message:
          alias.sameSource && action === "move"
            ? "File or folder not found"
            : "Target already exists",
      };
      continue;
    }
    results[alias.index] = { ok: false, message: prior?.message || "Failed" };
  }

  const failed = [];
  let completed = 0;
  for (let index = 0; index < normalizedPaths.length; index++) {
    const result = results[index];
    if (result?.ok) {
      if (!result.skipped) completed++;
      for (const item of result.failed || []) {
        failed.push({
          path: item.path || normalizedPaths[index],
          message: item.message || "Failed",
        });
      }
      continue;
    }
    failed.push({
      path: normalizedPaths[index],
      message: result?.message || "Failed",
    });
  }

  await addLog(
    env,
    request,
    action.toUpperCase(),
    `Batch paste to ${targetDir}`,
  );
  return jsonResponse(
    { success: failed.length === 0, completed, failed },
    failed.length && !completed ? 409 : 200,
  );
}
