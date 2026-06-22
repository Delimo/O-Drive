import { indexedFileCount, indexedFileKind } from "./helpers.js";
import { ensureFileIndexTable } from "./ensure.js";
import { mapIndexRow } from "./helpers.js";

function searchFilterClauses(filters = {}) {
  const clauses = [];
  const params = [];
  const kind = String(filters.kind || "all");
  if (kind && kind !== "all") {
    if (kind === "file") clauses.push("kind IS NOT NULL");
    else {
      clauses.push("kind = ?");
      params.push(kind);
    }
  }
  if (Number.isFinite(filters.minSize)) {
    clauses.push("size >= ?");
    params.push(filters.minSize);
  }
  if (Number.isFinite(filters.maxSize)) {
    clauses.push("size <= ?");
    params.push(filters.maxSize);
  }
  if (Number.isFinite(filters.fromTime)) {
    clauses.push("uploaded_at >= ?");
    params.push(filters.fromTime);
  }
  if (Number.isFinite(filters.toTime)) {
    clauses.push("uploaded_at <= ?");
    params.push(filters.toTime);
  }
  return { clauses, params };
}

function rowMatchesSearchFilters(row, filters = {}) {
  const kind = String(filters.kind || "all");
  if (kind && kind !== "all" && kind !== "file" && row.kind !== kind)
    return false;
  const size = Number(row.size || 0);
  if (Number.isFinite(filters.minSize) && size < filters.minSize) return false;
  if (Number.isFinite(filters.maxSize) && size > filters.maxSize) return false;
  const uploadedAt = Number(row.uploaded_at || row.updated_at || 0);
  if (Number.isFinite(filters.fromTime) && uploadedAt < filters.fromTime)
    return false;
  if (Number.isFinite(filters.toTime) && uploadedAt > filters.toTime)
    return false;
  return true;
}

const searchCache = new Map();
const SEARCH_CACHE_TTL = 10000;
const SEARCH_CACHE_MAX_SIZE = 500;

export async function searchFileIndex(
  env,
  { q, scope, limit, cursor, filters = {} },
  hiddenPaths,
  auth,
) {
  const count = await indexedFileCount(env);
  if (!count) return null;
  if (!q || String(q).length < 2) return null;
  const cacheKey = `${q}|${scope}|${limit}|${cursor}|${JSON.stringify(filters)}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) return cached.data;

  let cursorPath = "";
  if (cursor) {
    try {
      const decoded = JSON.parse(
        atob(cursor.replace(/-/g, "+").replace(/_/g, "/")),
      );
      cursorPath = decoded.p || "";
    } catch (_) {
      cursorPath = "";
    }
  }

  const cleanScope = String(scope || "").replace(/^\/+|\/+$/g, "");
  const like = `%${String(q || "").toLowerCase()}%`;
  const filterSql = searchFilterClauses(filters);
  const scopeClause = cleanScope ? " AND (path = ? OR path LIKE ?)" : "";
  const keysetClause = cursorPath ? " AND path > ?" : "";
  const hiddenClause =
    auth.role !== "admin" && hiddenPaths.length
      ? hiddenPaths
          .map(() => " AND (path NOT LIKE ? AND path != ?)")
          .join("")
      : "";
  const extraClauses = filterSql.clauses.length
    ? ` AND ${filterSql.clauses.join(" AND ")}`
    : "";
  const sql = `SELECT * FROM file_index WHERE lower(name) LIKE ?${scopeClause}${keysetClause}${hiddenClause}${extraClauses} ORDER BY path ASC LIMIT ?`;

  try {
    const params = [];
    params.push(like);
    if (cleanScope) {
      params.push(cleanScope, `${cleanScope}/%`);
    }
    if (cursorPath) {
      params.push(cursorPath);
    }
    if (auth.role !== "admin" && hiddenPaths.length) {
      for (const hp of hiddenPaths) {
        params.push(`${hp}/%`, hp);
      }
    }
    params.push(...filterSql.params, limit + 1);

    const rows = await env.D1.prepare(sql)
      .bind(...params)
      .all();
    const batch = rows.results || [];
    const page = batch.slice(0, limit).map((row) => mapIndexRow(row));
    const hasMore = batch.length > limit;
    const data = {
      files: page,
      nextCursor: hasMore
        ? btoa(JSON.stringify({ p: page[page.length - 1].fullKey }))
        : "",
      scanned: page.length,
      scanLimitReached: false,
    };
    if (searchCache.size >= SEARCH_CACHE_MAX_SIZE) {
      const oldest = searchCache.entries().next().value;
      if (oldest) searchCache.delete(oldest[0]);
    }
    searchCache.set(cacheKey, { data, ts: Date.now() });
    return data;
  } catch (_) {
    console.warn("[file-index] searchFileIndex query failed");
    return null;
  }
}
