/**
 * WebDAV method handlers: GET, PUT, DELETE, MKCOL, MOVE, COPY.
 * Reuses existing storage, file-index, r2-tree, and trash modules.
 */
import { isReservedKey } from "../../api/lib/common/index.js";
import { upsertFileIndex } from "../../api/lib/file-index/index.js";
import {
  resolveExistingObjectLocation,
  storageGet,
  storageHead,
  storagePut,
  checkStorageQuota,
} from "../../api/lib/storage.js";
import { copyTree } from "../../api/lib/r2-tree.js";
import { softDeleteTree } from "../../api/lib/trash.js";
import { normalizeName } from "../../api/lib/common/name.js";
import { keyExists } from "../../api/lib/file-mutations/helpers.js";

/**
 * Handle GET or HEAD request — download a file.
 * Supports Range requests for partial content.
 */
export async function handleGet(env, request, r2Key, method) {
  if (!r2Key) {
    return new Response("Cannot download root", { status: 400 });
  }

  const location = await resolveExistingObjectLocation(env, r2Key);
  if (!location) return new Response("Not Found", { status: 404 });

  const rangeHeader = request.headers.get("Range");
  const wantsRange = method === "GET" && rangeHeader?.startsWith("bytes=");
  const meta = wantsRange ? await storageHead(env, location.storageId, location.objectKey) : null;
  const obj = wantsRange ? meta : await storageGet(env, location.storageId, location.objectKey);
  if (!obj) return new Response("Not Found", { status: 404 });

  const headers = new Headers();
  if (typeof obj.writeHttpMetadata === "function") obj.writeHttpMetadata(headers);
  if (!headers.get("Content-Type"))
    headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  headers.set("DAV", "1");

  const filename = r2Key.split("/").pop() || r2Key;
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);

  if (method === "HEAD") {
    const contentLength = Number(obj.size);
    if (Number.isFinite(contentLength) && contentLength > 0)
      headers.set("Content-Length", String(contentLength));
    return new Response(null, { status: 200, headers });
  }

  if (!wantsRange) {
    const contentLength = Number(obj.size);
    if (Number.isFinite(contentLength) && contentLength > 0)
      headers.set("Content-Length", String(contentLength));
    return new Response(obj.body, { status: 200, headers });
  }

  // Parse Range header
  const range = parseByteRange(rangeHeader, Number(obj.size));
  if (!range) {
    const contentLength = Number(obj.size);
    if (Number.isFinite(contentLength) && contentLength > 0)
      headers.set("Content-Length", String(contentLength));
    return new Response(obj.body, { status: 200, headers });
  }

  const length = range.end - range.start + 1;
  const ranged = await storageGet(env, location.storageId, location.objectKey, {
    range: { offset: range.start, length },
  });
  if (!ranged) return new Response("Range Not Satisfiable", { status: 416 });

  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${Number(obj.size)}`);
  headers.set("Content-Length", String(length));
  return new Response(ranged.body, { status: 206, headers });
}

/**
 * Handle PUT request — upload a file.
 * Streams the request body directly to R2.
 */
export async function handlePut(env, request, r2Key) {
  if (!r2Key) {
    return new Response("Cannot upload to root", { status: 400 });
  }
  if (isReservedKey(r2Key)) {
    return new Response("Reserved system path", { status: 403 });
  }

  // Check storage quota
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 0) {
    const quota = await checkStorageQuota(env, "r2", contentLength);
    if (!quota.allowed) {
      return new Response("Storage quota exceeded", { status: 507 });
    }
  }

  // Normalize the filename segment
  const parts = r2Key.split("/");
  const rawName = parts.pop();
  try {
    normalizeName(rawName);
  } catch (_) {
    return new Response("Invalid filename", { status: 400 });
  }

  // Check if file exists before writing (for correct 201 vs 204 status)
  const existed = await keyExists(env, r2Key);

  const body = request.body;
  const contentType = request.headers.get("Content-Type") || "application/octet-stream";

  await storagePut(env, "r2", r2Key, body, {
    httpMetadata: { contentType },
  });

  // Update file index
  await upsertFileIndex(env, r2Key, {
    size: contentLength,
    httpMetadata: { contentType },
    storageId: "r2",
    objectKey: r2Key,
  });

  return new Response(null, { status: existed ? 204 : 201 });
}

/**
 * Handle DELETE request — soft-delete a file or folder (moves to trash).
 */
export async function handleDelete(env, r2Key) {
  if (!r2Key) {
    return new Response("Cannot delete root", { status: 400 });
  }
  if (isReservedKey(r2Key)) {
    return new Response("Reserved system path", { status: 403 });
  }

  // Check if resource exists
  const exists = await keyExists(env, r2Key);
  if (!exists) return new Response("Not Found", { status: 404 });

  await softDeleteTree(env, r2Key, null);
  return new Response(null, { status: 204 });
}

/**
 * Handle MKCOL request — create a directory.
 */
export async function handleMkcol(env, r2Key) {
  if (!r2Key) {
    return new Response("Cannot create root", { status: 405 });
  }
  if (isReservedKey(r2Key)) {
    return new Response("Reserved system path", { status: 403 });
  }

  // Check if already exists
  const exists = await keyExists(env, r2Key);
  if (exists) return new Response("Already exists", { status: 405 });

  // Create .folder sentinel to establish the directory prefix in R2
  await storagePut(env, "r2", r2Key + "/.folder", new Uint8Array(0));

  return new Response(null, { status: 201 });
}

/**
 * Handle MOVE request — move/rename a file or folder.
 * Reads Destination header for the target path.
 */
export async function handleMove(env, request, r2Key) {
  if (!r2Key) {
    return new Response("Cannot move root", { status: 400 });
  }
  if (isReservedKey(r2Key)) {
    return new Response("Reserved system path", { status: 403 });
  }

  const destKey = parseDestination(request, r2Key);
  if (!destKey) return new Response("Bad Destination", { status: 400 });
  if (isReservedKey(destKey)) {
    return new Response("Reserved system path", { status: 403 });
  }

  const overwrite = (request.headers.get("Overwrite") || "F").toUpperCase() === "T";

  // Check source exists
  const sourceExists = await keyExists(env, r2Key);
  if (!sourceExists) return new Response("Not Found", { status: 404 });

  // Check target
  const targetExists = await keyExists(env, destKey);
  if (targetExists && !overwrite) {
    return new Response("Already exists", { status: 412 });
  }
  if (targetExists && overwrite) {
    await softDeleteTree(env, destKey, null);
  }

  await copyTree(env, r2Key, destKey, true);
  return new Response(null, { status: targetExists ? 204 : 201 });
}

/**
 * Handle COPY request — copy a file or folder.
 * Reads Destination header for the target path.
 */
export async function handleCopy(env, request, r2Key) {
  if (!r2Key) {
    return new Response("Cannot copy root", { status: 400 });
  }
  if (isReservedKey(r2Key)) {
    return new Response("Reserved system path", { status: 403 });
  }

  const destKey = parseDestination(request, r2Key);
  if (!destKey) return new Response("Bad Destination", { status: 400 });
  if (isReservedKey(destKey)) {
    return new Response("Reserved system path", { status: 403 });
  }

  const overwrite = (request.headers.get("Overwrite") || "F").toUpperCase() === "T";

  // Check source exists
  const sourceExists = await keyExists(env, r2Key);
  if (!sourceExists) return new Response("Not Found", { status: 404 });

  // Check target
  const targetExists = await keyExists(env, destKey);
  if (targetExists && !overwrite) {
    return new Response("Already exists", { status: 412 });
  }
  if (targetExists && overwrite) {
    await softDeleteTree(env, destKey, null);
  }

  await copyTree(env, r2Key, destKey, false);
  return new Response(null, { status: targetExists ? 204 : 201 });
}

/**
 * Parse the Destination header to extract the target R2 key.
 * Format: /dav/<path> or https://host/dav/<path>
 */
function parseDestination(request) {
  const dest = request.headers.get("Destination");
  if (!dest) return null;

  try {
    // The Destination may be a full URL or just a path
    let pathname;
    if (dest.startsWith("http")) {
      pathname = new URL(dest).pathname;
    } else {
      pathname = dest;
    }

    // Strip /dav/ prefix and decode
    const key = decodeURIComponent(pathname.replace(/^\/dav\/?/, ""));
    if (!key) return null;
    return key;
  } catch (_) {
    return null;
  }
}

/**
 * Parse a Range header into { start, end } byte offsets.
 */
function parseByteRange(header, totalSize) {
  if (!header || !header.startsWith("bytes=")) return null;
  const spec = header.slice(6);
  const match = spec.match(/^(\d+)?-(\d+)?$/);
  if (!match) return null;

  let start, end;
  if (match[1] !== undefined && match[2] !== undefined) {
    start = Number(match[1]);
    end = Number(match[2]);
  } else if (match[1] !== undefined) {
    start = Number(match[1]);
    end = totalSize - 1;
  } else if (match[2] !== undefined) {
    start = totalSize - Number(match[2]);
    end = totalSize - 1;
  } else {
    return null;
  }

  if (start < 0 || start >= totalSize) return null;
  if (end >= totalSize) end = totalSize - 1;
  if (start > end) return null;

  return { start, end };
}
