export function createSystemRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderSystemSection(admin) {
    const {
      health = {}, healthLoading, healthError,
      adminNotifHistory = [], adminNotifHistoryLoading, notificationsUnread = 0,
      webhooks = [], webhooksLoading
    } = admin;

    if (healthError) {
      return components.renderErrorCard({ icon: "", error: healthError, onRetry: "refresh-admin-health" });
    }

    const sysComponents = health.components || {};

    return `
      <div class="ap">
        <div class="ap-head">
          <div>
            <h2 class="ap-title">节点与分发</h2>
            <p class="ap-desc">节点健康心跳及 Webhooks 回调自动化</p>
          </div>
          <button class="ap-btn" type="button" data-action="refresh-admin-health" data-action2="refresh-admin-quota">刷新诊断</button>
        </div>

        <div class="ap-grid">
          <div class="ap-card ap-col-7">
            <div class="ap-card-head">
              <span class="ap-lbl" style="margin:0;">组件探针</span>
            </div>
            <div class="ap-card-body" style="padding:0;">
              ${healthLoading
                ? `<p class="ap-empty-inline">诊断中...</p>`
                : `<div class="ap-grid" style="grid-template-columns:repeat(2,1fr);gap:0;">
                    ${Object.entries(sysComponents).map(([name, statusObj]) => {
                      const isOk = statusObj.status === "ok";
                      return `
                        <div class="ap-probe" style="border-right:1px solid var(--line);border-bottom:1px solid var(--line);">
                          <span class="ap-probe-name">${escapeHtml(name)}</span>
                          <span class="ap-probe-status ${isOk ? 'ap-probe-ok' : 'ap-probe-err'}">
                            <span style="width:5px;height:5px;border-radius:1px;background:currentColor;flex-shrink:0;"></span>
                            ${isOk ? "ONLINE" : "OFFLINE"}
                          </span>
                        </div>
                      `;
                    }).join("")}
                  </div>`
              }
            </div>

            <div style="border-top:1px solid var(--line);">
              <div class="ap-card-head" style="padding:10px 14px;">
                <span class="ap-lbl" style="margin:0;">Webhooks</span>
                <button class="ap-btn ap-btn-sm" type="button" data-action="show-add-webhook">+ 新增</button>
              </div>
              <div class="ap-card-body" style="overflow-y:auto;max-height:140px;padding:0;">
                ${webhooksLoading
                  ? `<p class="ap-empty-inline">载入中...</p>`
                  : webhooks.length === 0
                    ? `<p class="ap-empty-inline">无配置的 Webhook 回调点</p>`
                    : `<div class="ap-list">
                        ${webhooks.map(hook => `
                          <div class="ap-list-row" style="padding:8px 14px;">
                            <div class="ap-list-row-main" style="flex:1;min-width:0;">
                              <span class="ap-list-row-name">${escapeHtml(hook.name)}</span>
                              <code style="font-size:10px;color:var(--muted);margin-left:4px;">${escapeHtml(hook.method || "POST")}</code>
                            </div>
                            <div class="ap-row" style="gap:4px;flex-shrink:0;">
                              <button class="ap-btn ap-btn-sm ap-btn-ghost" type="button"
                                      data-action="edit-webhook" data-id="${escapeHtml(hook.id)}">编辑</button>
                              <button class="ap-btn ap-btn-sm ap-btn-danger" type="button"
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

          <div class="ap-card ap-col-5">
            <div class="ap-card-head">
              <span class="ap-lbl" style="margin:0;">内部公告板</span>
              ${notificationsUnread > 0 ? `<button class="ap-btn ap-btn-sm ap-btn-ghost" type="button" data-action="mark-all-notifications-read">全标已读</button>` : ""}
            </div>
            <div class="ap-card-body" style="overflow-y:auto;max-height:280px;">
              ${adminNotifHistoryLoading
                ? `<p class="ap-empty-inline">拉取中...</p>`
                : adminNotifHistory.length === 0
                  ? `<p class="ap-empty-inline">公告板暂空无内容</p>`
                  : `<div class="ap-list">
                      ${adminNotifHistory.map(notif => `
                        <div class="ap-notif ${!notif.read ? 'ap-notif-unread' : ''}">
                          <div class="ap-notif-body">
                            <p class="ap-notif-msg">${escapeHtml(notif.message)}</p>
                            <span class="ap-notif-time">${formatTime(notif.created_at)}</span>
                          </div>
                          ${!notif.read ? `<button class="ap-notif-check" type="button"
                            data-action="admin-mark-notif-read" data-notif-id="${escapeHtml(notif.id)}">&#10003;</button>` : ""}
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
