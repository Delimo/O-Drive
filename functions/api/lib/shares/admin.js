import {
  addLog,
  apiError,
  encodeBase64Url,
  jsonResponse,
  randomHex,
} from "../common/index.js";
import { ensureShareTable } from "../schema.js";
import { detectShareTarget } from "./directory.js";
import {
  cleanupExpiredShares,
  deleteShare,
  insertShareLink,
  reactivateExpiredShare,
} from "./expiry.js";
import {
  mapShare,
  mapShareItem,
} from "./mapping.js";
import { hashSharePassword } from "./password.js";
import {
  normalizeSharePath,
  normalizeSharePathList,
  ttlToExpiresAt,
} from "./paths.js";
import { loadRecentShareAccessLogs } from "./access-log.js";

function shareToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(String.fromCharCode(...bytes));
}

export async function handleAdminShares(env, request, method, url, context = {}) {
  await ensureShareTable(env);
  if (method === "GET") {
    await cleanupExpiredShares(env, { context });
    const rows = await env.D1.prepare(
      "SELECT * FROM share_links ORDER BY created_at DESC",
    ).all();
    const rawRows = rows.results || [];
    const logsByToken = await loadRecentShareAccessLogs(
      env,
      rawRows.map((row) => row.token),
    );
    return jsonResponse({
      items: rawRows.map((row) =>
        mapShare({ ...row, accessLogs: logsByToken.get(row.token) || [] }),
      ),
    });
  }

  if (method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (body.action === "cleanup-expired") {
      const deleted = await cleanupExpiredShares(env, { manual: true, context });
      await addLog(env, request, "SHARE_CLEANUP", `清理过期分享 ${deleted} 条`);
      return jsonResponse({ success: true, deleted });
    }
    if (body.action === "reactivate-expired") {
      return reactivateExpiredShare(env, request, body);
    }

    const paths = Array.isArray(body.paths)
      ? normalizeSharePathList(body.paths)
      : [normalizeSharePath(body.path)];
    const targets = [];
    for (const path of paths) {
      const target = await detectShareTarget(env, path);
      if (!target)
        return jsonResponse({
          success: false,
          message: "File or folder not found",
          path,
        }, 404);
      targets.push(target);
    }
    const isBundle = paths.length > 1;
    const items = paths.map((path, index) => mapShareItem(path, targets[index]));
    const path = paths[0];
    const target = targets[0];

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
    const name = isBundle
      ? `${items.length} 项内容`
      : path.split("/").pop() || path;
    const contentType = isBundle
      ? "application/vnd.o-drive.bundle+json"
      : target.contentType || "";
    const targetType = isBundle ? "bundle" : target.targetType;
    const size = isBundle
      ? items.reduce((sum, item) => sum + Number(item.size || 0), 0)
      : Number(target.size || 0);
    const createdAt = Date.now();
    await insertShareLink(env, {
      token,
      path,
      name,
      size,
      contentType,
      targetType,
      allowPreview,
      allowDownload,
      expiresAt,
      maxDownloads,
      passwordSalt,
      passwordHash,
      itemsJson: isBundle ? JSON.stringify(items) : "[]",
      createdAt,
    });
    await addLog(env, request, "SHARE_CREATE", {
      details: isBundle ? paths.join(", ") : path,
      targetPath: path,
      metadata: { token, targetType, paths },
    });
    return jsonResponse({
      success: true,
      item: mapShare({
        token,
        path,
        name,
        size,
        content_type: contentType,
        target_type: targetType,
        allow_preview: allowPreview,
        allow_download: allowDownload,
        expires_at: expiresAt,
        max_downloads: maxDownloads,
        download_count: 0,
        password_hash: passwordHash,
        items_json: isBundle ? JSON.stringify(items) : "[]",
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
    await addLog(env, request, "SHARE_DELETE", {
      details: token,
      targetPath: token,
    });
    return jsonResponse({ success: true });
  }

  return apiError("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
}
