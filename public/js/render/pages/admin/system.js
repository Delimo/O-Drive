export function createSystemRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyState,
  renderEmptyStateCompact,
  formatBytes,
  formatTime,
  components,
}) {
  function renderAdminHealthSection(admin) {
    const health = admin.health;
    const loading = admin.healthLoading;
    const error = admin.healthError;

    if (error) {
      return components.renderErrorCard({
        icon: icons.lock,
        error,
        onRetry: "refresh-admin-health",
      });
    }

    if (loading || !health) {
      return renderEmptyState(
        "加载中",
        "正在检查各服务组件运行状态...",
        icons.eye,
      );
    }

    const items = Object.entries(health.components || health).filter(
      ([, v]) => typeof v === "object",
    );
    return `
      <div class="hero-strip">
        ${items
          .map(([key, value]) => {
            const status = String(value?.status || "unknown");
            const ok = status === "ok" || status === "healthy";
            return `
            <div class="mini-stat">
              <div class="mini-stat-label">${safeText(key)}</div>
              <div class="mini-stat-value">${ok ? icons.check : icons.close}</div>
              <div class="mini-stat-meta">${safeText(value?.message || status, "未知")}</div>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  function renderAdminQuotaSection(admin) {
    const { quota, quotaLoading, quotaError } = admin;

    if (quotaError) {
      return components.renderErrorCard({
        icon: icons.lock,
        error: quotaError,
        onRetry: "refresh-admin-quota",
      });
    }

    if (quotaLoading || !quota) {
      return renderEmptyStateCompact(
        "加载中",
        "正在获取存储配额信息...",
        icons.stats,
      );
    }

    const usedFormatted = formatBytes(quota.used || 0);
    const totalFormatted = formatBytes(quota.total || quota.limit || 0);
    const pct =
      quota.used && (quota.total || quota.limit)
        ? Math.round((quota.used / (quota.total || quota.limit)) * 100)
        : 0;

    return `
      <div class="hero-strip">
        <div class="mini-stat">
          <div class="mini-stat-label">已用空间</div>
          <div class="mini-stat-value">${usedFormatted}</div>
          <div class="mini-stat-meta">占总额的 ${pct}%</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">总配额</div>
          <div class="mini-stat-value">${totalFormatted}</div>
          <div class="mini-stat-meta">${quota.count ? `共 ${quota.count} 个文件` : ""}</div>
        </div>
      </div>
    `;
  }

  function renderSystemStatusSection(admin) {
    const health = admin.health;
    const healthLoading = admin.healthLoading;
    const healthError = admin.healthError;
    const { quota, quotaLoading, quotaError } = admin;
    const {
      maintenance,
      maintenanceLoading,
      maintenanceError,
      maintenanceBusyAction,
    } = admin;

    let envHtml = "";
    if (healthError) {
      envHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(healthError)}</p></div>`;
    } else if (healthLoading || !health) {
      envHtml = renderEmptyStateCompact(
        "加载中",
        "正在检查服务组件状态...",
        icons.eye,
      );
    } else {
      const items = Object.entries(health.components || health).filter(
        ([, v]) => typeof v === "object",
      );
      envHtml = `
        <div class="env-grid">
          ${items
            .map(([key, value]) => {
              const status = String(value?.status || "unknown");
              const ok = status === "ok" || status === "healthy";
              return `
              <div class="env-item">
                <div class="env-item-head">
                  <span class="env-item-name">${safeText(key)}</span>
                  <span class="env-status ${ok ? "env-status-ok" : "env-status-error"}">${ok ? "正常" : "异常"}</span>
                </div>
                <div class="env-item-desc">${safeText(value?.message || status, "未知")}</div>
              </div>
            `;
            })
            .join("")}
        </div>
      `;
    }

    let maintHtml = "";
    if (maintenanceError) {
      maintHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(maintenanceError)}</p></div>`;
    } else if (maintenanceLoading || !maintenance) {
      maintHtml = renderEmptyStateCompact(
        "加载中",
        "正在获取维护快照...",
        icons.spinner,
      );
    } else {
      maintHtml = `
        <div class="maint-grid">
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">文件索引</span>
              <span class="maint-item-value">${safeText(maintenance.indexCount, "0")}</span>
            </div>
            <div class="maint-item-desc">${safeText(maintenance.indexTotalSizeFormatted, "0 B")}${maintenance.indexFresh ? " · 已同步" : " · 待同步"}</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">索引更新</span>
              <span class="maint-item-time">${maintenance.indexUpdatedAt ? formatTime(maintenance.indexUpdatedAt) : "未知"}</span>
            </div>
            <div class="maint-item-desc">索引与存储${maintenance.indexFresh ? "一致" : "不一致"}</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">访问失败记录</span>
              <span class="maint-item-value">${safeText(maintenance.accessAttemptCount, "0")}</span>
            </div>
            <div class="maint-item-desc">受保护路径的密码错误记录</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">回收站</span>
              <span class="maint-item-value">${safeText(maintenance.trashCount, "0")}</span>
            </div>
            <div class="maint-item-desc">可回收站占用 R2 空间</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">操作日志</span>
              <span class="maint-item-value">${safeText(maintenance.logsCount, "0")}</span>
            </div>
            <div class="maint-item-desc">管理员操作记录</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">缩略图缓存</span>
              <span class="maint-item-value">${maintenance.thumbnailsPresent ? "有" : "无"}</span>
            </div>
            <div class="maint-item-desc">.thumbs/ 系统前缀</div>
          </div>
        </div>
        <div class="maint-actions">
          <button class="btn btn-primary toolbar-btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="rebuild-index" data-maintenance-label="重建文件索引" ${maintenanceBusyAction ? "disabled" : ""}>
            ${maintenanceBusyAction === "rebuild-index" ? icons.spinner : icons.trash}
            <span>${maintenanceBusyAction === "rebuild-index" ? "执行中..." : "重建文件索引"}</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="cleanup-access-attempts" data-maintenance-label="清理访问失败记录" ${maintenanceBusyAction ? "disabled" : ""}>
            ${maintenanceBusyAction === "cleanup-access-attempts" ? icons.spinner : icons.trash}
            <span>${maintenanceBusyAction === "cleanup-access-attempts" ? "执行中..." : "清理访问失败记录"}</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="cleanup-thumbnails" data-maintenance-label="清理缩略图缓存" ${maintenanceBusyAction ? "disabled" : ""}>
            ${maintenanceBusyAction === "cleanup-thumbnails" ? icons.spinner : icons.trash}
            <span>${maintenanceBusyAction === "cleanup-thumbnails" ? "执行中..." : "清理缩略图缓存"}</span>
          </button>
        </div>
      `;
    }

    let quotaHtml = "";
    if (quotaError) {
      quotaHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(quotaError)}</p></div>`;
    } else if (quotaLoading || !quota) {
      quotaHtml = renderEmptyStateCompact(
        "加载中",
        "正在获取存储配额信息...",
        icons.stats,
      );
    } else {
      const usedFormatted = formatBytes(quota.used || 0);
      const totalFormatted = formatBytes(quota.total || quota.limit || 0);
      const pct =
        quota.used && (quota.total || quota.limit)
          ? Math.round((quota.used / (quota.total || quota.limit)) * 100)
          : 0;
      quotaHtml = `
        <div class="quota-bar-wrap">
          <div class="quota-bar-info">
            <span>已用 ${usedFormatted} / ${totalFormatted}</span>
            <span>${pct}%</span>
          </div>
          <div class="quota-bar">
            <div class="quota-bar-fill" style="width:${Math.min(pct, 100)}%;"></div>
          </div>
        </div>
      `;
    }

    return `
      <div class="sys-status-page">
        <div class="sys-status-header">
          <div>
            <h3 class="sys-status-title">系统状态</h3>
            <p class="sys-status-desc">检查部署绑定、索引状态和维护入口。</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-health" data-action2="refresh-admin-maintenance">${icons.refresh}<span>刷新</span></button>
        </div>
        <div class="sys-status-body">
          <div class="sys-status-left">
            <div class="sys-status-card">
              <div class="sys-status-card-head">
                <h4 class="sys-status-card-title">环境检查</h4>
                <span class="sys-status-card-desc">关键绑定和登录配置</span>
              </div>
              ${envHtml}
            </div>
            <div class="sys-status-card">
              <div class="sys-status-card-head">
                <h4 class="sys-status-card-title">存储配额</h4>
              </div>
              ${quotaHtml}
            </div>
          </div>
          <div class="sys-status-right">
            <div class="sys-status-card">
              <div class="sys-status-card-head">
                <h4 class="sys-status-card-title">维护中心</h4>
                <span class="sys-status-card-desc">索引、缓存和记录清理</span>
              </div>
              ${maintHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return {
    renderAdminHealthSection,
    renderAdminQuotaSection,
    renderSystemStatusSection,
  };
}
