import {
  addLog,
  formatBytes,
  jsonResponse,
  listR2Objects,
} from "./common/index.js";
import {
  getFileIndexEntry,
  getFileIndexStorageId,
  getIndexedStorageUsed,
} from "./file-index/index.js";
import { parseCapacityBytes } from "./capacity.js";

const STORAGE_CONFIG_KEY = "storage_config_v1";
const DEFAULT_R2_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
const DEFAULT_R2_ALERT_WARNING_PERCENT = 90;
const DEFAULT_R2_ALERT_ERROR_PERCENT = 95;

let _kvConfigReady;

async function ensureKvConfig(env) {
  if (_kvConfigReady) return;
  try {
    await env.D1.prepare(
      "CREATE TABLE IF NOT EXISTS kv_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    ).run();
  } catch (_) {}
  _kvConfigReady = true;
}

function defaultConfig() {
  return {
    r2QuotaBytes: DEFAULT_R2_QUOTA_BYTES,
    r2AlertEnabled: true,
    r2AlertWarningPercent: DEFAULT_R2_ALERT_WARNING_PERCENT,
    r2AlertErrorPercent: DEFAULT_R2_ALERT_ERROR_PERCENT,
  };
}

function parseAlertPercent(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(1, Math.round(parsed)));
}

function normalizeStorageConfig(config = {}, fallback = defaultConfig()) {
  const warningPercent = parseAlertPercent(
    config.r2AlertWarningPercent,
    fallback.r2AlertWarningPercent,
  );
  const errorPercent = parseAlertPercent(
    config.r2AlertErrorPercent,
    fallback.r2AlertErrorPercent,
  );
  return {
    r2QuotaBytes: parseCapacityBytes(
      config.r2QuotaBytes,
      fallback.r2QuotaBytes,
    ),
    r2AlertEnabled: config.r2AlertEnabled !== false,
    r2AlertWarningPercent: warningPercent,
    r2AlertErrorPercent: Math.max(warningPercent, errorPercent),
  };
}

const _configCacheSymbol = Symbol("storageConfig");

export async function loadStorageConfig(env) {
  if (env?.[_configCacheSymbol]) return env[_configCacheSymbol];
  const fallback = defaultConfig();
  if (!env?.D1) return fallback;
  await ensureKvConfig(env);
  try {
    const row = await env.D1.prepare(
      "SELECT value FROM kv_config WHERE key = ?",
    )
      .bind(STORAGE_CONFIG_KEY)
      .first();
    const raw = row?.value ? JSON.parse(row.value) : {};
    const config = normalizeStorageConfig(raw, fallback);
    env[_configCacheSymbol] = config;
    return config;
  } catch (_) {
    return fallback;
  }
}

export async function saveStorageConfig(env, config) {
  await ensureKvConfig(env);
  const normalized = normalizeStorageConfig(config);
  await env.D1.prepare(
    "INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)",
  )
    .bind(STORAGE_CONFIG_KEY, JSON.stringify(normalized))
    .run();
  delete env[_configCacheSymbol];
  return normalized;
}

export function publicStorageConfig(config, usage = {}) {
  const r2QuotaBytes = Number(config.r2QuotaBytes || 0);
  const r2UsedBytes = Number(usage.r2UsedBytes || 0);
  const r2AlertEnabled = config.r2AlertEnabled !== false;
  const r2AlertWarningPercent = parseAlertPercent(
    config.r2AlertWarningPercent,
    DEFAULT_R2_ALERT_WARNING_PERCENT,
  );
  const r2AlertErrorPercent = Math.max(
    r2AlertWarningPercent,
    parseAlertPercent(
      config.r2AlertErrorPercent,
      DEFAULT_R2_ALERT_ERROR_PERCENT,
    ),
  );
  return {
    r2QuotaBytes,
    r2AlertEnabled,
    r2AlertWarningPercent,
    r2AlertErrorPercent,
    r2: {
      id: "r2",
      name: "Cloudflare R2",
      provider: "r2",
      quotaBytes: r2QuotaBytes,
      quotaFormatted: r2QuotaBytes ? formatBytes(r2QuotaBytes) : "未设置",
      usedBytes: r2UsedBytes,
      usedFormatted: formatBytes(r2UsedBytes),
      usedPercent: r2QuotaBytes
        ? Math.round((r2UsedBytes / r2QuotaBytes) * 100)
        : 0,
      alertEnabled: r2AlertEnabled,
      alertWarningPercent: r2AlertWarningPercent,
      alertErrorPercent: r2AlertErrorPercent,
    },
  };
}

export async function storageUsage(env) {
  const r2UsedBytes = await getIndexedStorageUsed(env, "r2");
  return { r2UsedBytes };
}

export function storageQuotaForConfig(config, storageId = "r2") {
  return {
    id: "r2",
    name: "Cloudflare R2",
    quotaBytes: Number(config.r2QuotaBytes || 0),
    alertEnabled: config.r2AlertEnabled !== false,
    alertWarningPercent: parseAlertPercent(
      config.r2AlertWarningPercent,
      DEFAULT_R2_ALERT_WARNING_PERCENT,
    ),
    alertErrorPercent: parseAlertPercent(
      config.r2AlertErrorPercent,
      DEFAULT_R2_ALERT_ERROR_PERCENT,
    ),
  };
}

export async function checkStorageQuota(
  env,
  storageId = "r2",
  incomingBytes = 0,
) {
  const config = await loadStorageConfig(env);
  const quota = storageQuotaForConfig(config, storageId);
  const used = await getIndexedStorageUsed(env, storageId);
  const quotaBytes = Number(quota.quotaBytes || 0);
  if (!quotaBytes)
    return {
      allowed: true,
      storageId,
      storageName: quota.name,
      used,
      quota: 0,
      remaining: Infinity,
    };
  const remaining = Math.max(0, quotaBytes - used);
  return {
    allowed: Number(incomingBytes || 0) <= remaining,
    storageId,
    storageName: quota.name,
    used,
    quota: quotaBytes,
    remaining,
  };
}

export async function resolveStorageIdForPath(env, key) {
  return "r2";
}

export async function resolveExistingStorageId(env, key) {
  const indexed = await getFileIndexStorageId(env, key);
  return indexed || "r2";
}

export async function resolveExistingObjectLocation(env, key) {
  const indexed = await getFileIndexEntry(env, key);
  if (indexed) {
    return {
      path: key,
      storageId: indexed.storage_id || "r2",
      objectKey: indexed.object_key || indexed.path || key,
      indexed,
    };
  }
  return { path: key, storageId: "r2", objectKey: key, indexed: null };
}

export async function storageHead(env, storageId, key) {
  return env.R2?.head(key) || null;
}

export async function storageGet(env, storageId, key, options = {}) {
  return env.R2?.get(key, options) || null;
}

export async function storagePut(env, storageId, key, body, options = {}) {
  await env.R2.put(key, body, options);
  return { key };
}

export async function storageCreateMultipartUpload(
  env,
  storageId,
  key,
  options = {},
) {
  return env.R2.createMultipartUpload(key, options);
}

export async function storageUploadPart(
  env,
  storageId,
  key,
  uploadId,
  partNumber,
  body,
) {
  const upload = env.R2.resumeMultipartUpload(key, uploadId);
  return upload.uploadPart(partNumber, body);
}

export async function storageCompleteMultipartUpload(
  env,
  storageId,
  key,
  uploadId,
  parts = [],
) {
  const sorted = [...parts].sort(
    (a, b) => Number(a.partNumber) - Number(b.partNumber),
  );
  const upload = env.R2.resumeMultipartUpload(key, uploadId);
  return upload.complete(sorted);
}

export async function storageAbortMultipartUpload(
  env,
  storageId,
  key,
  uploadId,
) {
  const upload = env.R2.resumeMultipartUpload(key, uploadId);
  return upload.abort();
}

export async function storageDelete(env, storageId, key) {
  return env.R2.delete(key);
}

export async function storageCopy(
  env,
  sourceStorageId,
  sourceKey,
  destStorageId,
  destKey,
  options = {},
) {
  if (typeof env.R2.copy === "function") {
    await env.R2.copy(sourceKey, destKey, options);
    return true;
  }
  const source = await storageGet(env, sourceStorageId, sourceKey);
  if (!source) return false;
  await storagePut(env, destStorageId, destKey, source.body, {
    ...options,
    httpMetadata: options.httpMetadata || source.httpMetadata,
    customMetadata: options.customMetadata || source.customMetadata,
  });
  return true;
}

export async function storageList(env, storageId, options = {}, extra = {}) {
  return listR2Objects(env.R2, options, extra);
}

export async function listConfiguredStorages(env) {
  const config = await loadStorageConfig(env);
  const usage = await storageUsage(env);
  return publicStorageConfig(config, usage);
}

export async function handleAdminStorage(env, request, method) {
  if (method === "GET") return jsonResponse(await listConfiguredStorages(env));
  if (method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const saved = await saveStorageConfig(env, body);
    await addLog(env, request, "STORAGE_SETTINGS", `保存 R2 存储配额`);
    return jsonResponse({
      success: true,
      ...publicStorageConfig(saved, await storageUsage(env)),
    });
  }
  return jsonResponse({ message: "Method Not Allowed" }, 405);
}
