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
      envHtml = renderEmptyStateCompact("加载中", "正在检查服务组件状态...", icons.eye);
    } else {
      const items = Object.entries(health.components || health).filter(([, v]) => typeof v === "object");
      envHtml = items.map(([key, value]) => {
        const status = String(value?.status || "unknown");
        const ok = status === "ok" || status === "healthy";
        return `
          <div class="env-item" style="padding:8px 10px;">
            <div class="env-item-head">
              <span class="env-item-name" style="font-size:12px;">${safeText(key)}</span>
              <span class="env-status ${ok ? "env-status-ok" : "env-status-error"}" style="font-size:10px;">${ok ? "正常" : "异常"}</span>
            </div>
            <div class="env-item-desc" style="font-size:11px;">${safeText(value?.message || status, "未知")}</div>
          </div>
        `;
      }).join("");
    }

    let quotaHtml = "";
    if (quotaError) {
      quotaHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(quotaError)}</p></div>`;
    } else if (quotaLoading || !quota) {
      quotaHtml = renderEmptyStateCompact("加载中", "正在获取存储配额信息...", icons.stats);
    } else {
      const usedFormatted = formatBytes(quota.used || 0);
      const totalFormatted = formatBytes(quota.total || quota.limit || 0);
      const pct = quota.used && (quota.total || quota.limit) ? Math.round((quota.used / (quota.total || quota.limit)) * 100) : 0;
      quotaHtml = `
        <div class="quota-bar-wrap">
          <div class="quota-bar-info" style="font-size:12px;"><span>已用 ${usedFormatted} / ${totalFormatted}</span><span>${pct}%</span></div>
          <div class="quota-bar"><div class="quota-bar-fill" style="width:${Math.min(pct, 100)}%;"></div></div>
        </div>
      `;
    }

    let notifHtml = "";
    if (adminNotifHistoryLoading) {
      notifHtml = renderEmptyStateCompact("加载中", "正在获取通知历史...", icons.bell);
    } else {
      const items = adminNotifHistory || [];
      notifHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:12px;color:var(--muted);">共 ${items.length} 条通知${notificationsUnread ? `，${notificationsUnread} 条未读` : ""}</span>
          <button class="btn toolbar-btn" type="button" data-action="mark-all-notifications-read" ${notificationsUnread ? "" : "disabled"} style="min-height:28px;padding:0 8px;font-size:11px;">全部已读</button>
        </div>
        ${items.length === 0
          ? renderEmptyStateCompact("暂无通知", "目前还没有任何通知记录。", icons.bell)
          : `<div style="display:flex;flex-direction:column;gap:4px;">${items.slice(0, 10).map((n) => `
            <div class="latest-item-compact" style="padding:6px 8px;margin:0;${n.read ? "" : "border-left:3px solid var(--primary);"}">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="status-dot" style="background:${n.read ? "var(--muted)" : "var(--primary)"};flex-shrink:0;"></span>
                <span style="font-size:12px;font-weight:${n.read ? "normal" : "600"};flex:1;">${escapeHtml(n.message)}</span>
                ${n.read ? "" : `<button class="btn btn-small btn-ghost" type="button" data-action="admin-mark-notif-read" data-notif-id="${n.id}" style="min-height:24px;padding:0 6px;font-size:11px;">✓</button>`}
              </div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px;">${formatRelative(n.created_at)}</div>
            </div>
          `).join("")}</div>`
        }
      `;
    }

    let webhooksHtml = "";
    if (webhooksError) {
      webhooksHtml = `<div class="empty-state"><p class="empty-copy">${escapeHtml(webhooksError)}</p><div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">重新加载</button></div></div>`;
    } else if (webhooksLoading) {
      webhooksHtml = renderEmptyStateCompact("加载中", "正在加载 Webhook 配置...", icons.link);
    } else if (webhooks.length === 0) {
      webhooksHtml = renderEmptyStateCompact("暂无 Webhook", "还没有配置任何 Webhook。", icons.link);
    } else {
      webhooksHtml = webhooks.map((item) => `
        <div class="latest-item-compact" style="padding:8px 10px;margin:0;">
          <div class="status-bar" style="gap:6px;">
            <div class="status-main">
              <span class="status-dot" style="background:${item.enabled ? "var(--primary)" : "var(--muted)"};flex-shrink:0;"></span>
              <span style="font-size:12px;font-weight:600;">${safeText(item.name)}</span>
              <span class="toolbar-tag" style="font-size:10px;">${safeText(item.msgtype)}</span>
              <span class="toolbar-tag" style="font-size:10px;">${safeText(item.method)}</span>
              ${!item.enabled ? '<span class="toolbar-tag tag-expired" style="font-size:10px;">已禁用</span>' : ""}
            </div>
            <div style="display:flex;gap:4px;">
              <button class="btn toolbar-btn" type="button" data-action="test-webhook" data-id="${escapeHtml(item.id)}" style="min-height:26px;padding:0 6px;font-size:10px;">测试</button>
              <button class="btn toolbar-btn" type="button" data-action="edit-webhook" data-id="${escapeHtml(item.id)}" style="min-height:26px;padding:0 6px;font-size:10px;">编辑</button>
              <button class="btn btn-danger" type="button" data-action="confirm-delete-webhook" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" style="min-height:26px;padding:0 6px;font-size:10px;">删除</button>
            </div>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px;">
            ${escapeHtml(item.url)}
            ${(item.events || []).map((e) => `<span class="toolbar-tag" style="font-size:10px;">${escapeHtml(e)}</span>`).join(" ")}
          </div>
        </div>
      `).join("");
    }

    let deliveriesHtml = "";
    if (webhookDeliveriesLoading) {
      deliveriesHtml = renderEmptyStateCompact("加载中", "正在加载投递记录...", icons.list);
    } else if (webhookDeliveries.length === 0) {
      deliveriesHtml = renderEmptyStateCompact("暂无投递记录", "还没有任何 Webhook 投递记录。", icons.list);
    } else {
      deliveriesHtml = webhookDeliveries.map((item) => {
        const ok = item.ok === 1 || item.ok === true;
        return `
          <div class="latest-item-compact" style="padding:6px 8px;margin:0;">
            <div class="status-bar" style="gap:6px;">
              <div class="status-main">
                <span class="status-dot" style="background:${ok ? "var(--primary)" : "var(--danger)"};flex-shrink:0;"></span>
                <span style="font-size:12px;">${safeText(item.event)}</span>
                <span class="toolbar-tag" style="font-size:10px;">${safeText(item.endpoint)}</span>
                <span class="toolbar-tag ${ok ? "tag-unlimited" : "tag-expired"}" style="font-size:10px;">${ok ? "成功" : "失败"}</span>
              </div>
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;">
              ${ok ? `HTTP ${escapeHtml(String(item.status))}` : escapeHtml(item.error || "未知错误")}
              <span style="margin:0 4px;">·</span>${escapeHtml(item.duration_ms || 0)}ms
              <span style="margin:0 4px;">·</span>${escapeHtml(formatRelative(item.created_at) || "")}
            </div>
          </div>
        `;
      }).join("");
    }

    return `
      <div class="ov-page">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title">系统</h2>
            <p class="ov-page-desc">管理系统环境、存储配额、通知与 Webhook</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-health" data-action2="refresh-admin-quota">刷新</button>
        </div>

        <div class="admin-grid">
          <div class="admin-card span-7">
            <div class="admin-card-header">
              <div class="admin-card-icon" style="background:rgba(14,116,144,0.1);color:#0e7490">${icons.eye}</div>
              <span class="admin-label">环境检查</span>
            </div>
            <div class="env-grid" style="gap:4px;">${envHtml}</div>
          </div>
          <div class="admin-card span-5">
            <div class="admin-card-header">
              <div class="admin-card-icon" style="background:rgba(5,150,105,0.1);color:#059669">${icons.stats}</div>
              <span class="admin-label">存储配额</span>
            </div>
            ${quotaHtml}
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-header">
            <div class="admin-card-icon" style="background:rgba(217,119,6,0.1);color:#d97706">${icons.bell}</div>
            <span class="admin-label">通知中心</span>
          </div>
          ${notifHtml}
        </div>

        <div class="admin-grid">
          <div class="admin-card span-6">
            <div class="admin-card-header">
              <div class="admin-card-icon" style="background:rgba(139,92,246,0.1);color:#8b5cf6">${icons.link}</div>
              <span class="admin-label">Webhook 配置</span>
              <button class="btn btn-primary" type="button" data-action="show-add-webhook" style="margin-left:auto;min-height:28px;padding:0 8px;font-size:11px;">添加</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">${webhooksHtml}</div>
          </div>
          <div class="admin-card span-6">
            <div class="admin-card-header">
              <div class="admin-card-icon" style="background:rgba(192,57,43,0.1);color:#c0392b">${icons.list}</div>
              <span class="admin-label">Webhook 投递记录</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">${deliveriesHtml}</div>
          </div>
        </div>
      </div>
    `;
  }

  return {
    renderAdminHealthSection: renderSystemSection,
    renderAdminQuotaSection: renderSystemSection,
    renderSystemStatusSection: renderSystemSection,
    renderSystemSection,
  };
}
