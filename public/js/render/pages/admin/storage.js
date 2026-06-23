export function createStorageRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyState,
  renderEmptyStateCompact,
  components,
}) {
  function renderAdminStorageSection(admin) {
    const {
      storageConfig,
      storageConfigLoading,
      storageConfigError,
      storageConfigSaving,
    } = admin;

    if (storageConfigError) {
      return components.renderErrorCard({
        icon: icons.stats,
        error: storageConfigError,
        onRetry: "refresh-admin-storage-config",
      });
    }

    if (storageConfigLoading || !storageConfig) {
      return renderEmptyState("加载中", "正在加载存储空间配置...", icons.stats);
    }

    const r2 = storageConfig.r2 || {};
    const usagePercent = r2.usedPercent || 0;
    const usageBarColor =
      usagePercent >= 90
        ? "var(--danger)"
        : usagePercent >= 75
          ? "var(--warning)"
          : "var(--primary)";

    return `
      <div class="admin-grid">
        <div class="admin-card span-6">
          <div class="mini-stat">
            <div class="mini-stat-label">${escapeHtml(r2.name || "Cloudflare R2")}</div>
            <div class="mini-stat-value">${escapeHtml(r2.usedFormatted || "0")} / ${escapeHtml(r2.quotaFormatted || "未设置")}</div>
            <div style="margin:8px 0;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(usagePercent, 100)}%;background:${usageBarColor};border-radius:3px;transition:width .3s;"></div>
            </div>
            <div class="mini-stat-meta">已用 ${usagePercent}%</div>
          </div>
          <div class="btn-row" style="margin-top:8px;">
            <button class="btn toolbar-btn" type="button" data-action="show-edit-storage-quota" ${storageConfigSaving ? "disabled" : ""}>编辑配额</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderStorageSection(admin) {
    const {
      storageConfig,
      storageConfigLoading,
      storageConfigError,
      storageConfigSaving,
    } = admin;

    if (storageConfigError) {
      return `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(storageConfigError)}</p></div>`;
    }

    if (storageConfigLoading || !storageConfig) {
      return renderEmptyStateCompact(
        "加载中",
        "正在加载存储空间配置...",
        icons.stats,
      );
    }

    const r2 = storageConfig.r2 || {};
    const usagePercent = r2.usedPercent || 0;
    const usageBarColor =
      usagePercent >= 90
        ? "var(--danger)"
        : usagePercent >= 75
          ? "var(--warning)"
          : "var(--primary)";

    const {
      trashRetention,
      trashRetentionLoading,
      trashCleanupBusy,
    } = admin;

    let retentionHtml = "";
    if (trashRetentionLoading) {
      retentionHtml = renderEmptyStateCompact("加载中", "正在获取回收站保留天数...", icons.spinner);
    } else {
      const currentDays = trashRetention?.days ?? 0;
      retentionHtml = `
        <div class="sr-retention-form">
          <div class="sr-retention-input-group">
            <label class="sr-retention-label">保留天数（0 为不自动清理）</label>
            <div class="sr-retention-row">
              <input class="input" type="number" min="0" max="3650" value="${currentDays}" data-binding="trash-retention-days">
              <button class="btn btn-primary" type="button" data-action="save-trash-retention" ${trashCleanupBusy ? "disabled" : ""}>保存设置</button>
            </div>
          </div>
          ${currentDays > 0
            ? `<div class="sr-retention-hint"><span class="badge badge-info">自动清理</span> 超过 ${currentDays} 天的回收站项目将被自动清除</div>`
            : `<div class="sr-retention-hint"><span class="badge badge-warning">未设置</span> 未设置保留天数，不会自动清理</div>`}
        </div>
      `;
    }

    return `
      <div class="ov-page">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title">存储</h2>
            <p class="ov-page-desc">存储空间用量与回收站策略</p>
          </div>
        </div>

        <div class="admin-grid">
          <div class="admin-card span-7">
            <div class="admin-card-header">
              <div class="admin-card-icon" style="background:rgba(14,116,144,0.1);color:#0e7490">${icons.stats}</div>
              <span class="admin-label">${escapeHtml(r2.name || "Cloudflare R2")}</span>
              <span class="sr-status-dot" style="background:${usageBarColor}"></span>
              <span style="font-size:11px;color:var(--muted);margin-left:auto;">已用 ${usagePercent}%</span>
            </div>
            <div class="sr-usage-body">
              <div class="sr-usage-numbers">
                <span class="sr-usage-used">${escapeHtml(r2.usedFormatted || "0")}</span>
                <span class="sr-usage-sep">/</span>
                <span class="sr-usage-quota">${escapeHtml(r2.quotaFormatted || "未设置")}</span>
              </div>
              <div class="sr-usage-track">
                <div class="sr-usage-fill" style="width:${Math.min(usagePercent, 100)}%;background:${usageBarColor}"></div>
              </div>
            </div>
          </div>
          <div class="admin-card span-5">
            <div class="admin-card-header">
              <div class="admin-card-icon" style="background:rgba(217,119,6,0.1);color:#d97706">${icons.settings || icons.edit}</div>
              <span class="admin-label">操作</span>
            </div>
            <div class="sr-actions">
              <button class="btn toolbar-btn" type="button" data-action="show-edit-storage-quota" ${storageConfigSaving ? "disabled" : ""}>
                ${icons.edit} 编辑配额
              </button>
            </div>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-header">
            <div class="admin-card-icon" style="background:rgba(5,150,105,0.1);color:#059669">${icons.trash}</div>
            <span class="admin-label">回收站保留设置</span>
          </div>
          ${retentionHtml}
        </div>
      </div>
    `;
  }

  return {
    renderAdminStorageSection,
    renderStorageSection,
  };
}
