import { addLog, apiError, jsonResponse } from './common.js';
import { handleBatchDelete, handlePaste } from './file-mutations.js';

const TASK_TYPES = ['paste', 'delete'];

function taskId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
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
    )`
  ).run();
}

function mapTask(row) {
  let result = {};
  let payload = {};
  try { result = JSON.parse(row.result || '{}'); } catch (_) {}
  try { payload = JSON.parse(row.payload || '{}'); } catch (_) {}
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    total: Number(row.total || 0),
    completed: Number(row.completed || 0),
    failed: Number(row.failed || 0),
    payload,
    result,
    error: row.error || '',
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    finishedAt: Number(row.finished_at || 0),
  };
}

async function updateTask(env, id, patch) {
  const row = await env.D1.prepare('SELECT * FROM file_tasks WHERE id = ?').bind(id).first();
  if (!row) return;
  const next = { ...row, ...patch, updated_at: Date.now() };
  await env.D1.prepare(
    `UPDATE file_tasks SET status = ?, total = ?, completed = ?, failed = ?, result = ?, error = ?, updated_at = ?, finished_at = ?
     WHERE id = ?`
  ).bind(
    next.status,
    Number(next.total || 0),
    Number(next.completed || 0),
    Number(next.failed || 0),
    typeof next.result === 'string' ? next.result : JSON.stringify(next.result || {}),
    String(next.error || ''),
    Number(next.updated_at || Date.now()),
    Number(next.finished_at || 0),
    id,
  ).run();
}

function jsonRequest(url, body, request) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': request.headers.get('cf-connecting-ip') || '',
    },
    body: JSON.stringify(body),
  });
}

async function executeTask(env, request, task) {
  const started = Date.now();
  await updateTask(env, task.id, { status: 'running' });
  try {
    const payload = task.payload || {};
    const taskRequest = jsonRequest(request.url, payload, request);
    let res;
    if (task.type === 'paste') res = await handlePaste(env, taskRequest);
    else if (task.type === 'delete') res = await handleBatchDelete(env, taskRequest);
    else throw new Error('Unsupported task type');

    const data = await res.json().catch(() => ({}));
    const failed = Array.isArray(data.failed) ? data.failed.length : 0;
    const completed = Number(data.completed ?? (data.success === false ? 0 : task.total - failed));
    await updateTask(env, task.id, {
      status: res.ok && data.success !== false ? 'completed' : (completed > 0 ? 'partial' : 'failed'),
      completed,
      failed,
      result: data,
      error: res.ok ? '' : data.message || 'Task failed',
      finished_at: Date.now(),
    });
    await addLog(env, request, 'TASK_FINISH', {
      details: `${task.type} task ${task.id}`,
      status: res.ok ? 'ok' : 'failed',
      durationMs: Date.now() - started,
      metadata: { taskId: task.id, type: task.type, completed, failed },
    });
  } catch (err) {
    await updateTask(env, task.id, {
      status: 'failed',
      error: err?.message || 'Task failed',
      finished_at: Date.now(),
    });
    await addLog(env, request, 'TASK_FINISH', {
      details: `${task.type} task ${task.id}`,
      status: 'failed',
      durationMs: Date.now() - started,
      errorCode: 'TASK_FAILED',
      metadata: { taskId: task.id, type: task.type },
    });
  }
}

function scheduleTask(env, request, context, task) {
  const run = executeTask(env, request, task);
  if (typeof context?.waitUntil === 'function') context.waitUntil(run);
  else run.catch(() => {});
}

export async function createFileTask(env, request, context = {}) {
  await ensureTaskTable(env);
  const body = await request.json().catch(() => ({}));
  const type = String(body.type || '').trim();
  if (!TASK_TYPES.includes(type)) return apiError('INVALID_TASK_TYPE', 'Invalid task type', 400);
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  if (!paths.length) return apiError('INVALID_TASK_PAYLOAD', 'Task paths are required', 400);

  const id = taskId();
  const now = Date.now();
  const task = {
    id,
    type,
    status: 'queued',
    total: paths.length,
    completed: 0,
    failed: 0,
    payload,
    result: {},
    error: '',
    created_at: now,
    updated_at: now,
    finished_at: 0,
  };
  await env.D1.prepare(
    `INSERT INTO file_tasks (id, type, status, total, completed, failed, payload, result, error, created_at, updated_at, finished_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, '{}', '', ?, ?, 0)`
  ).bind(id, type, 'queued', task.total, JSON.stringify(payload), now, now).run();
  await addLog(env, request, 'TASK_CREATE', {
    details: `${type} task ${id}`,
    status: 'queued',
    metadata: { taskId: id, type, total: task.total },
  });
  scheduleTask(env, request, context, task);
  return jsonResponse({ success: true, item: mapTask(task) }, 202);
}

export async function getFileTask(env, url) {
  await ensureTaskTable(env);
  const id = url.searchParams.get('id') || '';
  if (!id) {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 50);
    const rows = await env.D1.prepare('SELECT * FROM file_tasks ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    return jsonResponse({ success: true, items: (rows.results || []).map(mapTask) });
  }
  const row = await env.D1.prepare('SELECT * FROM file_tasks WHERE id = ?').bind(id).first();
  if (!row) return apiError('TASK_NOT_FOUND', 'Task not found', 404);
  return jsonResponse({ success: true, item: mapTask(row) });
}
