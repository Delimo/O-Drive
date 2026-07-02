import { isReservedKey } from "../common/index.js";
import { listIndexedDirectory } from "../file-index/index.js";
import {
  resolveExistingObjectLocation,
  storageHead,
  storageList,
} from "../storage.js";
import { mapFolderEntry } from "./mapping.js";
import {
  childPath,
  cleanShareSubPath,
  normalizeSharePath,
} from "./paths.js";

async function folderExists(env, path) {
  const clean = normalizeSharePath(path);
  const prefix = clean + "/";
  const listed = await storageList(env, "r2", { prefix, delimiter: "/" });
  if ((listed.objects || []).length || (listed.delimitedPrefixes || []).length)
    return true;
  const indexed = await listIndexedDirectory(env, clean);
  return Boolean((indexed.files || []).length || (indexed.folders || []).length);
}

export async function detectShareTarget(env, path) {
  const location = await resolveExistingObjectLocation(env, path);
  const meta = await storageHead(env, location.storageId, location.objectKey);
  if (meta) {
    return {
      targetType: "file",
      storageId: location.storageId,
      objectKey: location.objectKey,
      size: Number(meta.size || 0),
      contentType: meta.httpMetadata?.contentType || meta.contentType || "",
    };
  }
  if (await folderExists(env, path)) {
    return {
      targetType: "folder",
      storageId: "r2",
      objectKey: path,
      size: 0,
      contentType: "inode/directory",
    };
  }
  return null;
}

export async function listShareDirectory(env, rootPath, subPath = "") {
  const dir = childPath(rootPath, subPath);
  const prefix = dir ? `${dir}/` : "";
  const listed = await storageList(env, "r2", { prefix, delimiter: "/" });
  const indexed = await listIndexedDirectory(env, dir);

  const folderMap = new Map();
  for (const folder of indexed.folders || []) {
    if (folder.fullKey && !isReservedKey(folder.fullKey))
      folderMap.set(folder.fullKey, mapFolderEntry(folder, "folder"));
  }
  for (const p of listed.delimitedPrefixes || []) {
    const fullKey = p.replace(/\/$/, "");
    if (!fullKey || isReservedKey(fullKey)) continue;
    folderMap.set(
      fullKey,
      mapFolderEntry(
        { fullKey, name: fullKey.split("/").pop() || fullKey },
        "folder",
      ),
    );
  }

  const fileMap = new Map();
  for (const file of indexed.files || []) {
    if (file.fullKey && file.name !== ".folder" && !isReservedKey(file.fullKey))
      fileMap.set(file.fullKey, mapFolderEntry(file, "file"));
  }
  for (const obj of listed.objects || []) {
    const name = obj.key.slice(prefix.length);
    if (!name || name === ".folder" || name.includes("/") || isReservedKey(obj.key))
      continue;
    fileMap.set(
      obj.key,
      mapFolderEntry(
        {
          fullKey: obj.key,
          name,
          size: obj.size,
          uploadedAt: Math.floor((obj.uploaded || new Date()).getTime() / 1000),
        },
        "file",
      ),
    );
  }

  return {
    path: subPath,
    fullPath: dir,
    folders: [...folderMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    files: [...fileMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function bundleRootDirectory(item) {
  const items = Array.isArray(item.items) ? item.items : [];
  return {
    path: "",
    fullPath: "",
    folders: items
      .filter((entry) => entry.targetType === "folder")
      .map((entry) => mapFolderEntry({ ...entry, fullKey: entry.path }, "folder"))
      .sort((a, b) => a.name.localeCompare(b.name)),
    files: items
      .filter((entry) => entry.targetType !== "folder")
      .map((entry) => mapFolderEntry({ ...entry, fullKey: entry.path }, "file"))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function findBundleRootForPath(items, path) {
  const clean = cleanShareSubPath(path);
  return [...(items || [])]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => {
      if (item.targetType === "folder")
        return clean === item.path || clean.startsWith(`${item.path}/`);
      return clean === item.path;
    });
}
