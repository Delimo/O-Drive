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
      <div class="ov-page" style="display:flex; flex-direction:column; gap:12px; height:100%; overflow:hidden; font-family:system-ui, sans-serif;">
        <div class="ov-page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:16px; font-weight:600; color:var(--text);">节点与分发</h2>
            <p class="ov-page-desc" style="margin:2px 0 0; font-size:11px; color:var(--muted);">节点健康心跳及 Webhooks 回调自动化</p>
          </div>
          <button class="btn" type="button" data-action="refresh-admin-health" data-action2="refresh-admin-quota" style="font-size:11px; padding:3px 8px; border:1px solid var(--line); border-radius:4px; background:transparent;">
            刷新诊断
          </button>
        </div>

        <div style="display:grid; grid-template-columns: repeat(12, 1fr); gap:16px; border-top:1px solid var(--line); padding-top:12px; flex:1; min-h-0;">
          
          <!-- 左侧：诊断与回调管理 (7 columns) -->
          <div style="grid-column: span 7; display:flex; flex-direction:column; gap:12px; min-h-0;">
            <!-- 健康状态 -->
            <div>
              <h3 style="margin:0 0 6px 0; font-size:12px; font-weight:600; color:var(--text); text-transform:uppercase; letter-spacing:0.03em;">组件探针</h3>
              ${healthLoading ? `
                <p style="font-size:11px; color:var(--muted);">诊断中...</p>
              ` : `
                <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:6px;">
                  ${Object.entries(sysComponents).map(([name, statusObj]) => {
                    const isOk = statusObj.status === "ok";
                    return `
                      <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px dashed var(--line); font-size:12px;">
                        <span style="font-weight:500; color:var(--text);">${escapeHtml(name)}</span>
                        <div style="display:flex; align-items:center; gap:4px; font-size:11px; color:${isOk ? "#10b981" : "var(--danger)"};">
                          <span style="width:4px; height:4px; border-radius:50%; background:${isOk ? "#10b981" : "var(--danger)"};"></span>
                          <span>${isOk ? "ONLINE" : "OFFLINE"}</span>
                        </div>
                      </div>
                    `;
                  }).join("")}
                </div>
              `}
            </div>

            <!-- Webhook 服务 -->
            <div style="border-top:1px solid var(--line); padding-top:8px; display:flex; flex-direction:column; flex:1; min-h-0;">
              <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
                <h3 style="margin:0; font-size:12px; font-weight:600; color:var(--text); text-transform:uppercase; letter-spacing:0.03em;">Webhooks 分发点</h3>
                <button class="btn" type="button" data-action="show-add-webhook" style="font-size:10px; padding:1px 6px; border:1px solid var(--line); border-radius:4px; background:transparent; color:var(--accent);">+ 新增</button>
              </div>

              <div style="flex:1; overflow-y:auto; max-height:120px;">
                ${webhooksLoading ? `
                  <p style="font-size:11px; color:var(--muted);">载入中...</p>
                ` : webhooks.length === 0 ? `
                  <p style="font-size:11px; color:var(--muted); padding:12px 0; margin:0;">无配置的 Webhook 回调点</p>
                ` : webhooks.map(hook => `
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--line); font-size:12px; gap:8px;">
                    <div style="min-width:0; flex:1;">
                      <div style="display:flex; align-items:center; gap:4px;">
                        <span style="font-weight:600; color:var(--text);">${escapeHtml(hook.name)}</span>
                        <span style="font-family:monospace; font-size:9px; color:var(--muted);">${escapeHtml(hook.method || "POST")}</span>
                      </div>
                    </div>
                    <div style="display:flex; gap:4px; flex-shrink:0;">
                      <button class="btn" type="button" data-action="edit-webhook" data-id="${escapeHtml(hook.id)}" style="font-size:10px; padding:1px 4px; border:1px solid var(--line); border-radius:4px; background:transparent;">改</button>
                      <button class="btn btn-danger" type="button" data-action="confirm-delete-webhook" data-id="${escapeHtml(hook.id)}" data-name="${escapeHtml(hook.name)}" style="font-size:10px; padding:1px 4px; border-radius:4px;">删</button>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>

          <!-- 右侧：平台系统广播日志 (5 columns) -->
          <div style="grid-column: span 5; border-left:1px solid var(--line); padding-left:20px; display:flex; flex-direction:column; min-h-0;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
              <h3 style="margin:0; font-size:12px; font-weight:600; color:var(--text); text-transform:uppercase; letter-spacing:0.03em;">内部公告板</h3>
              ${notificationsUnread > 0 ? `<button class="btn" type="button" data-action="mark-all-notifications-read" style="font-size:10px; padding:1px 4px; border:1px solid var(--line); background:transparent;">全标已读</button>` : ""}
            </div>

            <div style="flex:1; overflow-y:auto; max-height:230px;">
              ${adminNotifHistoryLoading ? `
                <p style="font-size:11px; color:var(--muted);">拉取中...</p>
              ` : adminNotifHistory.length === 0 ? `
                <p style="font-size:11px; color:var(--muted); padding:24px 0; margin:0;">公告板暂空无内容</p>
              ` : adminNotifHistory.map(notif => `
                <div style="padding:6px 0; border-bottom:1px dashed var(--line); font-size:11px; position:relative; padding-right:16px;">
                  <div style="color:var(--text); line-height:1.4;">${escapeHtml(notif.message)}</div>
                  <div style="font-size:10px; color:var(--muted); margin-top:2px;">${formatTime(notif.created_at)}</div>
                  ${!notif.read ? `<button type="button" data-action="admin-mark-notif-read" data-notif-id="${escapeHtml(notif.id)}" style="position:absolute; right:0; top:6px; border:none; background:none; color:var(--accent); cursor:pointer;">✓</button>` : ""}
                </div>
              `).join("")}
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