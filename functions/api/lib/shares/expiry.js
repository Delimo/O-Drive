import { addLog, jsonResponse } from "../common/index.js";
import { ensureShareTable } from "../schema.js";
import { loadWebhookEndpoints, notifyWebhookWithLog } from "../webhooks.js";
import { EXPIRED_SHARE_AUTO_DELETE_MS } from "./constants.js";
import { detectShareTarget } from "./directory.js";
import {
  mapShare,
  mapShareItem,
  parseShareItems,
} from "./mapping.js";
import { ttlToExpiresAt } from "./paths.js";

export function canAutoDeleteExpiredShare(row, now = Date.now()) {
  const expiresAt = Number(row?.expires_at || 0);
  return Boolean(
    expiresAt > 0 && expiresAt + EXPIRED_SHARE_AUTO_DELETE_MS <= now,
  );
}

export async function getShare(env, token) {
  await ensureShareTable(env);
  return env.D1.prepare("SELECT * FROM share_links WHERE token = ?")
    .bind(token)
    .first();
}

export async function deleteShare(env, token) {
  await ensureShareTable(env);
  await env.D1.prepare("DELETE FROM share_links WHERE token = ?")
    .bind(token)
    .run();
}

/**
 * Atomically reserve one download slot for a max-limited share.
 *
 * The increment is guarded by `download_count < max_downloads` in the same
 * statement, so N concurrent downloads can never push the count past the limit
 * (the classic check-then-act TOCTOU). Unlimited shares (max_downloads = 0)
 * still bump the counter for stats but are never rejected.
 *
 * Returns true when a slot was granted. When it returns false the caller must
 * treat the share as exhausted and must NOT serve the download.
 */
export async function reserveDownloadSlot(env, token) {
  await ensureShareTable(env);
  const res = await env.D1.prepare(
    `UPDATE share_links
     SET download_count = download_count + 1,
         last_accessed_at = ?
     WHERE token = ?
       AND (max_downloads = 0 OR download_count < max_downloads)`,
  )
    .bind(Date.now(), token)
    .run();
  return Number(res?.meta?.changes ?? res?.changes ?? 0) > 0;
}

/**
 * Release a previously reserved slot when the download itself failed, so a
 * transient R2/stream error does not permanently consume a download.
 */
export async function releaseDownloadSlot(env, token) {
  await ensureShareTable(env);
  await env.D1.prepare(
    `UPDATE share_links
     SET download_count = CASE WHEN download_count > 0 THEN download_count - 1 ELSE 0 END
     WHERE token = ?`,
  )
    .bind(token)
    .run();
}

function scheduleShareNotification(context, promise) {
  const guarded = promise.catch((err) => {
    console.error("[share.notify]", err?.message || err);
  });
  if (typeof context?.waitUntil === "function") {
    context.waitUntil(guarded);
    return null;
  }
  return guarded;
}

export async function notifyShareExpiredOnce(env, row, reason = "expired", context = {}) {
  if (!row || Number(row.expired_notified_at || 0) > 0) return false;
  const item = mapShare(row);
  const payload = {
    token: item.token,
    path: item.path,
    name: item.name,
    expiresAt: item.expiresAt,
    maxDownloads: item.maxDownloads,
    downloadCount: item.downloadCount,
    reason,
  };
  await env.D1.prepare(
    "UPDATE share_links SET expired_notified_at = ? WHERE token = ?",
  )
    .bind(Date.now(), row.token)
    .run();
  const notification = (async () => {
    const endpoints = await loadWebhookEndpoints(env);
    await notifyWebhookWithLog(env, endpoints, "share.expired", payload);
  })();
  const awaited = scheduleShareNotification(context, notification);
  if (awaited) await awaited;
  return true;
}

export async function cleanupExpiredShares(
  env,
  { now = Date.now(), manual = false, context = {} } = {},
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
      context,
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

export async function insertShareLink(env, row) {
  const runInsert = () =>
    env.D1.prepare(
      `INSERT INTO share_links
       (token, path, name, size, content_type, target_type, allow_preview, allow_download, expires_at, max_downloads, download_count, password_salt, password_hash, items_json, expired_notified_at, created_at, last_accessed_at, last_access_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?, 0, '')`,
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
        row.itemsJson || "[]",
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

export async function reactivateExpiredShare(env, request, body) {
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

  const existingItems = parseShareItems(row);
  const isBundle = (row.target_type || "") === "bundle";
  const refreshedItems = [];
  if (isBundle) {
    for (const sharedItem of existingItems) {
      const target = await detectShareTarget(env, sharedItem.path);
      if (!target)
        return jsonResponse({ success: false, message: "File or folder not found" }, 404);
      refreshedItems.push(mapShareItem(sharedItem.path, target));
    }
  }
  const target = isBundle ? null : await detectShareTarget(env, row.path);
  if (!isBundle && !target)
    return jsonResponse({ success: false, message: "File or folder not found" }, 404);

  const expiresAt = ttlToExpiresAt(body);
  if (expiresAt && expiresAt <= Date.now())
    return jsonResponse(
      { success: false, message: "New expiry must be in the future" },
      400,
    );

  await env.D1.prepare(
    `UPDATE share_links
     SET expires_at = ?, expired_notified_at = 0, size = ?, content_type = ?, target_type = ?, items_json = ?
     WHERE token = ?`,
  )
    .bind(
      expiresAt,
      isBundle
        ? refreshedItems.reduce((sum, item) => sum + Number(item.size || 0), 0)
        : Number(target.size || 0),
      isBundle ? "application/vnd.o-drive.bundle+json" : target.contentType || "",
      isBundle ? "bundle" : target.targetType || row.target_type || "file",
      isBundle ? JSON.stringify(refreshedItems) : row.items_json || "[]",
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
      size: isBundle
        ? refreshedItems.reduce((sum, item) => sum + Number(item.size || 0), 0)
        : Number(target.size || 0),
      content_type: isBundle ? "application/vnd.o-drive.bundle+json" : target.contentType || "",
      target_type: isBundle ? "bundle" : target.targetType || row.target_type || "file",
      items_json: isBundle ? JSON.stringify(refreshedItems) : row.items_json || "[]",
    }),
  });
}

export async function expiredResponse(
  env,
  token,
  message = "Share link expired",
  row,
  context = {},
) {
  row = row || (await getShare(env, token));
  const autoDeleteAt = row
    ? Number(row.expires_at || 0) + EXPIRED_SHARE_AUTO_DELETE_MS
    : 0;
  const shouldDelete = row ? canAutoDeleteExpiredShare(row) : true;
  if (row) await notifyShareExpiredOnce(env, row, "expired", context);
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

export async function exhaustedResponse(env, token, row, context = {}) {
  row = row || (await getShare(env, token));
  if (row) await notifyShareExpiredOnce(env, row, "exhausted", context);
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
