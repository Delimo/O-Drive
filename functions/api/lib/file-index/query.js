import { ensureFileIndexTable } from "./ensure.js";
import { normalizeIndexRow, mapIndexRow } from "./helpers.js";

export async function getFileIndexEntry(env, key) {
  if (!key || !(await ensureFileIndexTable(env))) return null;
  try {
    const row = await env.D1.prepare("SELECT * FROM file_index WHERE path = ?")
      .bind(key)
      .first();
    return normalizeIndexRow(row);
  } catch (_) {
    return null;
  }
}

export async function getFileIndexStorageId(env, key) {
  if (!key || !(await ensureFileIndexTable(env))) return "";
  try {
    const row = await env.D1.prepare(
      "SELECT storage_id FROM file_index WHERE path = ?",
    )
      .bind(key)
      .first();
    return row?.storage_id || "r2";
  } catch (_) {
    return "";
  }
}

export async function listFileIndexPrefix(env, prefix) {
  if (!(await ensureFileIndexTable(env))) return [];
  const clean = String(prefix || "").replace(/^\/+|\/+$/g, "");
  try {
    if (!clean) {
      const rows = await env.D1.prepare(
        "SELECT * FROM file_index ORDER BY path ASC",
      ).all();
      return (rows.results || []).map(normalizeIndexRow).filter(Boolean);
    }
    const rows = await env.D1.prepare(
      "SELECT * FROM file_index WHERE path = ? OR path LIKE ? ORDER BY path ASC",
    )
      .bind(clean, `${clean}/%`)
      .all();
    return (rows.results || []).map(normalizeIndexRow).filter(Boolean);
  } catch (_) {
    return [];
  }
}

export async function hasFileIndexPath(env, key) {
  return Boolean(await getFileIndexEntry(env, key));
}

export async function listIndexedDirectory(env, parent = "") {
  if (!(await ensureFileIndexTable(env))) return { folders: [], files: [] };
  const cleanParent = String(parent || "").replace(/^\/+|\/+$/g, "");
  try {
    const folderSql = cleanParent
      ? "SELECT DISTINCT parent FROM file_index WHERE parent LIKE ? ORDER BY parent ASC LIMIT 5000"
      : "SELECT DISTINCT parent FROM file_index WHERE parent != '' ORDER BY parent ASC LIMIT 5000";
    const folderParams = cleanParent ? [`${cleanParent}/%`] : [];
    const [fileRows, parentRows] = await env.D1.batch([
      env.D1.prepare(
        "SELECT * FROM file_index WHERE parent = ? ORDER BY name ASC",
      ).bind(cleanParent),
      env.D1.prepare(folderSql).bind(...folderParams),
    ]);
    const files = (fileRows.results || []).map(mapIndexRow);
    const folderNames = new Set();
    for (const row of parentRows.results || []) {
      const indexedParent = String(row.parent || "");
      const rest = cleanParent
        ? indexedParent.slice(cleanParent.length + 1)
        : indexedParent;
      if (!rest) continue;
      const slash = rest.indexOf("/");
      folderNames.add(slash > 0 ? rest.slice(0, slash) : rest);
    }
    const folders = [...folderNames].map((name) => {
      const fullKey = cleanParent ? `${cleanParent}/${name}` : name;
      return { name, path: "/" + fullKey, fullKey, indexed: true };
    });
    return { folders, files };
  } catch (_) {
    return { folders: [], files: [] };
  }
}
