import { addLog, apiError, jsonResponse } from "../common/index.js";
import { ensureSettingsTable } from "./schema.js";

export async function handleTrashRetention(env, request, method) {
  await ensureSettingsTable(env);
  if (method === "GET") {
    const row = await env.D1.prepare(
      "SELECT value FROM settings WHERE key = 'trash_retention_days'",
    ).first();
    return jsonResponse({ days: Number(row?.value || 0) });
  }
  if (method === "PUT") {
    const body = await request.json();
    const days = Math.max(0, Math.min(3650, Number(body.days || 0)));
    await env.D1.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('trash_retention_days', ?)",
    )
      .bind(String(days))
      .run();
    await addLog(env, request, "TRASH_RETENTION", `${days} days`);
    return jsonResponse({ success: true, days });
  }
  return apiError("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
}
