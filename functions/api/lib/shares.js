import {
  addLog,
  encodeBase64Url,
  formatBytes,
  isReservedKey,
  jsonResponse,
  apiError,
  normalizeName,
  parseCookie,
  randomHex,
  pbkdf2Hex,
  assertCompleteListing,
} from "./common/index.js";
import { handleDownloadOrPreview } from "./file-reads.js";
import { listFileIndexPrefix, listIndexedDirectory } from "./file-index/index.js";
import { signHmac } from "./secrets.js";
import { ensureShareTable } from "./schema.js";
import {
  resolveExistingObjectLocation,
  storageGet,
  storageHead,
  storageList,
} from "./storage.js";
import { loadWebhookEndpoints, notifyWebhookWithLog } from "./webhooks.js";
import { createZipStream } from "./zip-stream.js";

const EXPIRED_SHARE_AUTO_DELETE_MS = 7 * 24 * 60 * 60 * 1000;
const SHARE_ACCESS_TTL_SECONDS = 12 * 60 * 60;
const SHARE_PASSWORD_ITERATIONS = 210000;

async function hashSharePassword(password, salt) {
  const hash = await pbkdf2Hex(password, salt);
  return `pbkdf2-sha256$${SHARE_PASSWORD_ITERATIONS}$${hash}`;
}

async function verifySharePassword(password, row) {
  const stored = String(row?.password_hash || "");
  const salt = String(row?.password_salt || "");
  if (!stored || !salt) return true;
  const parts = stored.split("$");
  if (parts[0] !== "pbkdf2-sha256" || parts.length !== 3) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 10000) return false;
  const candidate = await pbkdf2Hex(password, salt, iterations);
  return candidate === parts[2];
}

function isSecureRequest(request) {
  return request && new URL(request.url).protocol === "https:";
}

function cookieAttributes(request, maxAge = SHARE_ACCESS_TTL_SECONDS) {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function shareAccessCookieName(token) {
  return `share_access_${token.replace(/[^A-Za-z0-9_-]/g, "")}`;
}

async function signShareAccess(env, token, exp) {
  const value = `${token}.${exp}`;
  return `${value}.${await signHmac(env, value)}`;
}

async function hasShareAccess(env, request, token, row) {
  if (!row?.password_hash) return true;
  const value = parseCookie(request, shareAccessCookieName(token));
  if (!value) return false;
  const [cookieToken, exp, signature] = value.split(".");
  if (
    cookieToken !== token ||
    !exp ||
    !signature ||
    Date.now() >= Number(exp) * 1000
  )
    return false;
  return value === (await signShareAccess(env, token, Number(exp)));
}

function sharePasswordRequiredResponse(item) {
  return jsonResponse(
    {
      success: false,
      code: "SHARE_PASSWORD_REQUIRED",
      message: "Share password required",
      hasPassword: true,
      item,
    },
    403,
  );
}

function shareToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(String.fromCharCode(...bytes));
}

function normalizeSharePath(path) {
  const clean = String(path || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!clean) throw new Error("Invalid path");
  const normalized = clean.split("/").map(normalizeName).join("/");
  if (isReservedKey(normalized)) {
    const err = new Error("Reserved system path");
    err.status = 403;
    throw err;
  }
  return normalized;
}

function cleanShareSubPath(path = "") {
  const clean = String(path || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  const normalized = clean.split("/").map(normalizeName).join("/");
  if (isReservedKey(normalized)) {
    const err = new Error("Reserved system path");
    err.status = 403;
    throw err;
  }
  return normalized;
}

function childPath(root, subPath = "") {
  const cleanRoot = normalizeSharePath(root);
  const cleanSub = cleanShareSubPath(subPath);
  return cleanSub ? `${cleanRoot}/${cleanSub}` : cleanRoot;
}

function ttlToExpiresAt(body) {
  const explicit = Number(body.expiresAt || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const days = Number(body.expiresInDays || body.days || 7);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Date.now() + Math.min(days, 3650) * 24 * 60 * 60 * 1000;
}

function mapShare(row) {
  const expiresAt = Number(row.expires_at || 0);
  const maxDownloads = Number(row.max_downloads || 0);
  const downloadCount = Number(row.download_count || 0);
  const autoDeleteAt =
    expiresAt > 0 ? expiresAt + EXPIRED_SHARE_AUTO_DELETE_MS : 0;
  const expired = Boolean(expiresAt && expiresAt <= Date.now());
  const exhausted = Boolean(maxDownloads && downloadCount >= maxDownloads);
  return {
    token: row.token,
    path: row.path,
    name: row.name,
    targetType: row.target_type || "file",
    size: Number(row.size || 0),
    sizeFormatted: formatBytes(Number(row.size || 0)),
    contentType: row.content_type || "",
    allowPreview: Number(row.allow_preview ?? 1) === 1,
    allowDownload: Number(row.allow_download ?? 1) === 1,
    hasPassword: Boolean(row.password_hash),
    expiredNotifiedAt: Number(row.expired_notified_at || 0),
    expiresAt,
    expired,
    autoDeleteAt,
    canReactivate: Boolean(expired && !exhausted && autoDeleteAt > Date.now()),
    maxDownloads,
    downloadCount,
    exhausted,
    createdAt: Number(row.created_at || 0),
    lastAccessedAt: Number(row.last_accessed_at || 0),
    lastAccessIp: row.last_access_ip || "",
  };
}

function mapFolderEntry(entry = {}, type = "file") {
  const fullKey = String(entry.fullKey || entry.key || "").replace(/^\/+/, "");
  const name = entry.name || fullKey.split("/").pop() || "";
  return {
    name,
    path: "/" + fullKey,
    fullKey,
    targetType: type,
    kind: type,
    size: Number(entry.rawSize ?? entry.size ?? 0),
    sizeFormatted:
      type === "folder" ? "" : formatBytes(Number(entry.rawSize ?? entry.size ?? 0)),
    contentType: entry.contentType || entry.content_type || "",
    uploadedAt: Number(entry.time || entry.uploaded_at || entry.uploadedAt || 0),
  };
}

async function folderExists(env, path) {
  const clean = normalizeSharePath(path);
  const prefix = clean + "/";
  const listed = await storageList(env, "r2", { prefix, delimiter: "/" });
  if ((listed.objects || []).length || (listed.delimitedPrefixes || []).length)
    return true;
  const indexed = await listIndexedDirectory(env, clean);
  return Boolean((indexed.files || []).length || (indexed.folders || []).length);
}

async function detectShareTarget(env, path) {
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

async function listShareDirectory(env, rootPath, subPath = "") {
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

async function folderZipResponse(env, rootPath, subPath = "", filename = "folder") {
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

function canAutoDeleteExpiredShare(row, now = Date.now()) {
  const expiresAt = Number(row?.expires_at || 0);
  return Boolean(
    expiresAt > 0 && expiresAt + EXPIRED_SHARE_AUTO_DELETE_MS <= now,
  );
}

async function getShare(env, token) {
  await ensureShareTable(env);
  return env.D1.prepare("SELECT * FROM share_links WHERE token = ?")
    .bind(token)
    .first();
}

async function deleteShare(env, token) {
  await ensureShareTable(env);
  await env.D1.prepare("DELETE FROM share_links WHERE token = ?")
    .bind(token)
    .run();
}

async function notifyShareExpiredOnce(env, row, reason = "expired") {
  if (!row || Number(row.expired_notified_at || 0) > 0) return false;
  const item = mapShare(row);
  const endpoints = await loadWebhookEndpoints(env);
  await notifyWebhookWithLog(env, endpoints, "share.expired", {
    token: item.token,
    path: item.path,
    name: item.name,
    expiresAt: item.expiresAt,
    maxDownloads: item.maxDownloads,
    downloadCount: item.downloadCount,
    reason,
  });
  await env.D1.prepare(
    "UPDATE share_links SET expired_notified_at = ? WHERE token = ?",
  )
    .bind(Date.now(), row.token)
    .run();
  return true;
}

async function cleanupExpiredShares(
  env,
  { now = Date.now(), manual = false } = {},
) {
  await ensureShareTable(env);
  const expiryCutoff = manual ? now : now - EXPIRED_SHARE_AUTO_DELETE_MS;
  const exhaustedCutoff = now;
  const rows = await env.D1.prepare(
    "SELECT * FROM share_links WHERE (expires_at > 0 AND expires_at <= ?) OR (max_downloads > 0 AND download_count >= max_downloads AND created_at <= ?)",
  )
    .bind(expiryCutoff, exhaustedCutoff)
    .all();
  const expiredRows = rows.results || [];
  for (const row of expiredRows) {
    await notifyShareExpiredOnce(
      env,
      row,
      Number(row.max_downloads || 0) &&
        Number(row.download_count || 0) >= Number(row.max_downloads || 0)
        ? "exhausted"
        : "expired",
    );
  }
  if (expiredRows.length) {
    const tokens = expiredRows.map((r) => r.token);
    await env.D1.prepare(
      `DELETE FROM share_links WHERE token IN (${tokens.map(() => "?").join(",")})`,
    )
      .bind(...tokens)
      .run();
  }
  return expiredRows.length;
}

function isLikelyShareSchemaError(error) {
  const message = String(error?.message || error || "");
  return /share_links/i.test(message) && /column|schema|SQLITE_ERROR|no such table/i.test(message);
}

async function insertShareLink(env, row) {
  const runInsert = () =>
    env.D1.prepare(
      `INSERT INTO share_links
       (token, path, name, size, content_type, target_type, allow_preview, allow_download, expires_at, max_downloads, download_count, password_salt, password_hash, expired_notified_at, created_at, last_accessed_at, last_access_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, 0, '')`,
    )
      .bind(
        row.token,
        row.path,
        row.name,
        Number(row.size || 0),
        row.contentType || "",
        row.targetType || "file",
        row.allowPreview,
        row.allowDownload,
        row.expiresAt,
        row.maxDownloads,
        row.passwordSalt || "",
        row.passwordHash || "",
        row.createdAt,
      )
      .run();

  try {
    await runInsert();
  } catch (error) {
    if (!isLikelyShareSchemaError(error)) throw error;
    await ensureShareTable(env, { force: true });
    await runInsert();
  }
}

async function reactivateExpiredShare(env, request, body) {
  const token = String(body.token || "").trim();
  if (!token)
    return jsonResponse({ success: false, message: "Missing token" }, 400);

  const row = await getShare(env, token);
  if (!row)
    return jsonResponse(
      { success: false, message: "Share link not found" },
      404,
    );

  const item = mapShare(row);
  if (!item.expired)
    return jsonResponse(
      { success: false, message: "Share link is not expired" },
      400,
    );
  if (item.exhausted)
    return jsonResponse(
      { success: false, message: "Share download limit reached" },
      400,
    );
  if (canAutoDeleteExpiredShare(row))
    return jsonResponse(
      { success: false, message: "Share link cleanup retention passed" },
      410,
    );

  const target = await detectShareTarget(env, row.path);
  if (!target)
    return jsonResponse({ success: false, message: "File or folder not found" }, 404);

  const expiresAt = ttlToExpiresAt(body);
  if (expiresAt && expiresAt <= Date.now())
    return jsonResponse(
      { success: false, message: "New expiry must be in the future" },
      400,
    );

  await env.D1.prepare(
    `UPDATE share_links
     SET expires_at = ?, expired_notified_at = 0, size = ?, content_type = ?, target_type = ?
     WHERE token = ?`,
  )
    .bind(
      expiresAt,
      Number(target.size || 0),
      target.contentType || "",
      target.targetType || row.target_type || "file",
      token,
    )
    .run();

  await addLog(env, request, "SHARE_REACTIVATE", row.path);

  return jsonResponse({
    success: true,
    item: mapShare({
      ...row,
      expires_at: expiresAt,
      expired_notified_at: 0,
      size: Number(target.size || 0),
      content_type: target.contentType || "",
      target_type: target.targetType || row.target_type || "file",
    }),
  });
}

async function expiredResponse(
  env,
  token,
  message = "Share link expired",
  row,
) {
  row = row || (await getShare(env, token));
  const autoDeleteAt = row
    ? Number(row.expires_at || 0) + EXPIRED_SHARE_AUTO_DELETE_MS
    : 0;
  const shouldDelete = row ? canAutoDeleteExpiredShare(row) : true;
  if (row) await notifyShareExpiredOnce(env, row, "expired");
  if (shouldDelete) await deleteShare(env, token);
  return jsonResponse(
    {
      success: false,
      code: "SHARE_EXPIRED",
      message,
      deleted: shouldDelete,
      autoDeleteAt,
    },
    410,
  );
}

async function exhaustedResponse(env, token, row) {
  row = row || (await getShare(env, token));
  if (row) await notifyShareExpiredOnce(env, row, "exhausted");
  await deleteShare(env, token);
  return jsonResponse(
    {
      success: false,
      code: "SHARE_EXHAUSTED",
      message: "Share download limit reached",
      deleted: true,
    },
    410,
  );
}

export async function handleAdminShares(env, request, method, url) {
  await ensureShareTable(env);
  if (method === "GET") {
    await cleanupExpiredShares(env);
    const rows = await env.D1.prepare(
      "SELECT * FROM share_links ORDER BY created_at DESC",
    ).all();
    return jsonResponse({ items: (rows.results || []).map(mapShare) });
  }

  if (method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (body.action === "cleanup-expired") {
      const deleted = await cleanupExpiredShares(env, { manual: true });
      await addLog(env, request, "SHARE_CLEANUP", `清理过期分享 ${deleted} 条`);
      return jsonResponse({ success: true, deleted });
    }
    if (body.action === "reactivate-expired") {
      return reactivateExpiredShare(env, request, body);
    }

    const path = normalizeSharePath(body.path);
    const target = await detectShareTarget(env, path);
    if (!target)
      return jsonResponse({ success: false, message: "File or folder not found" }, 404);

    const token = shareToken();
    const expiresAt = ttlToExpiresAt(body);
    const maxDownloads = Math.max(
      0,
      Math.min(1000000, Number(body.maxDownloads || 0) || 0),
    );
    const allowPreview = body.allowPreview !== false ? 1 : 0;
    const allowDownload = body.allowDownload !== false ? 1 : 0;
    const password = String(body.password || body.sharePassword || "").trim();
    if (password && password.length < 4)
      return jsonResponse(
        { success: false, message: "Share password too short" },
        400,
      );
    const passwordSalt = password ? randomHex(16) : "";
    const passwordHash = password
      ? await hashSharePassword(password, passwordSalt)
      : "";
    const name = path.split("/").pop() || path;
    const contentType = target.contentType || "";
    const createdAt = Date.now();
    await insertShareLink(env, {
      token,
      path,
      name,
      size: Number(target.size || 0),
      contentType,
      targetType: target.targetType,
      allowPreview,
      allowDownload,
      expiresAt,
      maxDownloads,
      passwordSalt,
      passwordHash,
      createdAt,
    });
    await addLog(env, request, "SHARE_CREATE", path);
    return jsonResponse({
      success: true,
      item: mapShare({
        token,
        path,
        name,
        size: Number(target.size || 0),
        content_type: contentType,
        target_type: target.targetType,
        allow_preview: allowPreview,
        allow_download: allowDownload,
        expires_at: expiresAt,
        max_downloads: maxDownloads,
        download_count: 0,
        password_hash: passwordHash,
        created_at: createdAt,
        last_accessed_at: 0,
        last_access_ip: "",
      }),
    });
  }

  if (method === "DELETE") {
    const token = url.searchParams.get("token");
    if (!token)
      return jsonResponse({ success: false, message: "Missing token" }, 400);
    await deleteShare(env, token);
    await addLog(env, request, "SHARE_DELETE", token);
    return jsonResponse({ success: true });
  }

  return apiError("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
}

export async function handlePublicShare(env, request, path) {
  const match = path.match(
    /^\/api\/share\/([^/]+)\/(info|preview|download|unlock)$/,
  );
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const action = match[2];
  if (action !== "unlock" && request.method !== "GET") return null;
  if (action === "unlock" && request.method !== "POST")
    return jsonResponse({ message: "Method Not Allowed" }, 405);
  const row = await getShare(env, token);
  if (!row)
    return jsonResponse(
      { success: false, message: "Share link not found" },
      404,
    );

  const item = mapShare(row);
  if (item.expired)
    return expiredResponse(env, token, "Share link expired", row);
  if (item.exhausted) return exhaustedResponse(env, token, row);
  if (action === "unlock") {
    if (!item.hasPassword) return jsonResponse({ success: true });
    const body = await request.json().catch(() => ({}));
    if (!(await verifySharePassword(String(body.password || ""), row))) {
      return jsonResponse(
        { success: false, message: "Invalid share password" },
        403,
      );
    }
    const exp = Math.floor(Date.now() / 1000) + SHARE_ACCESS_TTL_SECONDS;
    const signed = await signShareAccess(env, token, exp);
    return jsonResponse({ success: true }, 200, {
      "Set-Cookie": `${shareAccessCookieName(token)}=${signed}; ${cookieAttributes(request)}`,
    });
  }
  if (!(await hasShareAccess(env, request, token, row)))
    return sharePasswordRequiredResponse({ token, hasPassword: true });

  const accessIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "";
  await env.D1.prepare(
    "UPDATE share_links SET last_accessed_at = ?, last_access_ip = ? WHERE token = ?",
  )
    .bind(Date.now(), accessIp, token)
    .run();
  const url = new URL(request.url);
  const subPath = cleanShareSubPath(url.searchParams.get("path") || "");
  const isFolderShare = item.targetType === "folder";
  if (!isFolderShare && subPath)
    return jsonResponse({ success: false, message: "Invalid share path" }, 404);

  if (action === "info") {
    if (!isFolderShare) return jsonResponse({ success: true, item });
    const directory = await listShareDirectory(env, item.path, subPath);
    return jsonResponse({ success: true, item, directory });
  }
  if (action === "preview" && !item.allowPreview)
    return jsonResponse({ success: false, message: "Preview disabled" }, 403);
  if (action === "download" && !item.allowDownload)
    return jsonResponse({ success: false, message: "Download disabled" }, 403);
  const targetPath = isFolderShare ? childPath(item.path, subPath) : item.path;
  const target = isFolderShare ? await detectShareTarget(env, targetPath) : null;
  if (isFolderShare && subPath && !target)
    return jsonResponse({ success: false, message: "Share path not found" }, 404);
  if (isFolderShare && action === "preview" && target?.targetType !== "file")
    return jsonResponse({ success: false, message: "Folder preview disabled" }, 403);
  const res =
    isFolderShare && (!target || target.targetType === "folder")
      ? await folderZipResponse(env, item.path, subPath, targetPath.split("/").pop() || item.name)
      : await handleDownloadOrPreview(
          env,
          request,
          action === "download"
            ? `/api/download/${targetPath}`
            : `/api/preview/${targetPath}`,
          targetPath,
        );
  if (res.ok && action === "download") {
    await env.D1.prepare(
      "UPDATE share_links SET download_count = download_count + 1, last_accessed_at = ?, last_access_ip = ? WHERE token = ?",
    )
      .bind(Date.now(), accessIp, token)
      .run();
  }
  return res;
}
