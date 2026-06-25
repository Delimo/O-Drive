import { createShareUtils } from "./admin/utils.js";
import { createAdminComponents } from "./admin/components.js";
import { createOverviewRenderer } from "./admin/overview.js";
import { createLogsRenderer } from "./admin/logs.js";
import { createStorageRenderer } from "./admin/storage.js";
import { createSharesRenderer } from "./admin/shares.js";
import { createSystemRenderer } from "./admin/system.js";
import { createWebhookRenderer } from "./admin/webhook.js";

const ADMIN_TABS = [
  { id: "overview", label: "概览" },
  { id: "storage", label: "存储" },
  { id: "shares", label: "分享" },
  { id: "logs", label: "日志" },
  { id: "system", label: "系统" },
  { id: "webhook", label: "Webhooks" },
];

export function createPageRenderers(deps) {
  const {
    escapeHtml,
    renderEmptyState,
    renderEmptyStateCompact,
    formatBytes,
    formatTime,
    formatRelative,
  } = deps;

  const shareUtils = createShareUtils({ escapeHtml });
  const components = createAdminComponents({ escapeHtml });

  const overview = createOverviewRenderer({
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyStateCompact,
    formatBytes,
    formatTime,
    formatRelative,
    components,
  });

  const logs = createLogsRenderer({
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyState,
    renderEmptyStateCompact,
    formatTime,
    formatRelative,
    components,
  });

  const storage = createStorageRenderer({
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyStateCompact,
    formatBytes,
    formatTime,
    components,
  });

  const shares = createSharesRenderer({
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

  const system = createSystemRenderer({
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyState,
    renderEmptyStateCompact,
    formatTime,
    formatRelative,
    components,
  });

  const webhook = createWebhookRenderer({
    safeText: shareUtils.safeText,
    escapeHtml,
    renderEmptyStateCompact,
    components,
  });

  function renderAdminActiveTab(admin, activeTab) {
    switch (activeTab) {
      case "overview":
        if (admin.loading)
          return renderEmptyStateCompact(
            "正在加载概览",
            admin.statsLoadingHint || "正在统计文件数量、索引状态与回收站信息。",
          );
        if (admin.error) return overview.renderAdminErrorState(admin.error);
        if (!admin.stats)
          return renderEmptyStateCompact(
            "暂无概览数据",
            "后台接口已接通，但当前还没有可展示的概览结果。",
          );
        return overview.renderAdminStatsGrid(admin.stats);
      case "storage":
        return storage.renderStorageSection(admin);
      case "shares":
        return shares.renderAdminSharesSection(admin);
      case "logs":
        return logs.renderAdminLogsSection(admin);
      case "system":
        return system.renderSystemSection(admin);
      case "webhook":
        return webhook.renderWebhookSection(admin);
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
        <div class="toolbar-card mb-4 flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
          <div class="admin-tab-bar">
            ${ADMIN_TABS.map(
              (tab) => `
              <button class="admin-tab-btn" type="button" disabled>
                ${tab.label}
              </button>
            `,
            ).join("")}
          </div>
        </div>
        <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
          ${renderEmptyStateCompact("需要管理员登录", "登录后即可查看文件统计、索引状态、分享记录和后续管理模块。")}
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
    bindCustomSelects: components.bindCustomSelects,
    bindCustomDatePickers: components.bindCustomDatePickers,
  };
}
