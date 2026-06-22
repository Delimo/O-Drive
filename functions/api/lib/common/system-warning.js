import { ensureCoreTables } from "../schema.js";

const SYSTEM_WARNING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SYSTEM_WARNING_RETENTION_ROWS = 100;

export async function recordSystemWarning(
  env,
  source,
  message,
  level = "warning",
) {
  if (!env?.D1) return;
  try {
    await ensureCoreTables(env);
    const createdAt = Date.now();
    const cleanLevel = ["error", "warning", "info"].includes(level)
      ? level
      : "warning";
    await env.D1.prepare(
      "INSERT INTO system_warnings (source, message, level, acknowledged_at, created_at) VALUES (?, ?, ?, 0, ?)",
    )
      .bind(
        String(source || "system"),
        String(message || "Unknown warning").slice(0, 1000),
        cleanLevel,
        createdAt,
      )
      .run();
    await cleanupSystemWarnings(env, createdAt);
  } catch (_) {
    console.warn("[common] recordSystemWarning insert failed");
  }
}

async function cleanupSystemWarnings(env, now = Date.now()) {
  const cutoff = now - SYSTEM_WARNING_RETENTION_MS;
  await env.D1.prepare("DELETE FROM system_warnings WHERE created_at < ?")
    .bind(cutoff)
    .run();
  try {
    const cutoff = await env.D1.prepare(
      "SELECT id FROM system_warnings ORDER BY id DESC LIMIT 1 OFFSET ?",
    ).bind(SYSTEM_WARNING_RETENTION_ROWS).first();
    if (cutoff?.id) {
      await env.D1.prepare("DELETE FROM system_warnings WHERE id <= ?").bind(cutoff.id).run();
    }
  } catch (_) {}
}
