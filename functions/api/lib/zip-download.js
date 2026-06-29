import {
  jsonResponse,
  isHiddenKey,
  isReservedKey,
  assertCompleteListing,
  formatBytes,
} from "./common/index.js";
import { checkProtectedAccess } from "./protected-paths.js";
import { listFileIndexPrefix } from "./file-index/index.js";
import { createZipStream } from "./zip-stream.js";
import {
  resolveExistingObjectLocation,
  storageList,
  storageGet,
  storageHead,
  storagePut,
  storageDelete,
} from "./storage.js";
import { createFileTaskDirect } from "./tasks.js";

const DEFAULT_INLINE_MAX_FILES = 200;
const DEFAULT_INLINE_MAX_BYTES = 100 * 1024 * 1024;
const ZIP_TASK_PREFIX = ".system/zip-tasks";
const DEFAULT_ZIP_TASK_RETENTION_DAYS = 7;

function systemCleanPath(path = "") {
  return String(path || "").replace(/^\/+|\/+$/g, "");
}

function emptyStream() {
  return new ReadableStream({
    start(c) {
      c.close();
    },
  });
}

function bodyStream(body) {
  if (!body) return emptyStream();
  if (typeof body?.getReader === "function") return body;
  const bytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function zipFilenameForPaths(paths = []) {
  if (paths.length === 1) {
    const parts = systemCleanPath(paths[0]).split("/").filter(Boolean);
    const base = parts.pop() || "archive";
    return base + ".zip";
  }
  return "archive.zip";
}

function zipThreshold(env, name, fallback) {
  const value = Number(env?.[name] || 0);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function shouldRunInline(env, summary) {
  return (
    summary.fileCount <= zipThreshold(env, "ZIP_INLINE_MAX_FILES", DEFAULT_INLINE_MAX_FILES) &&
    summary.totalBytes <= zipThreshold(env, "ZIP_INLINE_MAX_BYTES", DEFAULT_INLINE_MAX_BYTES)
  );
}

async function resolveZipEntries(env, path, hiddenPaths, auth, protectedPaths) {
  const clean = systemCleanPath(path);
  const location = await resolveExistingObjectLocation(env, clean);
  if (!location) return null;

  const storageId = location.storageId;
  const objectKey = location.objectKey;
  const indexedRows = await listFileIndexPrefix(env, clean);
  const indexedChildren = indexedRows.filter((row) => {
    if (!row?.path || row.path === clean) return false;
    if (!clean) return true;
    return row.path.startsWith(clean + "/");
  });

  const prefix = clean ? clean + "/" : "";
  const listed = await storageList(env, storageId, { prefix, delimiter: "/" });
  const isFolder =
    indexedChildren.length > 0 ||
    listed.objects?.length > 0 || listed.delimitedPrefixes?.length > 0;

  const entries = [];

  if (isFolder) {
    const listed = await storageList(env, storageId, { prefix });
    assertCompleteListing(listed, `ZIP folder listing: ${path}`);
    const folderName = clean.split("/").filter(Boolean).pop() || "folder";
    const entryNames = new Set();
    for (const row of indexedChildren) {
      const relPath = clean ? row.path.slice(clean.length + 1) : row.path;
      if (!relPath || relPath === ".folder" || relPath.endsWith("/.folder"))
        continue;
      if (isHiddenKey(row.path, hiddenPaths) || isReservedKey(row.path)) continue;
      if (auth.role !== "admin") {
        const access = await checkProtectedAccess(
          null,
          env,
          auth,
          protectedPaths,
          row.path,
        );
        if (!access.ok) continue;
      }
      const name = folderName + "/" + relPath;
      entryNames.add(name);
      entries.push({
        name,
        size: row.size,
        getStream: () =>
          storageGet(env, row.storage_id || "r2", row.object_key || row.path).then(
            (r) => bodyStream(r?.body),
          ),
      });
    }
    for (const obj of listed.objects || []) {
      const relPath = obj.key.startsWith(prefix)
        ? obj.key.slice(prefix.length)
        : obj.key;
      if (!relPath || relPath === ".folder" || relPath.endsWith("/.folder"))
        continue;
      const fullKey = clean ? clean + "/" + relPath : relPath;
      if (isHiddenKey(fullKey, hiddenPaths) || isReservedKey(fullKey)) continue;
      if (auth.role !== "admin") {
        const access = await checkProtectedAccess(
          null,
          env,
          auth,
          protectedPaths,
          fullKey,
        );
        if (!access.ok) continue;
      }
      const name = folderName + "/" + relPath;
      if (entryNames.has(name)) continue;
      entries.push({
        name,
        size: obj.size,
        getStream: () =>
          storageGet(env, storageId, obj.key).then((r) => bodyStream(r?.body)),
      });
    }
  } else {
    if (isHiddenKey(clean, hiddenPaths) && auth.role !== "admin") return null;
    if (auth.role !== "admin") {
      const access = await checkProtectedAccess(
        null,
        env,
        auth,
        protectedPaths,
        clean,
      );
      if (!access.ok) return null;
    }
    const meta = await storageHead(env, storageId, objectKey);
    if (!meta) return null;
    const filename = clean.split("/").filter(Boolean).pop() || "file";
    entries.push({
      name: filename,
      size: meta.size,
      getStream: () =>
        storageGet(env, storageId, objectKey).then(
          (r) => bodyStream(r?.body),
        ),
    });
  }

  return entries;
}

export async function resolveZipArchive(
  env,
  paths,
  hiddenPaths,
  auth,
  protectedPaths,
) {
  const allEntries = [];
  const results = await Promise.all(
    paths.map((rawPath) =>
      resolveZipEntries(env, rawPath, hiddenPaths, auth, protectedPaths),
    ),
  );
  for (const entries of results) {
    if (entries) allEntries.push(...entries);
  }
  const totalBytes = allEntries.reduce((sum, entry) => sum + Number(entry.size || 0), 0);
  return {
    entries: allEntries,
    summary: {
      fileCount: allEntries.length,
      totalBytes,
      totalBytesFormatted: formatBytes(totalBytes),
    },
  };
}

export function zipDownloadUrl(outputKey) {
  return outputKey ? `/api/download/${outputKey.split("/").map(encodeURIComponent).join("/")}` : "";
}

function zipTaskRetentionMs(env) {
  const days = Number(env?.ZIP_TASK_RETENTION_DAYS || DEFAULT_ZIP_TASK_RETENTION_DAYS);
  return Math.max(1, Number.isFinite(days) ? days : DEFAULT_ZIP_TASK_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
}

export async function cleanupZipTaskResults(env, { force = false, now = Date.now() } = {}) {
  const cutoff = force ? Infinity : now - zipTaskRetentionMs(env);
  let deleted = 0;
  let bytes = 0;
  let cursor;
  do {
    const listed = await storageList(env, "r2", { prefix: `${ZIP_TASK_PREFIX}/`, cursor });
    for (const obj of listed.objects || []) {
      const uploaded = obj.uploaded instanceof Date ? obj.uploaded.getTime() : Number(new Date(obj.uploaded || 0).getTime());
      if (!force && Number.isFinite(uploaded) && uploaded > cutoff) continue;
      await storageDelete(env, "r2", obj.key);
      deleted++;
      bytes += Number(obj.size || 0);
    }
    cursor = listed.truncated ? listed.cursor : "";
  } while (cursor);
  return { deleted, bytes, bytesFormatted: formatBytes(bytes) };
}

export async function buildZipArchiveForTask(
  env,
  taskId,
  payload,
  request,
) {
  await cleanupZipTaskResults(env).catch(() => {});
  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  const hiddenPaths = Array.isArray(payload.hiddenPaths) ? payload.hiddenPaths : [];
  const protectedPaths = Array.isArray(payload.protectedPaths) ? payload.protectedPaths : [];
  const auth = payload.auth && typeof payload.auth === "object" ? payload.auth : { role: "admin" };
  const filename = payload.filename || zipFilenameForPaths(paths);
  const { entries, summary } = await resolveZipArchive(
    env,
    paths,
    hiddenPaths,
    auth,
    protectedPaths,
  );
  if (!entries.length) throw new Error("No files to download");

  const response = new Response(createZipStream(entries));
  const arrayBuffer = await response.arrayBuffer();
  const outputKey = `${ZIP_TASK_PREFIX}/${taskId}/${filename}`;
  await storagePut(env, "r2", outputKey, arrayBuffer, {
    httpMetadata: { contentType: "application/zip" },
  });
  return {
    success: true,
    completed: entries.length,
    failed: 0,
    filename,
    outputKey,
    downloadUrl: zipDownloadUrl(outputKey),
    fileCount: summary.fileCount,
    totalBytes: summary.totalBytes,
    totalBytesFormatted: summary.totalBytesFormatted,
    message: `ZIP archive ready: ${filename}`,
  };
}

export async function handleZipDownload(
  env,
  request,
  hiddenPaths,
  auth,
  protectedPaths,
  context = {},
) {
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return jsonResponse({ success: false, message: "Invalid JSON body" }, 400);
  }
  const rawPaths = body.paths;
  if (!Array.isArray(rawPaths) || rawPaths.length === 0)
    return jsonResponse(
      { success: false, message: "paths array required" },
      400,
    );

  const zipFilename = zipFilenameForPaths(rawPaths);

  const { entries: allEntries, summary } = await resolveZipArchive(
    env,
    rawPaths,
    hiddenPaths,
    auth,
    protectedPaths,
  );

  if (allEntries.length === 0)
    return jsonResponse(
      { success: false, message: "No files to download" },
      404,
    );
  if (!shouldRunInline(env, summary)) {
    if (auth.role !== "admin") {
      return jsonResponse(
        {
          success: false,
          code: "ZIP_TOO_LARGE",
          message: "Archive is too large for direct download",
          summary,
        },
        413,
      );
    }
    return await createFileTaskDirect(env, request, context, {
      type: "zip_download",
      payload: {
        paths: rawPaths.map(systemCleanPath),
        hiddenPaths,
        protectedPaths,
        auth: { role: auth.role },
        filename: zipFilename,
      },
      total: summary.fileCount,
      result: { summary, filename: zipFilename },
    });
  }

  const stream = createZipStream(allEntries);
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
    },
  });
}
