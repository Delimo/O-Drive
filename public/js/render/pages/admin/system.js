export function createSystemRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyState,
  renderEmptyStateCompact,
  formatBytes,
  formatTime,
  formatRelative,
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

  function renderSystemSection(admin) {
    const health = admin.health;
    const healthLoading = admin.healthLoading;
    const healthError = admin.healthError;
    const { quota, quotaLoading, quotaError } = admin;
    const { adminNotifHistory, adminNotifHistoryLoading, notificationsUnread } = admin;
    const { webhooks, webhooksLoading, webhooksError } = admin;
    const { webhookDeliveries, webhookDeliveriesLoading } = admin;

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

    let notifHtml = "";
    if (adminNotifHistoryLoading) {
      notifHtml = renderEmptyStateCompact(
        "加载中",
        "正在获取通知历史...",
        icons.bell,
      );
    } else {
      const items = adminNotifHistory || [];
      notifHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <span style="font-size:13px;color:var(--muted);">共 ${items.length} 条通知${notificationsUnread ? `，${notificationsUnread} 条未读` : ""}</span>
          <button class="btn toolbar-btn" type="button" data-action="mark-all-notifications-read" ${notificationsUnread ? "" : "disabled"}>${icons.check}<span>全部已读</span></button>
        </div>
        ${
          items.length === 0
            ? renderEmptyStateCompact(
                "暂无通知",
                "目前还没有任何通知记录。",
                icons.bell,
              )
            : `
              <div class="latest-list-compact">
                ${items
                  .slice(0, 10)
                  .map(
                    (n) => `
                  <article class="latest-item-compact ${n.read ? "" : "notif-table-row-unread"}" style="${n.read ? "" : "border-left: 3px solid var(--primary); padding-left: 8px;"}">
                    <div class="status-bar">
                      <div class="status-main">
                        <span class="status-dot" style="background:${n.read ? "var(--muted)" : "var(--primary)"}"></span>
                        <span style="font-weight:${n.read ? "normal" : "600"};">${escapeHtml(n.message)}</span>
                      </div>
                      ${n.read ? "" : `<button class="btn btn-small btn-ghost" type="button" data-action="admin-mark-notif-read" data-notif-id="${n.id}">${icons.check}</button>`}
                    </div>
                    <div class="latest-copy">${formatRelative(n.created_at)}</div>
                  </article>
                `,
                  )
                  .join("")}
              </div>
            `
        }
      `;
    }

    let webhooksHtml = "";
    if (webhooksError) {
      webhooksHtml = `
        <div class="empty-state">
          <p class="empty-copy">${escapeHtml(webhooksError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
    } else if (webhooksLoading) {
      webhooksHtml = renderEmptyStateCompact(
        "加载中",
        "正在加载 Webhook 配置...",
        icons.link,
      );
    } else if (webhooks.length === 0) {
      webhooksHtml = renderEmptyStateCompact(
        "暂无 Webhook",
        "还没有配置任何 Webhook。",
        icons.link,
      );
    } else {
      webhooksHtml = `
        <div class="latest-list-compact">
          ${webhooks
            .map(
              (item) => `
            <article class="latest-item-compact">
              <div class="status-bar">
                <div class="status-main">
                  <span class="status-dot" style="background:${item.enabled ? "var(--primary)" : "var(--muted)"}"></span>
                  <span>${safeText(item.name)}</span>
                  <span class="toolbar-tag">${safeText(item.msgtype)}</span>
                  <span class="toolbar-tag">${safeText(item.method)}</span>
                  ${!item.enabled ? '<span class="toolbar-tag tag-expired">已禁用</span>' : ""}
                </div>
                <div class="btn-row">
                  <button class="btn toolbar-btn" type="button" data-action="test-webhook" data-id="${escapeHtml(item.id)}">${icons.eye}<span>测试</span></button>
                  <button class="btn toolbar-btn" type="button" data-action="edit-webhook" data-id="${escapeHtml(item.id)}">${icons.edit}<span>编辑</span></button>
                  <button class="btn btn-danger" type="button" data-action="confirm-delete-webhook" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">${icons.trash}<span>删除</span></button>
                </div>
              </div>
              <div class="latest-copy">
                ${escapeHtml(item.url)}
                <span style="margin:0 6px;">·</span>
                ${(item.events || []).map((e) => `<span class="toolbar-tag">${escapeHtml(e)}</span>`).join(" ")}
              </div>
            </article>
          `,
            )
            .join("")}
        </div>
      `;
    }

    let deliveriesHtml = "";
    if (webhookDeliveriesLoading) {
      deliveriesHtml = renderEmptyStateCompact(
        "加载中",
        "正在加载投递记录...",
        icons.list,
      );
    } else if (webhookDeliveries.length === 0) {
      deliveriesHtml = renderEmptyStateCompact(
        "暂无投递记录",
        "还没有任何 Webhook 投递记录。",
        icons.list,
      );
    } else {
      deliveriesHtml = `
        <div class="latest-list-compact">
          ${webhookDeliveries
            .map((item) => {
              const ok = item.ok === 1 || item.ok === true;
              return `
              <article class="latest-item-compact">
                <div class="status-bar">
                  <div class="status-main">
                    <span class="status-dot" style="background:${ok ? "var(--primary)" : "var(--danger)"}"></span>
                    <span>${safeText(item.event)}</span>
                    <span class="toolbar-tag">${safeText(item.endpoint)}</span>
                    <span class="toolbar-tag ${ok ? "tag-unlimited" : "tag-expired"}">${ok ? "成功" : "失败"}</span>
                  </div>
                </div>
                <div class="latest-copy">
                  ${ok ? `<span>HTTP ${escapeHtml(String(item.status))}</span>` : `<span>${escapeHtml(item.error || "未知错误")}</span>`}
                  <span style="margin:0 6px;">·</span>
                  <span>${escapeHtml(item.duration_ms || 0)}ms</span>
                  <span style="margin:0 6px;">·</span>
                  <span>${escapeHtml(formatRelative(item.created_at) || "")}</span>
                </div>
              </article>
            `;
            })
            .join("")}
        </div>
      `;
    }

    return `
      <div class="sys-status-page">
        <div class="sys-status-header">
          <div>
            <h3 class="sys-status-title">系统健康</h3>
            <p class="sys-status-desc">管理系统环境、查看存储配额、通知消息与配置 Webhook。</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-health" data-action2="refresh-admin-quota">${icons.refresh}<span>刷新</span></button>
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
            <div class="sys-status-card">
              <div class="sys-status-card-head" style="display:flex;align-items:center;justify-content:between;">
                <h4 class="sys-status-card-title" style="margin:0;">通知中心</h4>
              </div>
              <div style="margin-top:12px;">
                ${notifHtml}
              </div>
            </div>
          </div>
          <div class="sys-status-right">
            <div class="sys-status-card">
              <details style="width:100%;" class="admin-details">
                <summary style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-weight:700;font-size:16px;user-select:none;outline:none;list-style:none;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span>Webhook 配置</span>
                  </div>
                  <button class="btn btn-primary btn-small" type="button" data-action="show-add-webhook" style="margin-left:auto;margin-right:12px;">${icons.plus}<span>添加</span></button>
                  <span class="expand-icon">▼</span>
                </summary>
                <div style="margin-top:16px;">
                  ${webhooksHtml}
                </div>
              </details>
            </div>
            <div class="sys-status-card">
              <details style="width:100%;" class="admin-details">
                <summary style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-weight:700;font-size:16px;user-select:none;outline:none;list-style:none;">
                  <span>Webhook 投递记录</span>
                  <span class="expand-icon" style="margin-left:auto;">▼</span>
                </summary>
                <div style="margin-top:16px;">
                  ${deliveriesHtml}
                </div>
              </details>
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
    renderSystemSection,
  };
}
