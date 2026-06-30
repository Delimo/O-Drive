import { indexedFileCount, indexedFileKind } from "./helpers.js";
import { ensureFileIndexTable } from "./ensure.js";
import { mapIndexRow } from "./helpers.js";
import { storageGet } from "../storage.js";

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

function searchHitForRow(row, q, filters = {}) {
  const needle = String(q || "").toLowerCase();
  const name = String(row.name || "");
  const path = String(row.path || "");
  const lowerName = name.toLowerCase();
  const lowerPath = path.toLowerCase();
  const filterLabels = [];
  if (filters.kind && filters.kind !== "all") filterLabels.push("类型");
  if (Number.isFinite(filters.minSize) || Number.isFinite(filters.maxSize))
    filterLabels.push("大小");
  if (Number.isFinite(filters.fromTime) || Number.isFinite(filters.toTime))
    filterLabels.push("时间");

  const base = lowerName.includes(needle)
    ? { type: "name", label: "文件名", value: name }
    : lowerPath.includes(needle)
      ? { type: "path", label: "路径", value: path }
      : { type: "filter", label: "筛选", value: path || name };
  return {
    ...base,
    query: q,
    filters: filterLabels,
  };
}

function isTextSearchCandidate(row) {
  if (row.kind === "folder") return false;
  const size = Number(row.size || 0);
  if (!Number.isFinite(size) || size <= 0 || size > 256 * 1024) return false;
  const type = String(row.content_type || "").toLowerCase();
  const name = String(row.name || row.path || "").toLowerCase();
  if (type.startsWith("text/")) return true;
  if (/(json|xml|yaml|javascript|typescript|markdown|csv|x-www-form-urlencoded)/.test(type)) return true;
  return /\.(txt|md|markdown|json|csv|xml|yml|yaml|js|mjs|cjs|ts|tsx|jsx|css|html|htm|sql|log)$/i.test(name);
}

function contentSnippet(text, needle) {
  const haystack = String(text || "");
  const lower = haystack.toLowerCase();
  const at = lower.indexOf(needle);
  if (at < 0) return "";
  const start = Math.max(0, at - 48);
  const end = Math.min(haystack.length, at + needle.length + 72);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < haystack.length ? "..." : "";
  return `${prefix}${haystack.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

async function readTextObject(env, row) {
  const objectKey = row.object_key || row.path;
  const storageId = row.storage_id || "r2";
  if (!objectKey) return "";
  const obj = await storageGet(env, storageId, objectKey);
  if (!obj?.body) return "";
  return await new Response(obj.body).text();
}

async function searchFileContents(
  env,
  { q, scope, limit, filters = {} },
  hiddenPaths,
  auth,
  excludedPaths,
) {
  const needle = String(q || "").toLowerCase();
  if (!needle || needle.length < 2 || limit <= 0) return [];
  let rows = [];
  try {
    const result = await env.D1.prepare("SELECT * FROM file_index ORDER BY path ASC").all();
    rows = result.results || [];
  } catch (_) {
    return [];
  }
  const cleanScope = String(scope || "").replace(/^\/+|\/+$/g, "");
  const matches = [];
  let scanned = 0;
  for (const row of rows) {
    if (matches.length >= limit) break;
    if (excludedPaths.has(row.path)) continue;
    if (cleanScope && row.path !== cleanScope && !String(row.path || "").startsWith(`${cleanScope}/`)) continue;
    if (auth.role !== "admin" && hiddenPaths.some((hp) => row.path === hp || String(row.path || "").startsWith(`${hp}/`))) continue;
    if (!rowMatchesSearchFilters(row, filters) || !isTextSearchCandidate(row)) continue;
    scanned++;
    if (scanned > 120) break;
    try {
      const text = await readTextObject(env, row);
      const snippet = contentSnippet(text, needle);
      if (!snippet) continue;
      matches.push({
        ...mapIndexRow(row),
        searchHit: {
          type: "content",
          label: "内容",
          value: snippet,
          query: q,
          filters: [],
        },
      });
    } catch (_) {}
  }
  return matches;
}

const searchCaches = new WeakMap();
const SEARCH_CACHE_TTL = 10000;
const SEARCH_CACHE_MAX_SIZE = 500;

function searchCacheForEnv(env) {
  if (!env || typeof env !== "object") return new Map();
  let cache = searchCaches.get(env);
  if (!cache) {
    cache = new Map();
    searchCaches.set(env, cache);
  }
  return cache;
}

export async function searchFileIndex(
  env,
  { q, scope, limit, cursor, filters = {} },
  hiddenPaths,
  auth,
) {
  const count = await indexedFileCount(env);
  if (!count) return null;
  if (!q || String(q).length < 2) return null;
  const cache = searchCacheForEnv(env);
  const visibilityKey =
    auth.role === "admin"
      ? "admin"
      : `guest:${[...hiddenPaths].sort().join(",")}`;
  const cacheKey = `${visibilityKey}|${q}|${scope}|${limit}|${cursor}|${JSON.stringify(filters)}`;
  const cached = cache.get(cacheKey);
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
  const sql = `SELECT * FROM file_index WHERE (lower(name) LIKE ? OR lower(path) LIKE ?)${scopeClause}${keysetClause}${hiddenClause}${extraClauses} ORDER BY path ASC LIMIT ?`;

  try {
    const params = [];
    params.push(like, like);
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
    const page = batch.slice(0, limit).map((row) => ({
      ...mapIndexRow(row),
      searchHit: searchHitForRow(row, q, filters),
    }));
    const hasMore = batch.length > limit;
    if (!hasMore && page.length < limit) {
      const contentMatches = await searchFileContents(
        env,
        { q, scope, limit: limit - page.length, filters },
        hiddenPaths,
        auth,
        new Set(page.map((item) => item.fullKey)),
      );
      page.push(...contentMatches);
    }
    const data = {
      files: page,
      nextCursor: hasMore
        ? btoa(JSON.stringify({ p: page[page.length - 1].fullKey }))
        : "",
      scanned: page.length,
      scanLimitReached: false,
    };
    if (cache.size >= SEARCH_CACHE_MAX_SIZE) {
      const oldest = cache.entries().next().value;
      if (oldest) cache.delete(oldest[0]);
    }
    cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  } catch (_) {
    console.warn("[file-index] searchFileIndex query failed");
    return null;
  }
}
