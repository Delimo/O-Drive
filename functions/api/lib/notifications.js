import { jsonResponse, apiError } from "./common/index.js";

const NOTIFY_TABLE =
  "CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, message TEXT NOT NULL, path TEXT DEFAULT '', read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)";

const notifyTableEnsured = new WeakSet();
async function ensureNotificationTable(env) {
  if (notifyTableEnsured.has(env)) return;
  await env.D1.prepare(NOTIFY_TABLE).run();
  try {
    await env.D1.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)").run();
  } catch (_) {}
  try {
    await env.D1.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)").run();
  } catch (_) {}
  notifyTableEnsured.add(env);
}

export async function createNotification(env, { event, message, path = "" }) {
  await ensureNotificationTable(env);
  const now = Date.now();
  await env.D1.prepare(
    "INSERT INTO notifications (event, message, path, read, created_at) VALUES (?, ?, ?, 0, ?)",
  )
    .bind(event, message, path, now)
    .run();
}

export async function listNotifications(env, limit = 20) {
  await ensureNotificationTable(env);
  const rows = await env.D1.prepare(
    "SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?",
  )
    .bind(limit)
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
    const items = await listNotifications(env, limit);
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
