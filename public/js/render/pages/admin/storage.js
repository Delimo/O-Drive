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
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:8px;">
          <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:160px;">
            <label style="font-size:13px;color:var(--muted);">保留天数（0 为不自动清理）</label>
            <input class="input" type="number" min="0" max="3650" value="${currentDays}" data-binding="trash-retention-days" style="max-width:200px;">
          </div>
          <button class="btn btn-primary toolbar-btn" type="button" data-action="save-trash-retention" ${trashCleanupBusy ? "disabled" : ""}>
            保存设置
          </button>
          ${currentDays > 0 ? `<span style="font-size:12px;color:var(--muted);align-self:center;">超过 ${currentDays} 天的回收站项目将被自动清除</span>` : '<span style="font-size:12px;color:var(--warning);align-self:center;">未设置保留天数，不会自动清理</span>'}
        </div>
      `;
    }

    return `
      <div class="admin-section-compact">
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>Cloudflare R2</h3>
            <button class="btn toolbar-btn" type="button" data-action="show-edit-storage-quota" ${storageConfigSaving ? "disabled" : ""}>编辑配额</button>
          </div>
          <div class="sys-status-card" style="margin:0;">
            <div class="env-item">
              <div class="env-item-head">
                <span class="env-item-name">${escapeHtml(r2.name || "Cloudflare R2")}</span>
                <span class="env-status env-status-ok">正常</span>
              </div>
              <div class="env-item-desc">${escapeHtml(r2.usedFormatted || "0")} / ${escapeHtml(r2.quotaFormatted || "未设置")} · 已用 ${usagePercent}%</div>
              <div style="margin:8px 0 0;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(usagePercent, 100)}%;background:${usageBarColor};border-radius:3px;transition:width .3s;"></div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3>回收站保留设置</h3>
          ${retentionHtml}
        </section>
      </div>
    `;
  }

  return {
    renderAdminStorageSection,
    renderStorageSection,
  };
}
