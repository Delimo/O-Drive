import { addLog, apiError, jsonResponse } from "./common.js";
import { handleBatchDelete, handlePaste } from "./file-mutations.js";

const TASK_TYPES = ["paste", "delete", "upload"];
const TASK_STATUSES = ["queued", "running", "completed", "partial", "failed"];
const TASK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TASK_RETENTION_ROWS = 100;

function taskId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureTaskTable(env) {
  await env.D1.prepare(
    `CREATE TABLE IF NOT EXISTS file_tasks (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL DEFAULT '{}',
      result TEXT NOT NULL DEFAULT '{}',
      error TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      finished_at INTEGER NOT NULL DEFAULT 0
    )`,
  ).run();
}

export async function cleanupFileTasks(
  env,
  now = Date.now(),
  { force = false } = {},
) {
  await ensureTaskTable(env);
  let total = 0;
  if (force) {
    const r = await env.D1.prepare(
      "DELETE FROM file_tasks WHERE status NOT IN ('queued', 'running')",
    )
      .run()
      .catch(() => ({}));
    return r?.meta?.changes || 0;
  }
  const cutoff = now - TASK_RETENTION_MS;
  const r1 = await env.D1.prepare(
    "DELETE FROM file_tasks WHERE status NOT IN ('queued', 'running') AND finished_at > 0 AND finished_at < ?",
  )
    .bind(cutoff)
    .run()
    .catch(() => ({}));
  total += r1?.meta?.changes || 0;
  const r2 = await env.D1.prepare(
    `DELETE FROM file_tasks
     WHERE status NOT IN ('queued', 'running')
       AND id NOT IN (
         SELECT id FROM file_tasks
         WHERE status NOT IN ('queued', 'running')
         ORDER BY created_at DESC
         LIMIT ?
       )`,
  )
    .bind(TASK_RETENTION_ROWS)
    .run()
    .catch(() => ({}));
  total += r2?.meta?.changes || 0;
  return total;
}

function mapTask(row) {
  let result = {};
  let payload = {};
  if (row.result && typeof row.result === "object") result = row.result;
  else {
    try {
      result = JSON.parse(row.result || "{}");
    } catch (_) {}
  }
  if (row.payload && typeof row.payload === "object") payload = row.payload;
  else {
    try {
      payload = JSON.parse(row.payload || "{}");
    } catch (_) {}
  }
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    total: Number(row.total || 0),
    completed: Number(row.completed || 0),
    failed: Number(row.failed || 0),
    payload,
    result,
    error: row.error || "",
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    finishedAt: Number(row.finished_at || 0),
  };
}

async function updateTask(env, id, patch) {
  const now = Date.now();
  const sets = ["updated_at = ?"];
  const params = [now];
  const strFields = { status: "status", error: "error" };
  const numFields = {
    total: "total",
    completed: "completed",
    failed: "failed",
    finished_at: "finished_at",
  };
  for (const [key, col] of Object.entries(strFields)) {
    if (key in patch) {
      sets.push(`${col} = ?`);
      params.push(String(patch[key] ?? ""));
    }
  }
  for (const [key, col] of Object.entries(numFields)) {
    if (key in patch) {
      sets.push(`${col} = ?`);
      params.push(Number(patch[key] ?? 0));
    }
  }
  if ("result" in patch) {
    sets.push("result = ?");
    params.push(
      typeof patch.result === "string"
        ? patch.result
        : JSON.stringify(patch.result || {}),
    );
  }
  params.push(id);
  await env.D1.prepare(`UPDATE file_tasks SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...params)
    .run();
}

function jsonRequest(url, body, request) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": request.headers.get("cf-connecting-ip") || "",
    },
    body: JSON.stringify(body),
  });
}

async function executeTask(env, request, task) {
  const started = Date.now();
  await updateTask(env, task.id, { status: "running" });
  try {
    const payload = task.payload || {};
    const taskRequest = jsonRequest(request.url, payload, request);
    let res;
    if (task.type === "paste") res = await handlePaste(env, taskRequest);
    else if (task.type === "delete")
      res = await handleBatchDelete(env, taskRequest);
    else throw new Error("Unsupported task type");

    const data = await res.json().catch(() => ({}));
    const failed = Array.isArray(data.failed) ? data.failed.length : 0;
    const completed = Number(
      data.completed ?? (data.success === false ? 0 : task.total - failed),
    );
    await updateTask(env, task.id, {
      status:
        res.ok && data.success !== false
          ? "completed"
          : completed > 0
            ? "partial"
            : "failed",
      completed,
      failed,
      result: data,
      error: res.ok ? "" : data.message || "Task failed",
      finished_at: Date.now(),
    });
    await addLog(env, request, "TASK_FINISH", {
      details: `${task.type} task ${task.id}`,
      status: res.ok ? "ok" : "failed",
      durationMs: Date.now() - started,
      metadata: { taskId: task.id, type: task.type, completed, failed },
    });
  } catch (err) {
    await updateTask(env, task.id, {
      status: "failed",
      error: err?.message || "Task failed",
      finished_at: Date.now(),
    });
    await addLog(env, request, "TASK_FINISH", {
      details: `${task.type} task ${task.id}`,
      status: "failed",
      durationMs: Date.now() - started,
      errorCode: "TASK_FAILED",
      metadata: { taskId: task.id, type: task.type },
    });
  }
}

function scheduleTask(env, request, context, task) {
  const run = executeTask(env, request, task);
  if (typeof context?.waitUntil === "function") context.waitUntil(run);
  else run.catch(() => {});
}

export async function createFileTask(env, request, context = {}) {
  await ensureTaskTable(env);
  await cleanupFileTasks(env);
  const body = await request.json().catch(() => ({}));
  const type = String(body.type || "").trim();
  if (!TASK_TYPES.includes(type))
    return apiError("INVALID_TASK_TYPE", "Invalid task type", 400);
  const payload =
    body.payload && typeof body.payload === "object" ? body.payload : {};
  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  const uploadFiles = Array.isArray(payload.files) ? payload.files : [];
  if (type !== "upload" && !paths.length)
    return apiError("INVALID_TASK_PAYLOAD", "Task paths are required", 400);
  if (type === "upload" && !uploadFiles.length)
    return apiError("INVALID_TASK_PAYLOAD", "Upload files are required", 400);

  const id = taskId();
  const now = Date.now();
  const task = {
    id,
    type,
    status: "queued",
    total: type === "upload" ? uploadFiles.length : paths.length,
    completed: 0,
    failed: 0,
    payload,
    result: {},
    error: "",
    created_at: now,
    updated_at: now,
    finished_at: 0,
  };
  await env.D1.prepare(
    `INSERT INTO file_tasks (id, type, status, total, completed, failed, payload, result, error, created_at, updated_at, finished_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, '{}', '', ?, ?, 0)`,
  )
    .bind(id, type, "queued", task.total, JSON.stringify(payload), now, now)
    .run();
  await addLog(env, request, "TASK_CREATE", {
    details: `${type} task ${id}`,
    status: "queued",
    metadata: { taskId: id, type, total: task.total },
  });
  if (type !== "upload") scheduleTask(env, request, context, task);
  return jsonResponse({ success: true, item: mapTask(task) }, 202);
}

export async function updateFileTask(env, request, url) {
  await ensureTaskTable(env);
  const id = url.searchParams.get("id") || "";
  if (!id) return apiError("TASK_ID_REQUIRED", "Task id is required", 400);
  const row = await env.D1.prepare("SELECT * FROM file_tasks WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return apiError("TASK_NOT_FOUND", "Task not found", 404);
  if (row.type !== "upload")
    return apiError(
      "TASK_UPDATE_NOT_ALLOWED",
      "Only upload tasks can be updated by clients",
      409,
    );

  const body = await request.json().catch(() => ({}));
  const status = TASK_STATUSES.includes(body.status) ? body.status : row.status;
  const total = Number.isFinite(Number(body.total))
    ? Math.max(0, Number(body.total))
    : Number(row.total || 0);
  const completed = Number.isFinite(Number(body.completed))
    ? Math.max(0, Number(body.completed))
    : Number(row.completed || 0);
  const failed = Number.isFinite(Number(body.failed))
    ? Math.max(0, Number(body.failed))
    : Number(row.failed || 0);
  let currentResult = {};
  try {
    currentResult = JSON.parse(row.result || "{}");
  } catch (_) {}
  const result =
    body.result && typeof body.result === "object"
      ? body.result
      : currentResult;
  const finished = ["completed", "partial", "failed"].includes(status);
  await updateTask(env, id, {
    status,
    total,
    completed,
    failed,
    result,
    error: String(body.error || ""),
    finished_at: finished ? Number(body.finishedAt || Date.now()) : 0,
  });
  const item = {
    ...mapTask(row),
    status,
    total,
    completed,
    failed,
    result,
    error: String(body.error || ""),
    updatedAt: Date.now(),
  };
  return jsonResponse({ success: true, item });
}

export async function getFileTask(env, url) {
  await ensureTaskTable(env);
  await cleanupFileTasks(env);
  const id = url.searchParams.get("id") || "";
  if (!id) {
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") || 20), 1),
      50,
    );
    const rows = await env.D1.prepare(
      "SELECT * FROM file_tasks ORDER BY created_at DESC LIMIT ?",
    )
      .bind(limit)
      .all();
    return jsonResponse({
      success: true,
      items: (rows.results || []).map(mapTask),
    });
  }
  const row = await env.D1.prepare("SELECT * FROM file_tasks WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return apiError("TASK_NOT_FOUND", "Task not found", 404);
  return jsonResponse({ success: true, item: mapTask(row) });
}
