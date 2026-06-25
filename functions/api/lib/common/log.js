import { ensureCoreTables } from "../schema.js";

const LOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const LOG_RETENTION_ROWS = 2000;

export async function addLog(env, request, action, details) {
  await ensureCoreTables(env);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const detailText =
    typeof details === "object" && details !== null
      ? String(details.details || details.message || details.targetPath || "")
      : String(details || "");
  const meta = typeof details === "object" && details !== null ? details : {};
  try {
    await env.D1.prepare(
      `INSERT INTO logs (action, details, ip, actor, status, duration_ms, target_path, error_code, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        action,
        detailText,
        ip,
        String(meta.actor || meta.role || ""),
        String(meta.status || ""),
        Number(meta.durationMs || meta.duration_ms || 0),
        String(meta.targetPath || meta.path || ""),
        String(meta.errorCode || meta.code || ""),
        meta.metadata ? JSON.stringify(meta.metadata).slice(0, 4000) : "",
        Date.now(),
      )
      .run();
  } catch (e) {
    try {
      await env.D1.prepare(
        "INSERT INTO logs (action, details, ip, timestamp) VALUES (?, ?, ?, ?)",
      )
        .bind(action, detailText, ip, Date.now())
        .run();
    } catch (_) {
      console.warn("[common] addLog fallback insert failed");
    }
  }
}

export async function cleanupLogs(env, now = Date.now()) {
  await ensureCoreTables(env);
  const cutoff = now - LOG_RETENTION_MS;
  let total = 0;
  const r1 = await env.D1.prepare("DELETE FROM logs WHERE timestamp < ?")
    .bind(cutoff)
    .run()
    .catch(() => ({}));
  total += r1?.meta?.changes || 0;
  try {
    const cutoff = await env.D1.prepare(
      "SELECT id FROM logs ORDER BY id DESC LIMIT 1 OFFSET ?",
    ).bind(LOG_RETENTION_ROWS).first();
    if (cutoff?.id) {
      const r2 = await env.D1.prepare("DELETE FROM logs WHERE id <= ?").bind(cutoff.id).run();
      total += r2?.meta?.changes || 0;
    }
  } catch (_) {
    console.warn("[common] cleanupLogs row-limit delete failed");
  }
  return total;
}
