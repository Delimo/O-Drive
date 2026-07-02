import {
  assertCompleteListing,
  isReservedKey,
  jsonResponse,
} from "../common/index.js";
import { listFileIndexPrefix } from "../file-index/index.js";
import {
  storageGet,
  storageList,
} from "../storage.js";
import { createZipStream } from "../zip-stream.js";
import { detectShareTarget } from "./directory.js";
import { childPath } from "./paths.js";

function emptyStream() {
  return new ReadableStream({
    start(controller) {
      controller.close();
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

async function collectFolderZipEntries(env, rootPath, subPath = "", filename = "folder") {
  const dir = childPath(rootPath, subPath);
  const prefix = dir ? `${dir}/` : "";
  const listed = await storageList(env, "r2", { prefix });
  assertCompleteListing(listed, `Share folder ZIP: ${dir}`);
  const baseName = filename || dir.split("/").pop() || "folder";
  const entries = [];
  const entryNames = new Set();
  const indexedRows = await listFileIndexPrefix(env, dir);
  for (const row of indexedRows || []) {
    if (!row?.path || row.path === dir) continue;
    if (dir && !row.path.startsWith(prefix)) continue;
    const relPath = dir ? row.path.slice(prefix.length) : row.path;
    if (
      !relPath ||
      relPath === ".folder" ||
      relPath.endsWith("/.folder") ||
      isReservedKey(row.path)
    )
      continue;
    const name = `${baseName}/${relPath}`;
    entryNames.add(name);
    entries.push({
      name,
      size: row.size,
      getStream: () =>
        storageGet(env, row.storage_id || "r2", row.object_key || row.path).then((res) =>
          bodyStream(res?.body),
        ),
    });
  }
  for (const obj of listed.objects || []) {
    const relPath = obj.key.startsWith(prefix) ? obj.key.slice(prefix.length) : obj.key;
    const fullKey = dir ? `${dir}/${relPath}` : relPath;
    if (
      !relPath ||
      relPath === ".folder" ||
      relPath.endsWith("/.folder") ||
      isReservedKey(fullKey)
    )
      continue;
    const name = `${baseName}/${relPath}`;
    if (entryNames.has(name)) continue;
    entries.push({
      name,
      size: obj.size,
      getStream: () => storageGet(env, "r2", obj.key).then((res) => bodyStream(res?.body)),
    });
  }
  return entries;
}

export async function folderZipResponse(env, rootPath, subPath = "", filename = "folder") {
  const entries = await collectFolderZipEntries(env, rootPath, subPath, filename);
  const baseName = filename || childPath(rootPath, subPath).split("/").pop() || "folder";
  if (!entries.length)
    return jsonResponse({ success: false, message: "No files to download" }, 404);
  return new Response(createZipStream(entries), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(baseName + ".zip")}`,
    },
  });
}

function uniqueZipName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const slashIndex = name.lastIndexOf("/");
  const dir = slashIndex >= 0 ? name.slice(0, slashIndex + 1) : "";
  const base = slashIndex >= 0 ? name.slice(slashIndex + 1) : name;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let index = 2;
  let candidate = "";
  do {
    candidate = `${dir}${stem} (${index})${ext}`;
    index++;
  } while (usedNames.has(candidate));
  usedNames.add(candidate);
  return candidate;
}

export async function bundleZipResponse(env, item) {
  const entries = [];
  const usedNames = new Set();
  for (const sharedItem of item.items || []) {
    if (sharedItem.targetType === "folder") {
      const folderEntries = await collectFolderZipEntries(
        env,
        sharedItem.path,
        "",
        sharedItem.name || sharedItem.path.split("/").pop() || "folder",
      );
      for (const entry of folderEntries) {
        entries.push({ ...entry, name: uniqueZipName(entry.name, usedNames) });
      }
      continue;
    }
    const target = await detectShareTarget(env, sharedItem.path);
    if (!target || target.targetType !== "file") continue;
    entries.push({
      name: uniqueZipName(sharedItem.name || sharedItem.path.split("/").pop() || "file", usedNames),
      size: Number(target.size || sharedItem.size || 0),
      getStream: () =>
        storageGet(env, target.storageId, target.objectKey).then((res) =>
          bodyStream(res?.body),
        ),
    });
  }
  if (!entries.length)
    return jsonResponse({ success: false, message: "No files to download" }, 404);
  return new Response(createZipStream(entries), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent((item.name || "shared-files") + ".zip")}`,
    },
  });
}
