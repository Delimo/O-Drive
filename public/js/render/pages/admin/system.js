export function createSystemRenderer({
  safeText, escapeHtml, renderEmptyState, renderEmptyStateCompact, formatTime, formatRelative, components
}) {

  function renderSystemSection(admin) {
    const {
      healthLoading, healthError,
      adminNotifHistoryLoading, notificationsUnread = 0,
      webhooksLoading
    } = admin;

    const healthData = admin.health || {};
    const sysComponents = healthData.components || {};
    const adminNotifHistory = admin.adminNotifHistory || [];
    const webhooks = admin.webhooks || [];

    if (healthError) {
      return components.renderErrorCard({ icon: "", error: healthError, onRetry: "refresh-admin-health" });
    }

    return `
      <div class="ov-system">
        <div class="ov-system-header">
          <div class="ov-system-title-group">
            <h2 class="ov-system-title">系统监控</h2>
            <p class="ov-system-desc">节点健康心跳、Webhooks与内部公告</p>
          </div>
          <button class="btn" type="button" data-action="refresh-admin-health" data-action2="refresh-admin-quota">
            刷新诊断
          </button>
        </div>

        <div class="ov-system-top">
          <div class="ov-health">
            <div class="ov-health-header">
              <span class="ov-health-title">组件探针</span>
            </div>
            <div class="ov-health-body">
              ${healthLoading
                ? `<div class="ov-empty-inline">诊断中...</div>`
                : `<div class="ov-health-grid">
                    ${Object.entries(sysComponents).map(([name, statusObj]) => {
                      const isOk = statusObj.status === "ok";
                      return `
                        <div class="ov-health-item">
                          <span class="ov-health-name">${escapeHtml(name)}</span>
                          <span class="ov-health-status ${isOk ? 'ov-health-ok' : 'ov-health-err'}">
                            <span class="ov-health-dot"></span>
                            ${isOk ? "ONLINE" : "OFFLINE"}
                          </span>
                        </div>
                      `;
                    }).join("")}
                  </div>`
              }
            </div>
          </div>

          <div class="ov-notifications">
            <div class="ov-notif-header">
              <span class="ov-notif-title">内部公告板</span>
              ${notificationsUnread > 0 ? `<button class="btn btn-sm" type="button" data-action="mark-all-notifications-read">全标已读</button>` : ""}
            </div>
            <div class="ov-notif-body">
              ${adminNotifHistoryLoading
                ? `<div class="ov-empty-inline">拉取中...</div>`
                : adminNotifHistory.length === 0
                  ? `<div class="ov-empty-inline">公告板暂空无内容</div>`
                  : `<div class="ov-notif-list">
                      ${adminNotifHistory.map(notif => `
                        <div class="ov-notif-item ${!notif.read ? 'ov-notif-unread' : ''}">
                          <div class="ov-notif-content">
                            <p class="ov-notif-msg">${escapeHtml(notif.message)}</p>
                            <span class="ov-notif-time">${formatRelative(notif.created_at)}</span>
                          </div>
                          ${!notif.read ? `<button class="ov-notif-check" type="button"
                            data-action="admin-mark-notif-read" data-notif-id="${escapeHtml(notif.id)}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                          </button>` : ""}
                        </div>
                      `).join("")}
                    </div>`
              }
            </div>
          </div>
        </div>

        <div class="ov-system-bottom">
          <div class="ov-webhooks">
            <div class="ov-webhook-header">
              <span class="ov-webhook-title">Webhooks</span>
              <button class="btn btn-sm" type="button" data-action="show-add-webhook">添加</button>
            </div>
            <div class="ov-webhook-body">
              ${webhooksLoading
                ? `<div class="ov-empty-inline">载入中...</div>`
                : webhooks.length === 0
                  ? `<div class="ov-empty-inline">无配置的 Webhook 回调点</div>`
                  : `<div class="ov-webhook-list">
                      ${webhooks.map(hook => `
                        <div class="ov-webhook-item">
                          <div class="ov-webhook-info">
                            <span class="ov-webhook-name">${escapeHtml(hook.name)}</span>
                            <code class="ov-webhook-method">${escapeHtml(hook.method || "POST")}</code>
                          </div>
                          <div class="ov-webhook-actions">
                            <button class="btn btn-sm" type="button"
                                    data-action="edit-webhook" data-id="${escapeHtml(hook.id)}">编辑</button>
                            <button class="btn btn-danger btn-sm" type="button"
                                    data-action="confirm-delete-webhook"
                                    data-id="${escapeHtml(hook.id)}"
                                    data-name="${escapeHtml(hook.name)}">删除</button>
                          </div>
                        </div>
                      `).join("")}
                    </div>`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return {
    renderSystemSection,
    renderAdminHealthSection: renderSystemSection,
    renderAdminQuotaSection: renderSystemSection,
    renderSystemStatusSection: renderSystemSection
  };
}
