import { jsonResponse, apiError } from "./common/index.js";

const NOTIFY_TABLE =
  "CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', message TEXT NOT NULL, path TEXT DEFAULT '', read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)";

const notifyTableEnsured = new WeakSet();
async function ensureNotificationTable(env) {
  if (notifyTableEnsured.has(env)) return;
  await env.D1.prepare(NOTIFY_TABLE).run();
  try {
    await env.D1.prepare("ALTER TABLE notifications ADD COLUMN severity TEXT NOT NULL DEFAULT 'info'").run();
  } catch (_) {}
  try {
    await env.D1.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)").run();
  } catch (_) {}
  try {
    await env.D1.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)").run();
  } catch (_) {}
  try {
    await env.D1.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_severity_created_at ON notifications(severity, created_at)").run();
  } catch (_) {}
  try {
    await env.D1.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_event_created_at ON notifications(event, created_at)").run();
  } catch (_) {}
  notifyTableEnsured.add(env);
}

function normalizeSeverity(value = "") {
  const severity = String(value || "").toLowerCase();
  return ["info", "warning", "error"].includes(severity) ? severity : "info";
}

function severityForEvent(event = "", fallback = "") {
  if (fallback) return normalizeSeverity(fallback);
  const name = String(event || "").toLowerCase();
  if (name.includes(".error") || name.includes(".failed") || name.includes("failure")) return "error";
  if (name.includes(".warning") || name.includes("burst") || name.includes("quota")) return "warning";
  return "info";
}

export async function createNotification(env, { event, message, path = "", severity = "" }) {
  await ensureNotificationTable(env);
  const now = Date.now();
  await env.D1.prepare(
    "INSERT INTO notifications (event, severity, message, path, read, created_at) VALUES (?, ?, ?, ?, 0, ?)",
  )
    .bind(event, severityForEvent(event, severity), message, path, now)
    .run();
}

export async function listNotifications(env, limit = 20, filters = {}) {
  await ensureNotificationTable(env);
  const clauses = [];
  const params = [];
  const severity = normalizeSeverity(filters.severity || "");
  if (filters.severity && severity) {
    clauses.push("severity = ?");
    params.push(severity);
  }
  if (filters.event) {
    clauses.push("event = ?");
    params.push(String(filters.event));
  }
  if (filters.read === "unread") clauses.push("read = 0");
  if (filters.read === "read") clauses.push("read = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await env.D1.prepare(
    `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(...params, limit)
    .all();
  return rows.results || [];
}

export async function markNotificationRead(env, id) {
  await ensureNotificationTable(env);
  await env.D1.prepare("UPDATE notifications SET read = 1 WHERE id = ?")
    .bind(id)
    .run();
}

export async function markAllNotificationsRead(env) {
  await ensureNotificationTable(env);
  await env.D1.prepare(
    "UPDATE notifications SET read = 1 WHERE read = 0",
  ).run();
}

export async function getUnreadCount(env) {
  await ensureNotificationTable(env);
  const row = await env.D1.prepare(
    "SELECT COUNT(*) as count FROM notifications WHERE read = 0",
  ).first();
  return Number(row?.count || 0);
}

export async function handleAdminNotifications(env, request) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "20", 10),
      50,
    );
    const items = await listNotifications(env, limit, {
      severity: url.searchParams.get("severity") || "",
      event: url.searchParams.get("event") || "",
      read: url.searchParams.get("read") || "",
    });
    const unread = await getUnreadCount(env);
    return jsonResponse({ items, unread });
  }
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (body.action === "mark-read" && body.id) {
      await markNotificationRead(env, body.id);
      return jsonResponse({ success: true });
    }
    if (body.action === "mark-all-read") {
      await markAllNotificationsRead(env);
      const unread = await getUnreadCount(env);
      return jsonResponse({ success: true, unread });
    }
    return apiError("UNKNOWN_ACTION", "unknown action", 400);
  }
  return apiError("METHOD_NOT_ALLOWED", "method not allowed", 405);
}
