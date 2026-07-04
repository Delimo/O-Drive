import {
  ensureCoreTables,
  isReservedKey,
  listR2Objects,
} from "./common/index.js";
import {
  countObjectRefs,
  ensureFileIndexTable,
} from "./file-index/index.js";
import { ensureStorageObjectsTable } from "./storage-objects.js";
import { ensureTrashTable } from "./trash/schema.js";

const SAMPLE_LIMIT = 5;
const R2_SCAN_LIMIT = 5000;
const R2_HEAD_LIMIT = 1000;
const INDEX_CONSISTENCY_REPORT_KEY = "index_consistency_latest";

function makeCategory(label, recommendation) {
  return { label, recommendation, count: 0, samples: [] };
}

function addIssue(category, sample = {}) {
  category.count += 1;
  if (category.samples.length < SAMPLE_LIMIT) category.samples.push(sample);
}

function refKey(storageId = "r2", objectKey = "") {
  return `${storageId || "r2"}\0${objectKey || ""}`;
}

async function allRows(env, sql) {
  try {
    const result = await env.D1.prepare(sql).all();
    return result.results || [];
  } catch (_) {
    return [];
  }
}

export async function scanIndexConsistency(env, options = {}) {
  await ensureFileIndexTable(env);
  await ensureStorageObjectsTable(env);
  await ensureTrashTable(env).catch(() => {});

  const r2ScanLimit = Number(options.r2ScanLimit || R2_SCAN_LIMIT);
  const r2HeadLimit = Number(options.r2HeadLimit || R2_HEAD_LIMIT);
  const issues = {
    invalidFileIndexObjectKeys: makeCategory(
      "索引对象键异常",
      "检查 file_index.object_key 是否为空，必要时重建文件索引。",
    ),
    reservedFileIndexPaths: makeCategory(
      "系统保留路径误引用",
      "确认用户路径没有指向 .system、.thumbs、.trash 或 objects 等内部区域。",
    ),
    brokenFileIndexRefs: makeCategory(
      "文件索引断链",
      "确认 R2 对象是否存在；若是历史迁移问题，可重新上传或重建索引。",
    ),
    brokenTrashRefs: makeCategory(
      "回收站引用断链",
      "检查回收站条目是否仍能指向真实对象，必要时清理异常回收站记录。",
    ),
    storageRefMismatches: makeCategory(
      "对象引用计数不一致",
      "运行“重建对象引用计数”以按 file_index 和 trash_entries 重新计算。",
    ),
    zeroRefStorageObjects: makeCategory(
      "零引用存储对象",
      "确认后可通过高级维护清理孤儿存储对象。",
    ),
    missingStorageObjectRefs: makeCategory(
      "存储对象断链",
      "storage_objects 指向的 R2 对象不存在，需要核对上传或迁移记录。",
    ),
    unreferencedR2Objects: makeCategory(
      "未引用 R2 对象",
      "这些可见 R2 对象没有 file_index 或回收站引用；默认不要自动删除。",
    ),
  };

  const [fileRows, trashRows, storageRows] = await Promise.all([
    allRows(env, "SELECT * FROM file_index ORDER BY path ASC"),
    allRows(env, "SELECT * FROM trash_entries ORDER BY path ASC"),
    allRows(env, "SELECT * FROM storage_objects ORDER BY object_key ASC"),
  ]);

  const referencedObjects = new Set();
  const r2HeadCache = new Map();
  let headChecks = 0;
  let headTruncated = false;

  async function objectExists(storageId, objectKey) {
    if ((storageId || "r2") !== "r2" || !objectKey) return true;
    if (r2HeadCache.has(objectKey)) return r2HeadCache.get(objectKey);
    if (headChecks >= r2HeadLimit) {
      headTruncated = true;
      return true;
    }
    headChecks += 1;
    const exists = Boolean(await env.R2.head(objectKey).catch(() => null));
    r2HeadCache.set(objectKey, exists);
    return exists;
  }

  for (const row of fileRows) {
    const storageId = row.storage_id || "r2";
    const objectKey = row.object_key || "";
    if (!objectKey) {
      addIssue(issues.invalidFileIndexObjectKeys, {
        path: row.path || "",
        objectKey,
      });
      continue;
    }
    referencedObjects.add(refKey(storageId, objectKey));
    if (isReservedKey(row.path)) {
      addIssue(issues.reservedFileIndexPaths, {
        path: row.path || "",
        objectKey,
      });
    }
    if (!(await objectExists(storageId, objectKey))) {
      addIssue(issues.brokenFileIndexRefs, {
        path: row.path || "",
        objectKey,
      });
    }
  }

  for (const row of trashRows) {
    const storageId = row.storage_id || "r2";
    const objectKey = row.object_key || "";
    if (!objectKey) continue;
    referencedObjects.add(refKey(storageId, objectKey));
    if (!(await objectExists(storageId, objectKey))) {
      addIssue(issues.brokenTrashRefs, {
        path: row.path || "",
        objectKey,
      });
    }
  }

  for (const row of storageRows) {
    const storageId = row.storage_id || "r2";
    const objectKey = row.object_key || "";
    if (!objectKey) continue;
    const expected = await countObjectRefs(env, storageId, objectKey);
    const recorded = Number(row.ref_count || 0);
    if (recorded !== expected) {
      addIssue(issues.storageRefMismatches, {
        objectKey,
        recorded,
        expected,
      });
    }
    if (expected <= 0) {
      addIssue(issues.zeroRefStorageObjects, {
        objectKey,
        recorded,
        expected,
      });
    }
    if (!(await objectExists(storageId, objectKey))) {
      addIssue(issues.missingStorageObjectRefs, {
        objectKey,
        recorded,
        expected,
      });
    }
  }

  const r2Listed = await listR2Objects(
    env.R2,
    {},
    { maxObjects: r2ScanLimit },
  ).catch(() => ({ objects: [], truncated: false }));
  for (const object of r2Listed.objects || []) {
    const key = object.key || "";
    if (!key || key.endsWith("/.folder") || isReservedKey(key)) continue;
    if (!referencedObjects.has(refKey("r2", key))) {
      addIssue(issues.unreferencedR2Objects, {
        objectKey: key,
        size: Number(object.size || 0),
      });
    }
  }

  const categories = Object.fromEntries(
    Object.entries(issues).map(([key, value]) => [key, value]),
  );
  const issueCount = Object.values(categories).reduce(
    (sum, item) => sum + Number(item.count || 0),
    0,
  );
  const truncated = Boolean(r2Listed.truncated || headTruncated);

  return {
    scannedAt: Date.now(),
    status: issueCount ? "warning" : "ok",
    issueCount,
    truncated,
    limits: {
      r2ScanLimit,
      r2HeadLimit,
      sampleLimit: SAMPLE_LIMIT,
    },
    scanned: {
      fileIndexRows: fileRows.length,
      trashEntries: trashRows.length,
      storageObjects: storageRows.length,
      r2Objects: (r2Listed.objects || []).length,
      r2HeadChecks: headChecks,
    },
    categories,
  };
}

export async function loadLatestIndexConsistencyReport(env) {
  if (!env?.D1) return null;
  await ensureCoreTables(env);
  try {
    const row = await env.D1.prepare(
      "SELECT value FROM kv_config WHERE key = ?",
    )
      .bind(INDEX_CONSISTENCY_REPORT_KEY)
      .first();
    if (!row?.value) return null;
    return JSON.parse(row.value);
  } catch (_) {
    return null;
  }
}

export async function saveLatestIndexConsistencyReport(env, report) {
  if (!env?.D1 || !report) return report;
  await ensureCoreTables(env);
  const compact = {
    ...report,
    savedAt: Date.now(),
  };
  await env.D1.prepare(
    "INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)",
  )
    .bind(INDEX_CONSISTENCY_REPORT_KEY, JSON.stringify(compact))
    .run();
  return compact;
}
