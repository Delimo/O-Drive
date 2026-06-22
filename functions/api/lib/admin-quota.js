import { addLog, formatBytes as formatQuotaBytes, jsonResponse } from './common.js';
import { getStorageQuota, setStorageQuota, getStorageUsed } from './storage-quota.js';
import { parseCapacityBytes } from './capacity.js';

export async function handleAdminQuota(env, request, method) {
  if (method === 'GET') {
    const [quota, used] = await Promise.all([getStorageQuota(env.D1), getStorageUsed(env.D1)]);
    return jsonResponse({ quota, used, remaining: quota ? Math.max(0, quota - used) : Infinity, quotaFormatted: quota ? formatQuotaBytes(quota) : '无限制', usedFormatted: formatQuotaBytes(used) });
  }
  if (method === 'PUT') {
    const { bytes } = await request.json().catch(() => ({}));
    const nextBytes = parseCapacityBytes(bytes);
    await setStorageQuota(env.D1, nextBytes);
    await addLog(env, request, 'QUOTA', nextBytes > 0 ? `设置存储配额为 ${formatQuotaBytes(nextBytes)}` : '取消存储配额限制');
    return jsonResponse({ success: true });
  }
  return jsonResponse({ message: 'Method Not Allowed' }, 405);
}
