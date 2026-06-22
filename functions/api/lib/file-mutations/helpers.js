import { normalizeName, isReservedKey } from "../common/index.js";
import { getFileIndexEntry } from "../file-index/index.js";
import { resolveExistingStorageId, storageHead, storageList } from "../storage.js";
import { mapWithConcurrency } from "../r2-tree.js";

export function assertUserKey(key) {
  if (isReservedKey(key)) throw new Error("Reserved system path");
}

export function normalizeDir(path) {
  const clean = String(path || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return clean ? clean.split("/").map(normalizeName).join("/") : "";
}

export function normalizeUserKey(key) {
  const clean = String(key || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!clean) throw new Error("Invalid path");
  return clean.split("/").map(normalizeName).join("/");
}

export function assertPathList(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 100) {
    throw new Error("Invalid paths");
  }
  return paths.map(normalizeUserKey);
}

export async function keyExists(env, key) {
  const entry = await getFileIndexEntry(env, key);
  if (entry) return true;
  const storageId = await resolveExistingStorageId(env, key);
  if (await storageHead(env, storageId, key)) return true;
  const listed = await storageList(env, storageId, {
    prefix: key + "/",
    limit: 1,
  });
  return Boolean(
    (listed.objects || []).length || (listed.delimitedPrefixes || []).length,
  );
}

export async function assertTargetAvailable(env, key) {
  if (await keyExists(env, key)) {
    const err = new Error("Target already exists");
    err.status = 409;
    throw err;
  }
}

export async function resolveUploadConflict(env, key, mode = "error") {
  const conflictMode = ["error", "overwrite", "rename", "skip"].includes(mode)
    ? mode
    : "error";
  if (!(await keyExists(env, key)))
    return { key, skipped: false, conflict: false };
  if (conflictMode === "skip") return { key, skipped: true, conflict: true };
  if (conflictMode === "overwrite")
    return { key, skipped: false, conflict: true };
  if (conflictMode !== "rename") {
    const err = new Error("Target already exists");
    err.status = 409;
    throw err;
  }

  const slash = key.lastIndexOf("/");
  const dir = slash >= 0 ? key.slice(0, slash + 1) : "";
  const name = slash >= 0 ? key.slice(slash + 1) : key;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const candidates = Array.from(
    { length: 100 },
    (_, i) => `${dir}${base} (${i + 1})${ext}`,
  );
  const placeholders = candidates.map(() => "?").join(",");
  try {
    const existing = await env.D1.prepare(
      `SELECT path FROM file_index WHERE path IN (${placeholders})`,
    )
      .bind(...candidates)
      .all();
    const existingSet = new Set((existing.results || []).map((r) => r.path));
    for (const candidate of candidates) {
      if (!existingSet.has(candidate))
        return { key: candidate, skipped: false, conflict: true };
    }
  } catch (_) {}
  throw new Error("Unable to generate unique filename");
}

const PATH_BATCH_CONCURRENCY = 4;

export async function mapPathResults(paths, worker, concurrency = PATH_BATCH_CONCURRENCY) {
  const work = paths.map((path, index) => ({ path, index }));
  const results = new Array(paths.length);
  await mapWithConcurrency(work, concurrency, async ({ path, index }) => {
    results[index] = await worker(path, index);
  });
  return results;
}

export function uploadKey(targetDir, name) {
  let destDir = normalizeDir(targetDir);
  if (destDir) destDir += "/";
  return (
    destDir +
    normalizeName(
      String(name || "")
        .split(/[\/\\]/)
        .pop(),
    )
  );
}
