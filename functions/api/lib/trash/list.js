import { jsonResponse } from "../common/index.js";
import { ensureTrashTable } from "./schema.js";

export async function handleTrashList(env, url) {
  await ensureTrashTable(env);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const size = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("size") || "20")),
  );
  const filters = [];
  const params = [];
  const q = String(url.searchParams.get("q") || "").trim();
  const kind = String(url.searchParams.get("kind") || "").trim();
  const from = Number(url.searchParams.get("from") || 0);
  const to = Number(url.searchParams.get("to") || 0);
  if (q) {
    filters.push("(original_key LIKE ? OR name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (["file", "folder"].includes(kind)) {
    filters.push("kind = ?");
    params.push(kind);
  }
  if (Number.isFinite(from) && from > 0) {
    filters.push("trashed_at >= ?");
    params.push(from);
  }
  if (Number.isFinite(to) && to > 0) {
    filters.push("trashed_at <= ?");
    params.push(to);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  let totalStmt = env.D1.prepare(
    `SELECT COUNT(*) as count FROM trash ${where}`,
  );
  if (params.length) totalStmt = totalStmt.bind(...params);
  const totalRes = await totalStmt.first();
  const rows = await env.D1.prepare(
    `SELECT * FROM trash ${where} ORDER BY trashed_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...params, size, (page - 1) * size)
    .all();
  return jsonResponse({
    items: rows.results || [],
    totalPages: Math.max(1, Math.ceil((totalRes?.count || 0) / size)),
    currentPage: page,
    total: Number(totalRes?.count || 0),
  });
}
