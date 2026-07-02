export const MAINTENANCE_ACTIONS = [
  { action: "rebuild-index", label: "同步元数据库索引", desc: "对齐元数据库数据状态。", danger: false },
  { action: "clear-cache", label: "清理缓存数据库", desc: "强制刷洗 Redis 本地暂存层。", danger: false },
  { action: "purge-trash", label: "同步清除废弃文件", desc: "物理清除已过期回收站数据。", danger: true },
  { action: "cleanup-logs", label: "清理旧操作日志", desc: "按 90 天/最近 2000 条保留策略清理审计日志。", danger: true },
  { action: "cleanup-zip-task-results", label: "清理 ZIP 结果", desc: "删除 .system/zip-tasks 下的后台打包结果。", danger: true },
  { action: "rebuild-storage-refs", label: "重建对象引用计数", desc: "重新计算 storage_objects.ref_count。", danger: false },
  { action: "cleanup-orphan-storage-objects", label: "清理孤儿存储对象", desc: "删除引用计数为 0 的 storage_objects。", danger: true }
];

export function createShareUtils({ escapeHtml }) {
  function safeText(value, fallback = "-") {
    const text = String(value ?? "").trim();
    return escapeHtml(text || fallback);
  }

  function renderInfoBlock(label, value) {
    return `
      <div class="detail-card">
        <div class="detail-key">${escapeHtml(label)}</div>
        <div class="detail-value">${value}</div>
      </div>
    `;
  }

  function renderShareMetaLine(label, value) {
    return `<span><strong>${escapeHtml(label)}:</strong> ${value}</span>`;
  }

  function getExpiryStatus(expiresAt) {
    if (!expiresAt)
      return {
        level: "unlimited",
        label: "不限期",
        className: "tag-unlimited",
      };
    const now = Date.now();
    const diff = expiresAt - now;
    if (diff <= 0)
      return { level: "expired", label: "已过期", className: "tag-expired" };
    const day = 86400000;
    if (diff <= 3 * day)
      return {
        level: "soon",
        label: `${Math.ceil(diff / day)} 天后到期`,
        className: "tag-soon",
      };
    return { level: "active", label: "有效", className: "tag-active" };
  }

  function isShareActive(item) {
    return !item?.expired && !item?.exhausted;
  }

  function getShareStatusTags(item) {
    const tags = [];
    const isActive = isShareActive(item);
    const expiry = getExpiryStatus(item?.expiresAt);
    if (isActive) {
      tags.push({ label: "有效", className: "tag-active" });
    } else if (item?.expired) {
      tags.push({ label: "已过期", className: "tag-expired" });
    } else if (item?.exhausted) {
      tags.push({ label: "次数用尽", className: "tag-exhausted" });
    } else {
      tags.push({ label: expiry.label, className: expiry.className });
    }
    if (item?.hasPassword)
      tags.push({ label: "有密码", className: "tag-password" });
    if (item?.allowPreview)
      tags.push({ label: "可预览", className: "tag-preview" });
    else tags.push({ label: "禁止预览", className: "tag-no-preview" });
    if (item?.allowDownload)
      tags.push({ label: "可下载", className: "tag-download" });
    else tags.push({ label: "禁止下载", className: "tag-no-download" });
    return tags;
  }

  function filterShares(shares, filter) {
    if (filter === "all") return shares;
    return shares.filter((item) => {
      if (!item) return false;
      switch (filter) {
        case "active":
          return isShareActive(item);
        case "expired":
          return item.expired;
        case "exhausted":
          return item.exhausted;
        case "password":
          return item.hasPassword;
        case "preview":
          return item.allowPreview;
        case "download":
          return item.allowDownload;
        default:
          return true;
      }
    });
  }

  function getFilterLabel(filter) {
    const labels = {
      all: "全部",
      active: "有效",
      expired: "已过期",
      exhausted: "次数用尽",
      password: "有密码",
      preview: "可预览",
      download: "可下载",
    };
    return labels[filter] || filter;
  }

  function getShareFilterOptions(shares) {
    return [
      { value: "all", label: "全部", count: shares.length },
      {
        value: "active",
        label: "有效",
        count: shares.filter((item) => isShareActive(item)).length,
      },
      {
        value: "expired",
        label: "已过期",
        count: shares.filter((item) => item?.expired).length,
      },
      {
        value: "exhausted",
        label: "次数用尽",
        count: shares.filter((item) => item?.exhausted).length,
      },
      {
        value: "password",
        label: "有密码",
        count: shares.filter((item) => item?.hasPassword).length,
      },
      {
        value: "preview",
        label: "可预览",
        count: shares.filter((item) => item?.allowPreview).length,
      },
      {
        value: "download",
        label: "可下载",
        count: shares.filter((item) => item?.allowDownload).length,
      },
    ];
  }

  return {
    safeText,
    renderInfoBlock,
    renderShareMetaLine,
    getExpiryStatus,
    isShareActive,
    getShareStatusTags,
    filterShares,
    getFilterLabel,
    getShareFilterOptions,
  };
}
