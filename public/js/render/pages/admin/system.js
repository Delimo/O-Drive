export function createSystemRenderer({
  icons, safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderSystemSection(admin) {
    const { 
      health = {}, healthLoading, healthError,
      quota = {}, quotaLoading,
      adminNotifHistory = [], adminNotifHistoryLoading, notificationsUnread = 0,
      webhooks = [], webhooksLoading, webhooksError
    } = admin;

    if (healthError || webhooksError) {
      return components.renderErrorCard({ icon: icons.refresh, error: healthError || webhooksError, onRetry: "refresh-admin-health" });
    }

    const sysComponents = health.components || {};

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px;">
        <div class="ov-page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:20px; font-weight:700; color:var(--text);">系统整合与配置</h2>
            <p class="ov-page-desc" style="margin:4px 0 0; font-size:13px; color:var(--muted);">掌握系统的物理运行指标、组件健康度和管理 Webhook 自动化分发</p>
          </div>
          <button class="btn" type="button" 
                  data-action="refresh-admin-health" 
                  data-action2="refresh-admin-quota"
                  style="display:flex; align-items:center; gap:6px; padding:6px 12px; font-size:13px; border-radius:8px; border:1px solid var(--line); background:var(--panel);">
            <span style="width:14px; height:14px;">${icons.refresh}</span> 诊断重试
          </button>
        </div>

        <div class="admin-grid" style="display:grid; grid-template-columns: repeat(12, 1fr); gap:16px;">
          
          <!-- 左侧整合专区 (7 columns) -->
          <div style="grid-column: span 7; display:flex; flex-direction:column; gap:16px;">
            
            <!-- 系统组件探针 -->
            <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px;">
              <h3 style="margin:0 0 12px 0; font-size:15px; font-weight:700; color:var(--text);">物理节点健康诊断</h3>
              ${healthLoading ? `
                <p style="text-align:center; font-size:12px; color:var(--muted); padding:16px 0;">检测健康状态中...</p>
              ` : Object.keys(sysComponents).length === 0 ? `
                <p style="text-align:center; font-size:12px; color:var(--muted); padding:16px 0;">没有已注册健康监测组件</p>
              ` : `
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
                  ${Object.entries(sysComponents).map(([compName, statusObj]) => {
                    const isOk = statusObj.status === "ok";
                    return `
                      <div style="padding:10px; background:var(--panel-soft); border-radius:8px; border:1px solid var(--line); display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-weight:600; font-size:13px; color:var(--text);">${escapeHtml(compName)}</span>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <span style="width:8px; height:8px; border-radius:50%; background:${isOk ? "#10b981" : "var(--danger)"};"></span>
                          <span style="font-size:11px; font-weight:600; color:${isOk ? "#10b981" : "var(--danger)"};">${isOk ? "连通正常" : "发生阻断"}</span>
                        </div>
                      </div>
                    `;
                  }).join("")}
                </div>
              `}
            </div>

            <!-- Webhook 服务回调 -->
            <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="margin:0; font-size:15px; font-weight:700; color:var(--text);">自动分发 Webhooks</h3>
                <button class="btn btn-primary" type="button" data-action="show-add-webhook" style="font-size:11px; padding:4px 10px; border-radius:6px;">
                  新增 Webhook
                </button>
              </div>

              ${webhooksLoading ? `
                <p style="text-align:center; font-size:12px; color:var(--muted); padding:16px 0;">加载中...</p>
              ` : webhooks.length === 0 ? `
                <p style="text-align:center; font-size:13px; color:var(--muted); padding:24px 0;">暂无配置的 Webhook 回调服务</p>
              ` : `
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${webhooks.map(hook => `
                    <div style="padding:12px; border-radius:8px; border:1px solid var(--line); background:var(--panel-soft); display:flex; justify-content:space-between; align-items:center; gap:16px;">
                      <div style="min-width:0; flex:1;">
                        <div style="display:flex; align-items:center; gap:6px;">
                          <span style="font-weight:600; font-size:13px; color:var(--text);">${escapeHtml(hook.name)}</span>
                          <span style="font-size:10px; padding:2px 4px; border-radius:4px; font-weight:700; background:var(--line); color:var(--muted);">${escapeHtml(hook.method || "POST")}</span>
                        </div>
                        <div style="font-size:11px; color:var(--muted); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:monospace;">${escapeHtml(hook.url)}</div>
                      </div>
                      <div style="display:flex; gap:6px;">
                        <button class="btn" type="button" data-action="edit-webhook" data-id="${escapeHtml(hook.id)}" style="font-size:11px; padding:4px 8px; border-radius:6px; border:1px solid var(--line); background:var(--panel);">编辑</button>
                        <button class="btn btn-danger" type="button" data-action="confirm-delete-webhook" data-id="${escapeHtml(hook.id)}" data-name="${escapeHtml(hook.name)}" style="font-size:11px; padding:4px 8px; border-radius:6px;">删除</button>
                      </div>
                    </div>
                  `).join("")}
                </div>
              `}
            </div>

          </div>

          <!-- 右侧通知日志/信箱 (5 columns) -->
          <div style="grid-column: span 5; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; display:flex; flex-direction:column; height:100%;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h3 style="margin:0; font-size:15px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
                <span style="width:16px; height:16px; color:var(--accent);">${icons.bell}</span> 系统内部通知板
              </h3>
              ${notificationsUnread > 0 ? `
                <button class="btn btn-primary" type="button" data-action="mark-all-notifications-read" style="font-size:10px; padding:2px 6px; border-radius:4px;">
                  全部标为已读
                </button>
              ` : ""}
            </div>

            <div style="flex:1; overflow-y:auto; max-height:450px;">
              ${adminNotifHistoryLoading ? `
                <p style="text-align:center; font-size:12px; color:var(--muted); padding:24px 0;">拉取通知记录...</p>
              ` : adminNotifHistory.length === 0 ? `
                <p style="text-align:center; font-size:12px; color:var(--muted); padding:32px 0;">当前暂无未读及历史通知</p>
              ` : `
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${adminNotifHistory.map(notif => `
                    <div style="padding:10px; border-radius:8px; border:1px solid var(--line); background:${notif.read ? "var(--panel-soft)" : "var(--accent-soft)"}; font-size:12px; display:flex; flex-direction:column; gap:4px; position:relative;">
                      <div style="color:var(--text); line-height:1.4; padding-right:24px;">${escapeHtml(notif.message)}</div>
                      <div style="font-size:10px; color:var(--muted);">${formatTime(notif.created_at)}</div>
                      ${!notif.read ? `
                        <button type="button" data-action="admin-mark-notif-read" data-notif-id="${escapeHtml(notif.id)}" 
                                title="标为已读" 
                                style="position:absolute; right:8px; top:8px; border:none; background:none; cursor:pointer; width:16px; height:16px; color:var(--accent);">
                          ${icons.check}
                        </button>
                      ` : ""}
                    </div>
                  `).join("")}
                </div>
              `}
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