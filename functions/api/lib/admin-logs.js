import { jsonResponse } from "./common.js";

export async function handleAdminLogs(env, url) {
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const size = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("size") || "20")),
  );
  const filters = [];
  const params = [];
  const q = String(url.searchParams.get("q") || "").trim();
  const action = String(url.searchParams.get("action") || "")
    .trim()
    .toUpperCase();
  const ip = String(url.searchParams.get("ip") || "").trim();
  const status = String(url.searchParams.get("status") || "").trim();
  const targetPath = String(url.searchParams.get("targetPath") || "").trim();
  const from = String(url.searchParams.get("from") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();
  if (q) {
    filters.push("(action LIKE ? OR details LIKE ? OR ip LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (action) {
    filters.push("action = ?");
    params.push(action);
  }
  if (ip) {
    filters.push("ip LIKE ?");
    params.push(`%${ip}%`);
  }
  if (status) {
    filters.push("status = ?");
    params.push(status);
  }
  if (targetPath) {
    filters.push("target_path LIKE ?");
    params.push(`%${targetPath}%`);
  }
  if (from) {
    filters.push("timestamp >= ?");
    params.push(new Date(from).getTime());
  }
  if (to) {
    filters.push("timestamp <= ?");
    params.push(new Date(to).getTime() + 86400000);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  let totalStmt = env.D1.prepare(`SELECT COUNT(*) as count FROM logs ${where}`);
  if (params.length) totalStmt = totalStmt.bind(...params);
  const totalRes = await totalStmt.first();
  const logs = await env.D1.prepare(
    `SELECT * FROM logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
  )
    .bind(...params, size, (page - 1) * size)
    .all();
  return jsonResponse({
    logs: logs.results,
    totalPages: Math.ceil((totalRes?.count || 0) / size),
    currentPage: page,
  });
}
