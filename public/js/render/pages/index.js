import { createShareUtils } from "./admin/utils.js";
import { createAdminComponents } from "./admin/components.js";
import { createOverviewRenderer } from "./admin/overview.js";
import { createLogsRenderer } from "./admin/logs.js";
import { createSettingsRenderer } from "./admin/settings.js";
import { createSharesRenderer } from "./admin/shares.js";
import { createWebhooksRenderer } from "./admin/webhooks.js";

const ADMIN_TABS = [
  { id: "overview", label: "概览" },
  { id: "storage", label: "存储" },
  { id: "shares", label: "分享" },
  { id: "paths", label: "路径" },
  { id: "logs", label: "日志" },
  { id: "maintenance", label: "维护" },
  { id: "system", label: "系统" },
];

export function createPageRenderers(deps) {
  const {
    icons,
    escapeHtml,
    renderEmptyState,
    renderEmptyStateCompact,
    formatBytes,
    formatTime,
    formatRelative,
  } = deps;

  const shareUtils = createShareUtils({ escapeHtml });
  const components = createAdminComponents({ icons, escapeHtml });

  const overview = createOverviewRenderer({
    icons,
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyStateCompact,
    formatBytes,
    formatTime,
    formatRelative,
    components,
  });

  const logs = createLogsRenderer({
    icons,
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyState,
    renderEmptyStateCompact,
    formatTime,
    formatRelative,
    components,
  });

  const settings = createSettingsRenderer({
    icons,
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyState,
    renderEmptyStateCompact,
    formatBytes,
    formatTime,
    formatRelative,
    components,
  });

  const shares = createSharesRenderer({
    icons,
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyState,
    renderEmptyStateCompact,
    formatBytes,
    formatTime,
    formatRelative,
    filterShares: shareUtils.filterShares,
    getFilterLabel: shareUtils.getFilterLabel,
    getShareStatusTags: shareUtils.getShareStatusTags,
    getExpiryStatus: shareUtils.getExpiryStatus,
    isShareActive: shareUtils.isShareActive,
    components,
  });

  const webhooks = createWebhooksRenderer({
    icons,
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyState,
    renderEmptyStateCompact,
    formatRelative,
    components,
  });

  function renderAdminActiveTab(admin, activeTab) {
    switch (activeTab) {
      case "overview":
        if (admin.loading)
          return renderEmptyStateCompact(
            "正在加载概览",
            "正在统计文件数量、索引状态与回收站信息。",
            icons.stats,
          );
        if (admin.error) return overview.renderAdminErrorState(admin.error);
        if (!admin.stats)
          return renderEmptyStateCompact(
            "暂无概览数据",
            "后台接口已接通，但当前还没有可展示的概览结果。",
            icons.stats,
          );
        return overview.renderAdminStatsGrid(admin.stats);
      case "system":
        return settings.renderSystemSection(admin);
      case "storage":
        return settings.renderStorageSection(admin);
      case "logs":
        return logs.renderAdminLogsSection(admin);
      case "paths":
        return settings.renderPathManagementSection(admin);
      case "maintenance":
        return settings.renderAdminMaintenanceSection(admin);
      case "shares":
        return shares.renderAdminSharesSection(admin);
      default:
        return "";
    }
  }

  function renderAdminPage(state) {
    const { role } = state.app;
    const admin = state.admin;
    const activeTab = admin.activeTab || "overview";

    if (role !== "admin") {
      return `
        <div class="header-card flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="text-sm font-bold text-slate-800">管理控制台</span>
          </div>
          <div class="flex items-center gap-2">
            <a class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" href="/">返回云盘</a>
          </div>
        </div>
        <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
          ${renderEmptyStateCompact("需要管理员登录", "登录后即可查看文件统计、索引状态、分享记录和后续管理模块。", icons.lock)}
        </div>
      `;
    }

    return `
      <div class="toolbar-card mb-4 flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
        <div class="admin-tab-bar">
          ${ADMIN_TABS.map(
            (tab) => `
            <button class="admin-tab-btn${activeTab === tab.id ? " admin-tab-active" : ""}"
                    type="button"
                    data-action="set-admin-tab"
                    data-tab="${tab.id}">
              ${tab.label}
            </button>
          `,
          ).join("")}
        </div>
      </div>
      <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
        ${renderAdminActiveTab(admin, activeTab)}
      </div>
    `;
  }

  return {
    renderAdminPage,
    renderSharePage: shares.renderSharePage,
  };
}
