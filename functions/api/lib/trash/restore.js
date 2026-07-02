import { jsonResponse } from "../common/index.js";
import {
  restoreTrashRecord,
  trashRestorePreview,
} from "./helpers.js";
import { ensureTrashTable } from "./schema.js";

export async function handleTrashRestore(env, request) {
  const { id, conflict } = await request.json().catch(() => ({}));
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
  const result = await restoreTrashRecord(env, row, request, { conflict });
  return jsonResponse(result);
}

export async function handleTrashRestorePreview(env, request) {
  const { ids } = await request.json().catch(() => ({}));
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length || uniqueIds.length > 100)
    return jsonResponse(
      { success: false, message: "Invalid trash records" },
      400,
    );
  await ensureTrashTable(env);
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = await env.D1.prepare(
    `SELECT * FROM trash WHERE id IN (${placeholders})`,
  )
    .bind(...uniqueIds)
    .all();
  const byId = new Map((rows.results || []).map((row) => [row.id, row]));
  const orderedRows = uniqueIds.map((id) => byId.get(id)).filter(Boolean);
  if (orderedRows.length !== uniqueIds.length) {
    return jsonResponse(
      { success: false, message: "Some trash items were not found" },
      404,
    );
  }
  return jsonResponse({
    success: true,
    ...(await trashRestorePreview(env, orderedRows)),
  });
}

export async function handleTrashBatchRestore(env, request) {
  const { ids, conflict } = await request.json().catch(() => ({}));
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(Boolean) : [])];
  if (!uniqueIds.length || uniqueIds.length > 100)
    return jsonResponse(
      { success: false, message: "Invalid trash records" },
      400,
    );
  await ensureTrashTable(env);
  const placeholders = uniqueIds.map(() => "?").join(",");
  const rows = await env.D1.prepare(
    `SELECT * FROM trash WHERE id IN (${placeholders})`,
  )
    .bind(...uniqueIds)
    .all();
  const byId = new Map((rows.results || []).map((row) => [row.id, row]));
  const orderedRows = uniqueIds.map((id) => byId.get(id)).filter(Boolean);
  if (orderedRows.length !== uniqueIds.length) {
    return jsonResponse(
      { success: false, message: "Some trash items were not found" },
      404,
    );
  }

  let completed = 0;
  let skipped = 0;
  const restored = [];
  const failed = [];
  for (const row of orderedRows) {
    try {
      const result = await restoreTrashRecord(env, row, request, { conflict });
      if (result.skipped) skipped++;
      else completed++;
      restored.push(result);
    } catch (e) {
      failed.push({
        id: row.id,
        originalKey: row.original_key,
        message: e.message || "Failed",
      });
    }
  }
  return jsonResponse(
    {
      success: failed.length === 0,
      completed,
      skipped,
      total: orderedRows.length,
      restored,
      failed: failed.length ? failed : undefined,
    },
    failed.length && !completed && !skipped ? 409 : 200,
  );
}
