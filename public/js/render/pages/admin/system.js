import { MAINTENANCE_ACTIONS } from "./utils.js";

export function createSystemRenderer({
  safeText, escapeHtml, renderEmptyState, renderEmptyStateCompact, formatTime, formatRelative, formatBytes, components
}) {

  function renderSystemSection(admin) {
    const {
      healthLoading, healthError,
      maintenanceLoading, maintenanceError,
      tasks = [], tasksLoading,
      taskAlertConfig = null, taskAlertConfigSaving = false,
      quota = null
    } = admin;

    const healthData = admin.health || {};
    const sysComponents = {};
    if (healthData.db) {
      sysComponents["数据库"] = { status: healthData.db.ok ? "ok" : "error", message: healthData.db.ok ? `${(healthData.db.tables || []).length} 张表` : healthData.db.message || "" };
    }
    if (healthData.r2) {
      sysComponents["对象存储"] = { status: healthData.r2.ok ? "ok" : "error", message: healthData.r2.ok ? "R2 连接正常" : healthData.r2.message || "" };
    }
    if (healthData.env) {
      sysComponents["管理员账户"] = { status: healthData.env.adminUsername && healthData.env.adminPassword ? "ok" : "error", message: "" };
      sysComponents["Token密钥"] = { status: healthData.env.tokenSecret?.configured ? "ok" : "error", message: "" };
      sysComponents["访客模式"] = { status: healthData.env.guestEnabled ? "ok" : "info", message: healthData.env.guestEnabled ? "已启用" : "已禁用" };
      sysComponents["WebDAV"] = { status: healthData.env.davEnabled ? "ok" : "info", message: healthData.env.davEnabled ? "已启用" : "未配置" };
    }

    const dbTables = healthData.db?.tables || [];
    const warnings = healthData.warnings || [];
    const taskAlert = taskAlertConfig || {};
    const taskAlertEnabled = taskAlert.enabled !== false;
    const taskAlertWindowHours = taskAlert.windowHours || 24;
    const taskAlertWarningCount = taskAlert.warningCount || 3;
    const taskAlertErrorCount = taskAlert.errorCount || 10;

    if (healthError) {
      return components.renderErrorCard({ icon: "", error: healthError, onRetry: "refresh-admin-health" });
    }

    return `
      <div class="ov-system">
        <div class="ov-system-header">
          <div class="ov-system-title-group">
            <h2 class="ov-system-title">系统管理</h2>
            <p class="ov-system-desc">健康监控、运维操作与自动化配置</p>
          </div>
          <button class="btn" type="button" data-action="refresh-admin-health" data-action2="refresh-admin-quota">
            刷新诊断
          </button>
        </div>

        <div class="ov-system-grid">
          <div class="ov-health">
            <div class="ov-health-header">
              <span class="ov-health-title">组件探针</span>
              <span class="ov-health-count">${Object.keys(sysComponents).length} 项</span>
            </div>
            <div class="ov-health-body">
              ${healthLoading
                ? `<div class="ov-empty-inline">诊断中...</div>`
                : `<div class="ov-health-grid">
                    ${Object.entries(sysComponents).map(([name, statusObj]) => {
                      const isOk = statusObj.status === "ok";
                      const isInfo = statusObj.status === "info";
                      const statusClass = isOk ? 'ov-health-ok' : isInfo ? 'ov-health-info' : 'ov-health-err';
                      return `
                        <div class="ov-health-item">
                          <div class="ov-health-item-info">
                            <span class="ov-health-name">${escapeHtml(name)}</span>
                            ${statusObj.message ? `<span class="ov-health-message">${escapeHtml(statusObj.message)}</span>` : ""}
                          </div>
                          <span class="ov-health-status ${statusClass}">
                            <span class="ov-health-dot"></span>
                            ${isOk ? "ONLINE" : isInfo ? "INFO" : "OFFLINE"}
                          </span>
                        </div>
                      `;
                    }).join("")}
                  </div>`
              }
            </div>
          </div>

          ${(() => {
            const davEnabled = healthData.env?.davEnabled || false;
            const origin = typeof location !== 'undefined' ? location.origin : '';
            const davUrl = origin ? `${origin}/dav/` : '/dav/';
            return `
              <div class="ov-system-info-card">
                <div class="ov-system-info-header">
                  <span class="ov-system-info-title">WebDAV</span>
                  <span class="ov-badge ${davEnabled ? 'ov-badge-ok' : 'ov-badge-info'}">${davEnabled ? '已启用' : '未配置'}</span>
                </div>
                <div class="ov-system-info-body">
                  ${davEnabled ? `
                    <div class="ov-webdav-conn">
                      <div class="ov-webdav-conn-row">
                        <span class="ov-webdav-conn-label">地址</span>
                        <code class="ov-webdav-conn-value" data-action="copy-webdav-url" data-url="${escapeHtml(davUrl)}">${escapeHtml(davUrl)}</code>
                        <button class="btn btn-sm" type="button" data-action="copy-webdav-url" data-url="${escapeHtml(davUrl)}">复制</button>
                      </div>
                      <div class="ov-webdav-conn-row">
                        <span class="ov-webdav-conn-label">用户名</span>
                        <span class="ov-webdav-conn-value">管理员用户名</span>
                      </div>
                      <div class="ov-webdav-conn-row">
                        <span class="ov-webdav-conn-label">密码</span>
                        <span class="ov-webdav-conn-value">管理员密码</span>
                      </div>
                    </div>
                    <details class="ov-webdav-clients" style="margin-top:12px;">
                      <summary style="cursor:pointer;font-size:12px;color:var(--muted);padding:4px 0;">客户端连接指南</summary>
                      <div style="margin-top:8px;">
                        <div class="ov-webdav-client-item">
                          <span class="ov-webdav-client-name">Windows</span>
                          <span class="ov-webdav-client-steps">此电脑 → 右键 → 添加网络位置</span>
                        </div>
                        <div class="ov-webdav-client-item">
                          <span class="ov-webdav-client-name">macOS</span>
                          <span class="ov-webdav-client-steps">前往 → 连接服务器</span>
                        </div>
                        <div class="ov-webdav-client-item">
                          <span class="ov-webdav-client-name">rclone</span>
                          <code class="ov-webdav-cmd">rclone config create odrive webdav url ${escapeHtml(davUrl)} user admin pass &lt;密码&gt;</code>
                        </div>
                      </div>
                    </details>
                    <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-size:11px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 8px;">
                      <span>浏览</span><span>下载</span><span>上传</span><span>删除</span><span>新建</span><span>移动</span><span>复制</span>
                      <span style="color:var(--line-strong);margin:0 2px;">|</span>
                      <span>DAV Level 1，无 LOCK，单次 PUT ≤100MB</span>
                    </div>
                  ` : `
                    <div style="padding:16px 0;text-align:center;font-size:13px;color:var(--muted);">
                      配置 <code>ADMIN_USERNAME</code> 和 <code>ADMIN_PASSWORD</code> 环境变量即可启用
                    </div>
                  `}
                </div>
              </div>`;
          })()}

          ${warnings.length > 0 ? `
            <div class="ov-system-warnings">
              <span class="ov-system-warnings-title">系统警告 (${warnings.length})</span>
              ${warnings.map(w => `
                <div class="ov-system-warning-item">
                  <span class="ov-system-warning-msg">${escapeHtml(w.message || w.title || "未知警告")}</span>
                </div>
              `).join("")}
            </div>
          ` : ""}

          <div class="ov-maintenance">
            <div class="ov-maintenance-header">
              <span class="ov-maintenance-title">运维指令</span>
            </div>
            <div class="ov-maintenance-body">
              ${maintenanceLoading
                ? `<div class="ov-empty-inline">载入中...</div>`
                : maintenanceError
                  ? `<div class="ov-empty-inline" style="color:var(--danger);">${escapeHtml(maintenanceError)}</div>`
                  : MAINTENANCE_ACTIONS.map(act => `
                    <div class="ov-maintenance-item">
                      <div class="ov-maintenance-info">
                        <span class="ov-maintenance-name" style="color:${act.danger ? 'var(--danger)' : 'var(--text)'};">${escapeHtml(act.label)}</span>
                        <span class="ov-maintenance-desc">${escapeHtml(act.desc)}</span>
                      </div>
                      <button class="btn ${act.danger ? 'btn-danger' : ''} btn-sm" type="button"
                              data-action="confirm-maintenance-action"
                              data-maintenance-action="${escapeHtml(act.action)}"
                              data-maintenance-label="${escapeHtml(act.label)}">执行</button>
                    </div>
                  `).join("")}
            </div>
          </div>

          <div class="ov-tasks">
            <div class="ov-tasks-header">
              <span class="ov-tasks-title">后台调度</span>
              <button class="btn btn-sm" type="button" data-action="refresh-tasks">刷新</button>
            </div>
            <div class="ov-tasks-body">
              <div class="ov-task-alert-rule">
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
                ? `<div class="ov-empty-inline">载入中...</div>`
                : tasks.length === 0
                  ? `<div class="ov-tasks-empty">
                      <span class="ov-tasks-empty-icon">📋</span>
                      <span class="ov-tasks-empty-text">无待命或执行中的系统队列</span>
                    </div>`
                  : `<div class="ov-tasks-list">
                      ${tasks.map(tsk => {
                        const progress = tsk.total > 0 ? Math.round((tsk.completed || 0) / tsk.total * 100) : 0;
                        const downloadUrl = tsk.type === "zip_download" && tsk.result?.downloadUrl ? tsk.result.downloadUrl : "";
                        return `
                          <div class="ov-task-item">
                            <div class="ov-task-info">
                              <span class="ov-task-status">队列: ${escapeHtml(tsk.status || "挂起")}</span>
                              <span class="ov-task-time">启动于 ${formatTime(tsk.createdAt)}</span>
                            </div>
                            <div class="ov-task-progress">
                              <div class="ov-task-progress-bar">
                                <div class="ov-task-progress-fill" style="width:${progress}%"></div>
                              </div>
                              <span class="ov-task-progress-text">${tsk.completed || 0}/${tsk.total || 0}</span>
                            </div>
                            ${downloadUrl ? `<a class="btn btn-sm" href="${escapeHtml(downloadUrl)}" target="_blank">下载结果</a>` : ""}
                          </div>
                        `;
                      }).join("")}
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
