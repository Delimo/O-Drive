import {
  ADVANCED_MAINTENANCE_ACTIONS,
  COMMON_MAINTENANCE_ACTIONS,
} from "./utils.js";

export function createMaintenanceRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderMaintenanceItem(act) {
    return `
      <div class="ap-list-row" style="padding:12px 14px;">
        <div class="ap-list-row-main" style="flex:1;min-width:0;">
          <span class="ap-list-row-name" style="color:${act.danger ? 'var(--danger)' : 'var(--text)'};">${escapeHtml(act.label)}</span>
          <span class="ap-desc-text" style="margin:2px 0 0;display:block;">${escapeHtml(act.desc)}</span>
        </div>
        <button class="ap-btn ap-btn-sm ${act.danger ? 'ap-btn-danger' : 'ap-btn-ghost'}" type="button"
                data-action="confirm-maintenance-action"
                data-maintenance-action="${escapeHtml(act.action)}"
                data-maintenance-label="${escapeHtml(act.label)}">执行</button>
      </div>
    `;
  }

  function renderMaintenanceActions() {
    return `
      ${COMMON_MAINTENANCE_ACTIONS.map(renderMaintenanceItem).join("")}
      <details class="ap-maintenance-advanced" style="border-top:1px solid var(--line);">
        <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--muted);padding:10px 14px;">显示高级清理</summary>
        <div class="ap-list">
          ${ADVANCED_MAINTENANCE_ACTIONS.map(renderMaintenanceItem).join("")}
        </div>
      </details>
    `;
  }

  function renderAdminMaintenanceSection(admin) {
    const {
      maintenance,
      maintenanceLoading,
      maintenanceError,
      tasks = [],
      tasksLoading,
      taskAlertConfig = null,
      taskAlertConfigSaving = false,
      trashRetention
    } = admin;
    const taskAlert = taskAlertConfig || {};
    const taskAlertEnabled = taskAlert.enabled !== false;
    const taskAlertWindowHours = taskAlert.windowHours || 24;
    const taskAlertWarningCount = taskAlert.warningCount || 3;
    const taskAlertErrorCount = taskAlert.errorCount || 10;

    if (maintenanceError) {
      return components.renderErrorCard({ icon: "", error: maintenanceError, onRetry: "refresh-admin-maintenance" });
    }
    if (maintenanceLoading) {
      return renderEmptyStateCompact("加载中", "诊断系统状态...", "");
    }

    return `
      <div class="ap">
        <div class="ap-head">
          <div>
            <h2 class="ap-title">运维诊断</h2>
            <p class="ap-desc">执行系统元数据维护、垃圾文件清除及后台队列监控</p>
          </div>
        </div>

        <div class="ap-grid">
          <div class="ap-card ap-col-7">
            <div class="ap-card-head">
              <span class="ap-lbl" style="margin:0;">运维指令</span>
            </div>
            <div class="ap-card-body" style="padding:0;">
              <div class="ap-list">
                ${renderMaintenanceActions()}
              </div>
            </div>
            <div style="border-top:1px solid var(--line);padding:10px 14px;">
              <div class="ap-row" style="align-items:center;gap:8px;">
                <span class="ap-desc-text" style="margin:0;">垃圾时效</span>
                <input class="ap-input" type="number" data-binding="trash-retention-days"
                       value="${trashRetention ? trashRetention.days : 7}"
                       style="width:50px;text-align:center;font-size:11px;padding:2px 4px;">
                <span style="font-size:11px;color:var(--muted);">天</span>
                <button class="ap-btn ap-btn-sm" style="margin-left:auto;" type="button"
                        data-action="save-trash-retention">保存</button>
              </div>
            </div>
          </div>

          <div class="ap-card ap-col-5">
            <div class="ap-card-head">
              <span class="ap-lbl" style="margin:0;">后台调度</span>
              <button class="ap-btn ap-btn-sm ap-btn-ghost" type="button" data-action="refresh-tasks">刷新</button>
            </div>
            <div class="ap-card-body" style="overflow-y:auto;max-height:240px;">
              <div class="ov-task-alert-rule" style="margin-bottom:10px;">
                <div class="ov-task-alert-head">
                  <span class="ov-task-alert-title">失败任务告警</span>
                  <label class="ov-task-alert-toggle">
                    <input type="checkbox" data-binding="task-alert-enabled" ${taskAlertEnabled ? "checked" : ""}>
                    <span>启用</span>
                  </label>
                </div>
                <div class="ov-task-alert-form">
                  <label class="ov-task-alert-field">
                    <span>窗口</span>
                    <input class="input" type="number" min="1" max="168" step="1" data-binding="task-alert-window-hours" value="${taskAlertWindowHours}">
                    <em>小时</em>
                  </label>
                  <label class="ov-task-alert-field">
                    <span>Warning</span>
                    <input class="input" type="number" min="1" max="1000" step="1" data-binding="task-alert-warning" value="${taskAlertWarningCount}">
                    <em>条</em>
                  </label>
                  <label class="ov-task-alert-field">
                    <span>Error</span>
                    <input class="input" type="number" min="1" max="1000" step="1" data-binding="task-alert-error" value="${taskAlertErrorCount}">
                    <em>条</em>
                  </label>
                  <button class="btn btn-sm" type="button" data-action="save-task-alert-thresholds" ${taskAlertConfigSaving ? "disabled" : ""}>${taskAlertConfigSaving ? "保存中..." : "保存规则"}</button>
                </div>
              </div>
              ${tasksLoading
                ? `<p class="ap-empty-inline">载入中...</p>`
                : tasks.length === 0
                  ? `<p class="ap-empty-inline">无待命或执行中的系统队列</p>`
                  : `<div class="ap-list">
                      ${tasks.map(tsk => `
                        <div class="ap-list-row" style="padding:8px 10px;">
                          <div class="ap-list-row-main" style="flex:1;">
                            <span class="ap-list-row-name" style="font-size:12px;">队列: ${escapeHtml(tsk.status || "挂起")}</span>
                          </div>
                          <span class="ap-badge ap-badge-info">${tsk.completed || 0}/${tsk.total || 0}</span>
                          ${tsk.type === "zip_download" && tsk.result?.downloadUrl ? `<a class="ap-btn ap-btn-sm ap-btn-ghost" href="${escapeHtml(tsk.result.downloadUrl)}" target="_blank">下载结果</a>` : ""}
                        </div>
                        <div style="font-size:10px;color:var(--muted);padding:0 14px 6px;">启动于 ${formatTime(tsk.createdAt)}</div>
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
    renderAdminMaintenanceSection,
    COMMON_MAINTENANCE_ACTIONS,
    ADVANCED_MAINTENANCE_ACTIONS
  };
}
