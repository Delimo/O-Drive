import {
  jsonResponse,
  isHiddenKey,
  isReservedKey,
  assertCompleteListing,
} from "./common.js";
import { checkProtectedAccess } from "./protected-paths.js";
import { createZipStream } from "./zip-stream.js";
import {
  resolveExistingObjectLocation,
  storageList,
  storageGet,
  storageHead,
} from "./storage.js";

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

async function resolveZipEntries(env, path, hiddenPaths, auth, protectedPaths) {
  const clean = systemCleanPath(path);
  const location = await resolveExistingObjectLocation(env, clean);
  if (!location) return null;

  const storageId = location.storageId;
  const objectKey = location.objectKey;

  const prefix = objectKey ? objectKey + "/" : "";
  const listed = await storageList(env, storageId, { prefix, delimiter: "/" });
  const isFolder =
    listed.objects?.length > 0 || listed.delimitedPrefixes?.length > 0;

  const entries = [];

  if (isFolder) {
    const listed = await storageList(env, storageId, { prefix });
    assertCompleteListing(listed, `ZIP folder listing: ${path}`);
    const folderName = clean.split("/").filter(Boolean).pop() || "folder";
    for (const obj of listed.objects || []) {
      const relPath = obj.key.startsWith(prefix)
        ? obj.key.slice(prefix.length)
        : obj.key;
      if (!relPath || relPath === ".folder") continue;
      const fullKey = clean + "/" + relPath;
      if (isHiddenKey(fullKey, hiddenPaths) || isReservedKey(relPath)) continue;
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
      entries.push({
        name: folderName + "/" + relPath,
        size: obj.size,
        getStream: () =>
          storageGet(env, storageId, obj.key).then(
            (r) => r?.body || emptyStream(),
          ),
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
          (r) => r?.body || emptyStream(),
        ),
    });
  }

  return entries;
}

export async function handleZipDownload(
  env,
  request,
  hiddenPaths,
  auth,
  protectedPaths,
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

  let zipFilename = "archive.zip";
  if (rawPaths.length === 1) {
    const parts = systemCleanPath(rawPaths[0]).split("/").filter(Boolean);
    const base = parts.pop() || "archive";
    zipFilename = base + ".zip";
  }

  const allEntries = [];
  const results = await Promise.all(
    rawPaths.map((rawPath) =>
      resolveZipEntries(env, rawPath, hiddenPaths, auth, protectedPaths),
    ),
  );
  for (const entries of results) {
    if (entries) allEntries.push(...entries);
  }

  if (allEntries.length === 0)
    return jsonResponse(
      { success: false, message: "No files to download" },
      404,
    );

  const stream = createZipStream(allEntries);
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
    },
  });
}
