import {
  addLog,
  formatBytes as formatQuotaBytes,
  jsonResponse,
} from "./common/index.js";
import { parseCapacityBytes } from "./capacity.js";
import {
  loadStorageConfig,
  publicStorageConfig,
  saveStorageConfig,
  storageUsage,
} from "./storage.js";

export async function handleAdminQuota(env, request, method) {
  if (method === "GET") {
    const config = await loadStorageConfig(env);
    const usage = await storageUsage(env);
    const storageConfig = publicStorageConfig(config, usage);
    const quota = Number(storageConfig.r2?.quotaBytes || 0);
    const used = Number(storageConfig.r2?.usedBytes || 0);
    return jsonResponse({
      quota,
      used,
      remaining: quota ? Math.max(0, quota - used) : Infinity,
      quotaFormatted: quota ? formatQuotaBytes(quota) : "无限制",
      usedFormatted: formatQuotaBytes(used),
      storageConfig,
    });
  }
  if (method === "PUT") {
    const { bytes } = await request.json().catch(() => ({}));
    const nextBytes = parseCapacityBytes(bytes);
    const current = await loadStorageConfig(env);
    await saveStorageConfig(env, { ...current, r2QuotaBytes: nextBytes });
    await addLog(
      env,
      request,
      "QUOTA",
      nextBytes > 0
        ? `设置存储配额为 ${formatQuotaBytes(nextBytes)}`
        : "取消存储配额限制",
    );
    return jsonResponse({ success: true });
  }
  return jsonResponse({ message: "Method Not Allowed" }, 405);
}
