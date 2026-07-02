import { addLog, jsonResponse } from "../common/index.js";
import {
  mapTrashRows,
  purgeTrashRecord,
  trashRows,
} from "./helpers.js";
import { ensureSettingsTable, ensureTrashTable } from "./schema.js";

export async function handleTrashDelete(env, request) {
  const { id } = await request.json().catch(() => ({}));
  if (!id)
    return jsonResponse(
      { success: false, message: "Invalid trash record" },
      400,
    );
  await ensureTrashTable(env);
  const row = await env.D1.prepare("SELECT * FROM trash WHERE id = ?")
    .bind(id)
    .first();
  if (!row)
    return jsonResponse(
      { success: false, message: "Trash item not found" },
      404,
    );
  await purgeTrashRecord(env, row, request);
  return jsonResponse({ success: true, originalKey: row.original_key });
}

export async function handleTrashClear(env, request) {
  const rows = await trashRows(env);
  let deleted = 0;
  const errors = [];
  const results = await mapTrashRows(rows, async (row) => {
    try {
      await purgeTrashRecord(env, row, request);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  results.forEach((result, index) => {
    if (result?.ok) deleted++;
    else
      errors.push({
        id: rows[index].id,
        original: rows[index].original_key,
        error: result?.error || "Failed",
      });
  });
  await addLog(env, request, "TRASH_CLEAR", `${deleted}/${rows.length} items`);
  return jsonResponse({
    success: true,
    deleted,
    total: rows.length,
    errors: errors.length ? errors : undefined,
  });
}

export async function handleTrashCleanup(env, request) {
  await ensureSettingsTable(env);
  const setting = await env.D1.prepare(
    "SELECT value FROM settings WHERE key = 'trash_retention_days'",
  ).first();
  const days = Math.max(0, Number(setting?.value || 0));
  if (!days)
    return jsonResponse({ success: true, deleted: 0, retentionDays: days });
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await trashRows(env, "WHERE trashed_at < ?", [cutoff]);
  let deleted = 0;
  const errors = [];
  const BATCH_SIZE = 10;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (row) => {
        try {
          await purgeTrashRecord(env, row, request);
          deleted++;
        } catch (e) {
          errors.push({
            id: row.id,
            original: row.original_key,
            error: e.message,
          });
        }
      }),
    );
  }
  await addLog(
    env,
    request,
    "TRASH_CLEANUP",
    `${deleted}/${rows.length} items older than ${days} days`,
  );
  return jsonResponse({
    success: true,
    deleted,
    total: rows.length,
    retentionDays: days,
    errors: errors.length ? errors : undefined,
  });
}
