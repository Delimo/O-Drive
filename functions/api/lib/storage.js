import { addLog, formatBytes, jsonResponse, listR2Objects, recordSystemWarning } from './common.js';
import { getFileIndexEntry, getFileIndexStorageId, getIndexedStorageUsed } from './file-index.js';
import { parseCapacityBytes } from './capacity.js';
import { signedS3Request } from './s3-signing.js';

const STORAGE_CONFIG_KEY = 'storage_config_v1';
const DEFAULT_R2_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
const DEFAULT_OVERFLOW_THRESHOLD = 85;

let _kvConfigReady;

async function ensureKvConfig(env) {
  if (_kvConfigReady) return;
  try {
    await env.D1.prepare('CREATE TABLE IF NOT EXISTS kv_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
  } catch (_) {}
  _kvConfigReady = true;
}

function cleanPath(path = '') {
  return String(path || '').trim().replace(/^\/+|\/+$/g, '');
}

function cleanPrefix(prefix = '') {
  const clean = cleanPath(prefix);
  return clean ? `${clean}/` : '';
}

function normalizeStorageId(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function normalizeStorageItem(item = {}) {
  const id = normalizeStorageId(item.id || item.name);
  if (!id || id === 'r2') return null;
  return {
    id,
    name: String(item.name || id).trim().slice(0, 80) || id,
    provider: 's3',
    endpoint: String(item.endpoint || '').trim().replace(/\/+$/g, ''),
    region: String(item.region || 'auto').trim() || 'auto',
    bucket: String(item.bucket || '').trim(),
    accessKeyId: String(item.accessKeyId || '').trim(),
    secretAccessKey: String(item.secretAccessKey || '').trim(),
    prefix: cleanPrefix(item.prefix),
    quotaBytes: parseCapacityBytes(item.quotaBytes, 0),
    enabled: item.enabled !== false,
    overflowTarget: Boolean(item.overflowTarget),
  };
}

function normalizeBinding(item = {}) {
  const path = cleanPath(item.path);
  const storageId = normalizeStorageId(item.storageId || item.storage_id || item.storage);
  if (!path || !storageId) return null;
  return { path, storageId };
}

const _configCacheSymbol = Symbol('storageConfig');

function defaultConfig() {
  return {
    r2QuotaBytes: DEFAULT_R2_QUOTA_BYTES,
    overflowEnabled: true,
    overflowThresholdPercent: DEFAULT_OVERFLOW_THRESHOLD,
    spaces: [],
    bindings: [],
  };
}

export async function loadStorageConfig(env) {
  if (env?.[_configCacheSymbol]) return env[_configCacheSymbol];
  const fallback = defaultConfig();
  if (!env?.D1) return fallback;
  await ensureKvConfig(env);
  try {
    const row = await env.D1.prepare('SELECT value FROM kv_config WHERE key = ?').bind(STORAGE_CONFIG_KEY).first();
    const raw = row?.value ? JSON.parse(row.value) : {};
    const spaces = Array.isArray(raw.spaces) ? raw.spaces.map(normalizeStorageItem).filter(Boolean) : [];
    const storageIds = new Set(['r2', ...spaces.map(item => item.id)]);
    const bindings = (Array.isArray(raw.bindings) ? raw.bindings : [])
      .map(normalizeBinding)
      .filter(item => item && storageIds.has(item.storageId))
      .sort((a, b) => a.path.localeCompare(b.path));
    const config = {
      r2QuotaBytes: parseCapacityBytes(raw.r2QuotaBytes, fallback.r2QuotaBytes),
      overflowEnabled: raw.overflowEnabled !== false,
      overflowThresholdPercent: Math.max(1, Math.min(99, Number(raw.overflowThresholdPercent || fallback.overflowThresholdPercent))),
      spaces,
      bindings,
    };
    env[_configCacheSymbol] = config;
    return config;
  } catch (err) {
    await recordSystemWarning(env, 'storage.config', err?.message || 'Storage config load failed');
    return fallback;
  }
}

export async function saveStorageConfig(env, config) {
  await ensureKvConfig(env);
  const normalized = await normalizeConfigForSave(config);
  await env.D1.prepare('INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)')
    .bind(STORAGE_CONFIG_KEY, JSON.stringify(normalized))
    .run();
  delete env[_configCacheSymbol];
  return normalized;
}

async function normalizeConfigForSave(config = {}) {
  const spaces = (Array.isArray(config.spaces) ? config.spaces : []).map(normalizeStorageItem).filter(Boolean);
  const storageIds = new Set(['r2', ...spaces.map(item => item.id)]);
  const bindings = (Array.isArray(config.bindings) ? config.bindings : [])
    .map(normalizeBinding)
    .filter(item => item && storageIds.has(item.storageId))
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    r2QuotaBytes: parseCapacityBytes(config.r2QuotaBytes, DEFAULT_R2_QUOTA_BYTES),
    overflowEnabled: config.overflowEnabled !== false,
    overflowThresholdPercent: Math.max(1, Math.min(99, Number(config.overflowThresholdPercent || DEFAULT_OVERFLOW_THRESHOLD))),
    spaces,
    bindings,
  };
}

export function publicStorageConfig(config, usage = {}) {
  const r2QuotaBytes = Number(config.r2QuotaBytes || 0);
  const r2UsedBytes = Number(usage.r2UsedBytes || 0);
  const spaceUsage = usage.spaces || {};
  return {
    r2: {
      id: 'r2',
      name: 'Cloudflare R2',
      provider: 'r2',
      quotaBytes: r2QuotaBytes,
      quotaFormatted: r2QuotaBytes ? formatBytes(r2QuotaBytes) : '未设置',
      usedBytes: r2UsedBytes,
      usedFormatted: formatBytes(r2UsedBytes),
      usedPercent: r2QuotaBytes ? Math.round((r2UsedBytes / r2QuotaBytes) * 100) : 0,
    },
    overflowEnabled: Boolean(config.overflowEnabled),
    overflowThresholdPercent: Number(config.overflowThresholdPercent || DEFAULT_OVERFLOW_THRESHOLD),
    spaces: (config.spaces || []).map(item => {
      const quotaBytes = Number(item.quotaBytes || 0);
      const usedBytes = Number(spaceUsage[item.id] || 0);
      return {
        id: item.id,
        name: item.name,
        provider: item.provider,
        endpoint: item.endpoint,
        region: item.region,
        bucket: item.bucket,
        prefix: item.prefix || '',
        quotaBytes,
        quotaFormatted: quotaBytes ? formatBytes(quotaBytes) : '未设置',
        usedBytes,
        usedFormatted: formatBytes(usedBytes),
        usedPercent: quotaBytes ? Math.round((usedBytes / quotaBytes) * 100) : 0,
        enabled: item.enabled !== false,
        overflowTarget: Boolean(item.overflowTarget),
        hasSecret: Boolean(item.accessKeyId && item.secretAccessKey),
      };
    }),
    bindings: config.bindings || [],
  };
}

export async function storageUsage(env) {
  const config = await loadStorageConfig(env);
  const spaces = {};
  for (const space of config.spaces || []) {
    spaces[space.id] = await getIndexedStorageUsed(env, space.id);
  }
  return { r2UsedBytes: await getIndexedStorageUsed(env, 'r2'), spaces };
}

export function storageQuotaForConfig(config, storageId = 'r2') {
  if (storageId === 'r2') {
    return { id: 'r2', name: 'Cloudflare R2', quotaBytes: Number(config.r2QuotaBytes || 0) };
  }
  const space = (config.spaces || []).find(item => item.id === storageId);
  return { id: storageId, name: space?.name || storageId, quotaBytes: Number(space?.quotaBytes || 0) };
}

export async function checkStorageQuota(env, storageId = 'r2', incomingBytes = 0) {
  const config = await loadStorageConfig(env);
  const quota = storageQuotaForConfig(config, storageId);
  const used = await getIndexedStorageUsed(env, storageId);
  const quotaBytes = Number(quota.quotaBytes || 0);
  if (!quotaBytes) return { allowed: true, storageId, storageName: quota.name, used, quota: 0, remaining: Infinity };
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

function bindingMatches(bindingPath, key) {
  const clean = cleanPath(key);
  return clean === bindingPath || clean.startsWith(`${bindingPath}/`);
}

export async function resolveStorageIdForPath(env, key) {
  const config = await loadStorageConfig(env);
  const clean = cleanPath(key);
  let best = { path: '', storageId: 'r2' };
  for (const binding of config.bindings || []) {
    if (bindingMatches(binding.path, clean) && binding.path.length > best.path.length) best = binding;
  }
  return best.storageId || 'r2';
}

export async function resolveExistingStorageId(env, key) {
  const indexed = await getFileIndexStorageId(env, key);
  if (indexed) return indexed;
  try {
    if (await env.R2?.head(key)) return 'r2';
  } catch (_) {}
  return resolveStorageIdForPath(env, key);
}

export async function resolveExistingObjectLocation(env, key) {
  const indexed = await getFileIndexEntry(env, key);
  if (indexed) {
    return {
      path: key,
      storageId: indexed.storage_id || 'r2',
      objectKey: indexed.object_key || indexed.path || key,
      indexed,
    };
  }
  const storageId = await resolveExistingStorageId(env, key);
  return { path: key, storageId, objectKey: key, indexed: null };
}

export async function chooseUploadStorage(env, key, incomingBytes = 0) {
  const config = await loadStorageConfig(env);
  const configuredStorageId = await resolveStorageIdForPath(env, key);
  const r2UsedBytes = await getIndexedStorageUsed(env, 'r2');
  const r2QuotaBytes = Number(config.r2QuotaBytes || 0);
  const usedPercent = r2QuotaBytes ? Math.round((r2UsedBytes / r2QuotaBytes) * 100) : 0;
  const projectedPercent = r2QuotaBytes ? Math.round(((r2UsedBytes + Number(incomingBytes || 0)) / r2QuotaBytes) * 100) : usedPercent;
  const threshold = Number(config.overflowThresholdPercent || DEFAULT_OVERFLOW_THRESHOLD);
  const overflowTarget = (config.spaces || []).find(item => item.enabled !== false && item.overflowTarget)
    || (config.spaces || []).find(item => item.enabled !== false);

  if (configuredStorageId === 'r2' && config.overflowEnabled && r2QuotaBytes > 0 && projectedPercent >= threshold && overflowTarget) {
    return {
      storageId: overflowTarget.id,
      overflowed: true,
      warning: `R2 空间已使用 ${usedPercent}%，本次上传将自动存入 S3 空间：${overflowTarget.name}`,
      r2UsedPercent: usedPercent,
      r2ProjectedPercent: projectedPercent,
    };
  }

  if (configuredStorageId === 'r2' && config.overflowEnabled && r2QuotaBytes > 0 && projectedPercent >= threshold && !overflowTarget) {
    return {
      storageId: 'r2',
      overflowed: false,
      warning: `R2 空间预计达到 ${projectedPercent}%，但还没有配置可用的 S3 溢出空间。`,
      r2UsedPercent: usedPercent,
      r2ProjectedPercent: projectedPercent,
    };
  }

  return { storageId: configuredStorageId, overflowed: false, warning: '', r2UsedPercent: usedPercent, r2ProjectedPercent: projectedPercent };
}

function storageById(config, id) {
  if (!id || id === 'r2') return { id: 'r2', name: 'Cloudflare R2', provider: 'r2' };
  return (config.spaces || []).find(item => item.id === id && item.enabled !== false) || null;
}

export async function getStorageAdapter(env, storageId = 'r2') {
  const config = await loadStorageConfig(env);
  const space = storageById(config, storageId);
  if (!space) throw new Error(`Storage not found: ${storageId}`);
  if (space.provider === 'r2') return { id: 'r2', name: 'Cloudflare R2', bucket: env.R2, provider: 'r2' };
  return { id: space.id, name: space.name, space, provider: 's3' };
}

export async function storageHead(env, storageId, key) {
  const adapter = await getStorageAdapter(env, storageId);
  if (adapter.provider === 'r2') return adapter.bucket.head(key);
  const res = await signedS3Request(adapter.space, 'HEAD', key);
  if (res.status === 404) return null;
  const size = Number(res.headers.get('content-length') || 0);
  const contentType = res.headers.get('content-type') || '';
  return {
    key,
    size,
    uploaded: new Date(res.headers.get('last-modified') || Date.now()),
    httpMetadata: { contentType },
    writeHttpMetadata(headers) {
      if (contentType) headers.set('Content-Type', contentType);
    },
  };
}

export async function storageGet(env, storageId, key, options = {}) {
  const adapter = await getStorageAdapter(env, storageId);
  if (adapter.provider === 'r2') return adapter.bucket.get(key, options);
  const headers = {};
  if (options.range) {
    const offset = Number(options.range.offset || 0);
    const length = Number(options.range.length || 0);
    headers.Range = `bytes=${offset}-${offset + length - 1}`;
  }
  const res = await signedS3Request(adapter.space, 'GET', key, { headers });
  if (res.status === 404) return null;
  const contentType = res.headers.get('content-type') || '';
  return {
    body: res.body,
    size: Number(res.headers.get('content-length') || 0),
    httpMetadata: { contentType },
    writeHttpMetadata(headersOut) {
      if (contentType) headersOut.set('Content-Type', contentType);
    },
  };
}

export async function storagePut(env, storageId, key, body, options = {}) {
  const adapter = await getStorageAdapter(env, storageId);
  if (adapter.provider === 'r2') return adapter.bucket.put(key, body, options);
  const headers = {};
  const contentType = options.httpMetadata?.contentType || options.contentType || '';
  if (contentType) headers['content-type'] = contentType;
  await signedS3Request(adapter.space, 'PUT', key, { body, headers });
  return { key };
}

export async function storageCreateMultipartUpload(env, storageId, key, options = {}) {
  const adapter = await getStorageAdapter(env, storageId);
  if (adapter.provider === 'r2') return adapter.bucket.createMultipartUpload(key, options);
  const headers = {};
  const contentType = options.httpMetadata?.contentType || options.contentType || '';
  if (contentType) headers['content-type'] = contentType;
  const res = await signedS3Request(adapter.space, 'POST', key, { headers, query: '?uploads=' });
  const xml = await res.text();
  const uploadId = decodeXml(xml.match(/<UploadId>([\s\S]*?)<\/UploadId>/)?.[1] || '');
  if (!uploadId) throw new Error('S3 multipart upload id missing');
  return { key, uploadId };
}

export async function storageUploadPart(env, storageId, key, uploadId, partNumber, body) {
  const adapter = await getStorageAdapter(env, storageId);
  if (adapter.provider === 'r2') {
    const upload = adapter.bucket.resumeMultipartUpload(key, uploadId);
    return upload.uploadPart(partNumber, body);
  }
  const query = `?partNumber=${encodeURIComponent(String(partNumber))}&uploadId=${encodeURIComponent(uploadId)}`;
  const res = await signedS3Request(adapter.space, 'PUT', key, { body, query });
  return { partNumber, etag: (res.headers.get('etag') || '').replace(/^"|"$/g, '') };
}

export async function storageCompleteMultipartUpload(env, storageId, key, uploadId, parts = []) {
  const sorted = [...parts].sort((a, b) => Number(a.partNumber) - Number(b.partNumber));
  const adapter = await getStorageAdapter(env, storageId);
  if (adapter.provider === 'r2') {
    const upload = adapter.bucket.resumeMultipartUpload(key, uploadId);
    return upload.complete(sorted);
  }
  const body = `<CompleteMultipartUpload>${sorted.map(part => `<Part><PartNumber>${Number(part.partNumber)}</PartNumber><ETag>${escapeXml(part.etag || part.httpEtag || '')}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
  const res = await signedS3Request(adapter.space, 'POST', key, {
    body,
    headers: { 'content-type': 'application/xml' },
    query: `?uploadId=${encodeURIComponent(uploadId)}`,
  });
  const xml = await res.text();
  return { key, httpEtag: decodeXml(xml.match(/<ETag>([\s\S]*?)<\/ETag>/)?.[1] || '').replace(/^"|"$/g, '') };
}

export async function storageAbortMultipartUpload(env, storageId, key, uploadId) {
  const adapter = await getStorageAdapter(env, storageId);
  if (adapter.provider === 'r2') {
    const upload = adapter.bucket.resumeMultipartUpload(key, uploadId);
    return upload.abort();
  }
  await signedS3Request(adapter.space, 'DELETE', key, { query: `?uploadId=${encodeURIComponent(uploadId)}` });
}

export async function storageDelete(env, storageId, key) {
  const adapter = await getStorageAdapter(env, storageId);
  if (adapter.provider === 'r2') return adapter.bucket.delete(key);
  await signedS3Request(adapter.space, 'DELETE', key);
}

export async function storageList(env, storageId, options = {}, extra = {}) {
  const adapter = await getStorageAdapter(env, storageId);
  if (adapter.provider === 'r2') return listR2Objects(adapter.bucket, options, extra);
  const prefix = `${adapter.space.prefix || ''}${options.prefix || ''}`;
  const params = new URLSearchParams();
  if (prefix) params.set('prefix', prefix);
  if (options.delimiter) params.set('delimiter', options.delimiter);
  if (options.cursor) params.set('continuation-token', options.cursor);
  params.set('list-type', '2');
  params.set('max-keys', String(Math.min(Number(options.limit || extra.maxObjects || 1000), 1000)));
  const res = await signedS3Request(adapter.space, 'GET', '', { query: `?${params.toString()}` });
  const xml = await res.text();
  const stripPrefix = value => value.startsWith(adapter.space.prefix || '') ? value.slice((adapter.space.prefix || '').length) : value;
  const objects = [...xml.matchAll(/<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<LastModified>([\s\S]*?)<\/LastModified>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g)]
    .map(match => ({ key: stripPrefix(decodeXml(match[1])), uploaded: new Date(match[2]), size: Number(match[3]) }));
  const delimitedPrefixes = [...xml.matchAll(/<CommonPrefixes>[\s\S]*?<Prefix>([\s\S]*?)<\/Prefix>[\s\S]*?<\/CommonPrefixes>/g)]
    .map(match => stripPrefix(decodeXml(match[1])));
  const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml);
  const token = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] || '';
  return { objects, delimitedPrefixes, truncated, cursor: token ? decodeXml(token) : undefined };
}

function decodeXml(value = '') {
  return String(value).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function escapeXml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export async function listConfiguredStorages(env) {
  const config = await loadStorageConfig(env);
  const usage = await storageUsage(env);
  return publicStorageConfig(config, usage);
}

function mergeSpaceSecretForTest(current, item = {}) {
  const id = normalizeStorageId(item.id || item.name);
  const prior = (current.spaces || []).find(space => space.id === id);
  return normalizeStorageItem({
    ...item,
    accessKeyId: item.accessKeyId || prior?.accessKeyId || '',
    secretAccessKey: item.secretAccessKey || prior?.secretAccessKey || '',
  });
}

export async function testS3StorageSpace(space) {
  const normalized = normalizeStorageItem(space);
  if (!normalized) return { success: false, message: 'Invalid S3 space config' };
  const missing = ['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'].filter(key => !normalized[key]);
  if (missing.length) {
    return { success: false, message: `Missing required fields: ${missing.join(', ')}` };
  }
  const started = Date.now();
  try {
    const params = new URLSearchParams({ 'list-type': '2', 'max-keys': '1' });
    const res = await signedS3Request(normalized, 'GET', '', { query: `?${params.toString()}` });
    const text = await res.text();
    return {
      success: true,
      status: res.status,
      durationMs: Date.now() - started,
      bucket: normalized.bucket,
      endpoint: normalized.endpoint,
      canList: /<ListBucketResult/i.test(text) || res.ok,
      message: `连接成功：${normalized.bucket}`,
    };
  } catch (err) {
    return {
      success: false,
      durationMs: Date.now() - started,
      bucket: normalized.bucket,
      endpoint: normalized.endpoint,
      message: err?.message || 'S3 connection test failed',
    };
  }
}

export async function handleAdminStorage(env, request, method) {
  if (method === 'GET') return jsonResponse(await listConfiguredStorages(env));
  if (method === 'PUT') {
    const body = await request.json().catch(() => ({}));
    const current = await loadStorageConfig(env);
    const currentById = new Map((current.spaces || []).map(item => [item.id, item]));
    const nextSpaces = (Array.isArray(body.spaces) ? body.spaces : []).map(item => {
      const prior = currentById.get(normalizeStorageId(item.id || item.name));
      return {
        ...item,
        accessKeyId: item.accessKeyId || prior?.accessKeyId || '',
        secretAccessKey: item.secretAccessKey || prior?.secretAccessKey || '',
      };
    });
    const saved = await saveStorageConfig(env, { ...body, spaces: nextSpaces });
    await addLog(env, request, 'STORAGE_SETTINGS', `保存存储空间配置，S3 ${saved.spaces.length} 个，绑定 ${saved.bindings.length} 条`);
    return jsonResponse({ success: true, ...publicStorageConfig(saved, await storageUsage(env)) });
  }
  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}

export async function handleAdminStorageTest(env, request) {
  const body = await request.json().catch(() => ({}));
  const current = await loadStorageConfig(env);
  const space = mergeSpaceSecretForTest(current, body.space || body);
  const result = await testS3StorageSpace(space);
  await addLog(env, request, 'STORAGE_TEST', `${result.success ? '成功' : '失败'}：${space?.name || space?.id || 'S3'}`);
  return jsonResponse(result, result.success ? 200 : 502);
}
