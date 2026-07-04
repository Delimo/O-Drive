import { ensureShareTable } from "../schema.js";

const SHARE_ACCESS_LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    ""
  );
}

export async function recordShareAccess(
  env,
  request,
  token,
  {
    action = "info",
    path = "",
    success = true,
    status = 200,
    bytes = 0,
    countVisit = true,
  } = {},
) {
  await ensureShareTable(env);
  const now = Date.now();
  if (countVisit) {
    await env.D1.prepare(
      "UPDATE share_links SET visit_count = visit_count + 1, last_accessed_at = ?, last_access_ip = ? WHERE token = ?",
    )
      .bind(now, clientIp(request), token)
      .run();
  }
  await env.D1.prepare(
    `INSERT INTO share_access_logs
      (token, action, path, ip, user_agent, success, status, bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      token,
      String(action || "info"),
      String(path || ""),
      clientIp(request),
      request.headers.get("user-agent") || "",
      success ? 1 : 0,
      Number(status || 0),
      Number(bytes || 0),
      now,
    )
    .run();
  await env.D1.prepare("DELETE FROM share_access_logs WHERE created_at < ?")
    .bind(now - SHARE_ACCESS_LOG_RETENTION_MS)
    .run()
    .catch(() => {});
}

export async function loadRecentShareAccessLogs(env, tokens = [], limitPerShare = 3) {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (!uniqueTokens.length) return new Map();
  await ensureShareTable(env);
  const placeholders = uniqueTokens.map(() => "?").join(",");
  const rows = await env.D1.prepare(
    `SELECT * FROM share_access_logs
     WHERE token IN (${placeholders})
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  )
    .bind(...uniqueTokens, uniqueTokens.length * limitPerShare)
    .all();
  const grouped = new Map();
  for (const row of rows.results || []) {
    const token = row.token || "";
    const list = grouped.get(token) || [];
    if (list.length >= limitPerShare) continue;
    list.push({
      action: row.action || "",
      path: row.path || "",
      ip: row.ip || "",
      userAgent: row.user_agent || "",
      success: Number(row.success || 0) === 1,
      status: Number(row.status || 0),
      bytes: Number(row.bytes || 0),
      createdAt: Number(row.created_at || 0),
    });
    grouped.set(token, list);
  }
  return grouped;
}
