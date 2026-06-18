/**
 * @fileoverview Storage quota management.
 * Allows admins to set a total storage limit and check current usage.
 * Enforced before upload operations.
 *
 * Configuration stored in kv_config table:
 *   key: 'storage_quota_bytes'
 *   value: number (0 = unlimited)
 */

import { formatBytes } from './common.js';
import { indexedFileCount, syncFileIndexFromR2 } from './file-index.js';

const QUOTA_CONFIG_KEY = 'storage_quota_bytes';

/**
 * Get the configured storage quota in bytes.
 * @param {object} db - D1 database
 * @returns {Promise<number>} Quota bytes (0 = unlimited)
 */
export async function getStorageQuota(db) {
  try {
    const row = await db.prepare('SELECT value FROM kv_config WHERE key = ?').bind(QUOTA_CONFIG_KEY).first();
    return row ? Math.max(0, Number(row.value) || 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * Set the storage quota.
 * @param {object} db - D1 database
 * @param {number} bytes - New quota (0 = unlimited)
 */
export async function setStorageQuota(db, bytes) {
  const val = Math.max(0, Math.floor(bytes));
  await db.prepare('INSERT OR REPLACE INTO kv_config (key, value) VALUES (?, ?)').bind(QUOTA_CONFIG_KEY, String(val)).run();
}

/**
 * Get current storage usage from the file index.
 * @param {object} db - D1 database
 * @returns {Promise<number>} Used bytes
 */
export async function getStorageUsed(db) {
  try {
    const row = await db.prepare(
      'SELECT COALESCE(SUM(size), 0) AS total FROM (SELECT storage_id, COALESCE(NULLIF(object_key, \'\'), path) AS object_key, MAX(size) AS size FROM file_index GROUP BY storage_id, COALESCE(NULLIF(object_key, \'\'), path))'
    ).first();
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

/**
 * Check if a new upload would exceed the quota.
 * @param {object} db - D1 database
 * @param {number} incomingBytes - Size of file(s) to upload
 * @returns {Promise<{allowed: boolean, used: number, quota: number, remaining: number}>}
 */
export async function checkQuota(target, incomingBytes = 0) {
  const db = target?.D1 || target;
  let syncedIndex = false;
  let indexTruncated = false;
  const quota = await getStorageQuota(db);
  if (quota && target?.D1 && target?.R2 && (await indexedFileCount(target)) === 0) {
    const sync = await syncFileIndexFromR2(target, { maxObjects: 50000 });
    syncedIndex = true;
    indexTruncated = Boolean(sync.truncated);
  }
  const used = await getStorageUsed(db);
  if (!quota) return { allowed: true, used, quota: 0, remaining: Infinity };
  const remaining = Math.max(0, quota - used);
  return {
    allowed: incomingBytes <= remaining,
    used,
    quota,
    remaining,
    syncedIndex,
    indexTruncated,
  };
}


