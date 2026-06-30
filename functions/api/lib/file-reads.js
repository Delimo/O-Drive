import {
  jsonResponse,
  formatBytes,
  isHiddenKey,
  isReservedKey,
} from "./common/index.js";
import { checkProtectedAccess, markProtection } from "./protected-paths.js";
import {
  indexedFileKind,
  listIndexedDirectory,
  searchFileIndex,
} from "./file-index/index.js";
import {
  resolveExistingObjectLocation,
  storageGet,
  storageHead,
  storageList,
} from "./storage.js";

const R2_SEARCH_SCAN_PAGE_SIZE = 100;

function mapEntry(o) {
  return {
    name: o.key.split("/").pop(),
    path: "/" + o.key,
    fullKey: o.key,
    storageId: o.storageId || "r2",
    sizeFormatted: formatBytes(o.size),
    rawSize: o.size,
    time: Math.floor(o.uploaded.getTime() / 1000),
  };
}

function cleanPath(path = "") {
  return String(path || "").replace(/^\/+|\/+$/g, "");
}

function encodeR2SearchCursor(cursor = {}) {
  const payload = {
    r2: cursor.r2Cursor || "",
    after: cursor.afterKey || "",
  };
  return `r2:${btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}

function decodeR2SearchCursor(cursor) {
  const raw = String(cursor || "");
  if (!raw) return { r2Cursor: undefined, afterKey: "" };
  if (!raw.startsWith("r2:")) return { r2Cursor: raw, afterKey: "" };
  try {
    const encoded = raw.slice(3).replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(encoded));
    return {
      r2Cursor: decoded.r2 || undefined,
      afterKey: decoded.after || "",
    };
  } catch (_) {
    return { r2Cursor: undefined, afterKey: "" };
  }
}

function objectsAfterKey(objects, afterKey) {
  if (!afterKey) return objects;
  const index = objects.findIndex((obj) => obj.key === afterKey);
  if (index >= 0) return objects.slice(index + 1);
  return objects.filter((obj) => String(obj.key || "") > afterKey);
}

function searchHitForFile(file, q, filters = {}) {
  const needle = String(q || "").toLowerCase();
  const name = String(file.name || "");
  const fullKey = String(file.fullKey || "");
  const filterLabels = [];
  if (filters.kind && filters.kind !== "all") filterLabels.push("类型");
  if (Number.isFinite(filters.minSize) || Number.isFinite(filters.maxSize))
    filterLabels.push("大小");
  if (Number.isFinite(filters.fromTime) || Number.isFinite(filters.toTime))
    filterLabels.push("时间");
  const base = name.toLowerCase().includes(needle)
    ? { type: "name", label: "文件名", value: name }
    : fullKey.toLowerCase().includes(needle)
      ? { type: "path", label: "路径", value: fullKey }
      : { type: "filter", label: "筛选", value: fullKey || name };
  return {
    ...base,
    query: q,
    filters: filterLabels,
  };
}

export async function handleSearch(
  env,
  request,
  url,
  hiddenPaths,
  auth,
  protectedPaths = [],
) {
  const q = (url.searchParams.get("q") || "").toLowerCase();
  const scope = (url.searchParams.get("scope") || "/").replace(/^\//, "");
  const limit = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("limit") || "50")),
  );
  const scanLimit = Math.max(
    limit,
    Math.min(1000, Number(url.searchParams.get("scanLimit") || "1000")),
  );
  const filters = parseSearchFilters(url);
  const rawCursor = url.searchParams.get("cursor") || undefined;
  let cursor = rawCursor;
  const indexed = await searchFileIndex(
    env,
    { q, scope, limit, cursor, filters },
    hiddenPaths,
    auth,
  );
  if (indexed) {
    const files = await markProtection(
      indexed.files,
      request,
      env,
      auth,
      protectedPaths,
    );
    return jsonResponse({ ...indexed, files });
  }
  const matches = [];
  let nextCursor = "";
  let scanned = 0;
  const r2Cursor = decodeR2SearchCursor(rawCursor);
  cursor = r2Cursor.r2Cursor;
  let afterKey = r2Cursor.afterKey;

  do {
    const pageStartCursor = cursor || "";
    const pageLimit = Math.max(
      1,
      Math.min(
        Math.max(limit - matches.length, R2_SEARCH_SCAN_PAGE_SIZE),
        scanLimit - scanned,
      ),
    );
    const listed = await storageList(
      env,
      "r2",
      { prefix: scope, cursor, limit: pageLimit },
      { maxObjects: pageLimit },
    );
    const objects = listed.objects || [];
    const candidateObjects = objectsAfterKey(objects, afterKey);
    scanned += objects.length;
    const pageMatches = candidateObjects
      .map((obj) => mapEntry({ ...obj, storageId: "r2" }))
      .filter(
        (f) =>
          (f.name.toLowerCase().includes(q) ||
            f.fullKey.toLowerCase().includes(q)) &&
          f.name !== ".folder" &&
          !isReservedKey(f.fullKey) &&
          matchesSearchFilters(f, filters) &&
          (auth.role === "admin" || !isHiddenKey(f.fullKey, hiddenPaths)),
      )
      .map((file) => ({
        ...file,
        searchHit: searchHitForFile(file, q, filters),
      }));
    const remaining = limit - matches.length;
    if (pageMatches.length > remaining) {
      const returned = pageMatches.slice(0, remaining);
      matches.push(...returned);
      nextCursor = encodeR2SearchCursor({
        r2Cursor: pageStartCursor,
        afterKey: returned[returned.length - 1]?.fullKey || "",
      });
      break;
    }
    matches.push(...pageMatches);
    afterKey = "";
    cursor = listed.truncated ? listed.cursor : undefined;
    nextCursor = cursor ? encodeR2SearchCursor({ r2Cursor: cursor }) : "";
  } while (cursor && matches.length < limit && scanned < scanLimit);

  const visibleMatches = await markProtection(
    matches.slice(0, limit),
    request,
    env,
    auth,
    protectedPaths,
  );
  return jsonResponse({
    files: visibleMatches,
    nextCursor,
    scanned,
    scanLimitReached: Boolean(cursor && scanned >= scanLimit),
  });
}

function numberParam(url, name, scale = 1) {
  const raw = url.searchParams.get(name);
  if (raw == null || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value * scale : undefined;
}

function dateParam(url, name, endOfDay = false) {
  const raw = url.searchParams.get(name);
  if (!raw) return undefined;
  const date = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  const value = date.getTime();
  return Number.isFinite(value) ? value : undefined;
}

function parseSearchFilters(url) {
  const kind = String(url.searchParams.get("kind") || "all");
  return {
    kind: [
      "all",
      "file",
      "image",
      "video",
      "audio",
      "text",
      "pdf",
      "archive",
      "exe",
      "other",
    ].includes(kind)
      ? kind
      : "all",
    minSize: numberParam(url, "minSize", 1024),
    maxSize: numberParam(url, "maxSize", 1024),
    fromTime: dateParam(url, "modifiedAfter"),
    toTime: dateParam(url, "modifiedBefore", true),
  };
}

function matchesSearchFilters(file, filters = {}) {
  if (filters.kind && filters.kind !== "all") {
    const kind = indexedFileKind(file.fullKey);
    if (filters.kind !== "file" && kind !== filters.kind) return false;
  }
  const size = Number(file.rawSize || 0);
  if (Number.isFinite(filters.minSize) && size < filters.minSize) return false;
  if (Number.isFinite(filters.maxSize) && size > filters.maxSize) return false;
  const time = Number(file.time || 0);
  if (Number.isFinite(filters.fromTime) && time < filters.fromTime)
    return false;
  if (Number.isFinite(filters.toTime) && time > filters.toTime) return false;
  return true;
}

export async function handleListFiles(
  env,
  request,
  hiddenPaths,
  auth,
  r2Key,
  protectedPaths = [],
) {
  const access = await checkProtectedAccess(
    request,
    env,
    auth,
    protectedPaths,
    r2Key,
  );
  if (!access.ok) {
    return jsonResponse(
      {
        success: false,
        code: "password_required",
        path: access.rule.path,
        message: "Password required",
      },
      403,
    );
  }
  const prefix = r2Key ? r2Key + "/" : "";
  const listed = await storageList(env, "r2", { prefix, delimiter: "/" });
  const indexed = await listIndexedDirectory(env, r2Key);
  const folderMap = new Map();
  for (const folder of indexed.folders || [])
    folderMap.set(folder.fullKey, folder);
  for (const p of listed.delimitedPrefixes || []) {
    const fullKey = p.slice(0, -1);
    folderMap.set(fullKey, {
      name: fullKey.split("/").slice(-1)[0],
      path: "/" + fullKey,
      fullKey,
    });
  }
  const folders = await markProtection(
    [...folderMap.values()]
      .filter((f) => f.fullKey && f.name && f.name !== ".folder")
      .filter((f) => !isReservedKey(f.fullKey))
      .filter(
        (f) => auth.role === "admin" || !isHiddenKey(f.fullKey, hiddenPaths),
      ),
    request,
    env,
    auth,
    protectedPaths,
  );
  const fileMap = new Map();
  for (const file of indexed.files || []) fileMap.set(file.fullKey, file);
  for (const obj of listed.objects || []) {
    const file = mapEntry({ ...obj, storageId: "r2" });
    fileMap.set(file.fullKey, file);
  }
  const files = await markProtection(
    [...fileMap.values()].filter(
      (f) =>
        f.name !== "" &&
        f.name !== ".folder" &&
        !isReservedKey(f.fullKey) &&
        (auth.role === "admin" || !isHiddenKey(f.fullKey, hiddenPaths)),
    ),
    request,
    env,
    auth,
    protectedPaths,
  );
  return jsonResponse({ folders, files, storageId: "r2" });
}

function parseByteRange(rangeHeader) {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const match = rangeHeader.slice(6).match(/^(\d*)-(\d*)$/);
  if (!match) return null;
  const startStr = match[1];
  const endStr = match[2];
  if (!startStr && !endStr) return null;
  return { startStr, endStr };
}

function makeDisposition(path, filename) {
  return path.startsWith("/api/download/")
    ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    : "inline";
}

export async function handleDownloadOrPreview(env, request, path, r2Key) {
  const rangeHeader = request.headers.get("Range");
  const parsedRange = parseByteRange(rangeHeader);
  const wantsRange = Boolean(parsedRange);
  const location = await resolveExistingObjectLocation(env, r2Key);
  const storageId = location.storageId;
  const objectKey = location.objectKey;
  const meta = wantsRange ? await storageHead(env, storageId, objectKey) : null;
  const obj = wantsRange ? meta : await storageGet(env, storageId, objectKey);
  if (!obj) return new Response("404", { status: 404 });

  const headers = new Headers();
  if (typeof obj.writeHttpMetadata === "function")
    obj.writeHttpMetadata(headers);
  if (!headers.get("Content-Type")) {
    const ct = obj.httpMetadata?.contentType || "application/octet-stream";
    if (ct.startsWith("text/") || ct === "application/json" || ct === "application/javascript" || ct === "application/xml") {
      headers.set("Content-Type", ct.includes("charset") ? ct : `${ct}; charset=utf-8`);
    } else {
      headers.set("Content-Type", ct);
    }
  }
  headers.set("Accept-Ranges", "bytes");
  headers.set(
    "Content-Disposition",
    makeDisposition(path, r2Key.split("/").pop() || r2Key),
  );

  if (!wantsRange) {
    const contentLength = Number(obj.size);
    if (Number.isFinite(contentLength) && contentLength > 0)
      headers.set("Content-Length", String(contentLength));
    return new Response(obj.body, { headers });
  }

  const size = Number(meta?.size ?? obj.size ?? 0);
  const { startStr, endStr } = parsedRange;
  let offset;
  let length;

  if (!startStr && endStr) {
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    offset = Math.max(size - suffix, 0);
    length = size - offset;
  } else {
    offset = Number(startStr);
    if (!Number.isFinite(offset) || offset < 0 || offset >= size) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const requestedEnd = endStr ? Number(endStr) : size - 1;
    const end = Number.isFinite(requestedEnd)
      ? Math.min(requestedEnd, size - 1)
      : size - 1;
    if (end < offset) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    length = end - offset + 1;
  }

  const ranged = await storageGet(env, storageId, objectKey, {
    range: { offset, length },
  });
  if (!ranged) return new Response("404", { status: 404 });

  headers.set(
    "Content-Range",
    `bytes ${offset}-${offset + length - 1}/${size}`,
  );
  headers.set("Content-Length", String(length));
  return new Response(ranged.body, { status: 206, headers });
}
