import { MAINTENANCE_ACTIONS } from "./utils.js";

export function createSystemRenderer({
  safeText, escapeHtml, renderEmptyState, renderEmptyStateCompact, formatTime, formatRelative, formatBytes, components
}) {

  function renderSystemSection(admin) {
    const {
      healthLoading, healthError,
      maintenanceLoading, maintenanceError,
      tasks = [], tasksLoading,
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
      sysComponents["Token密钥"] = { status: healthData.env.tokenSecret?.bound ? "ok" : "error", message: "" };
      sysComponents["访客模式"] = { status: healthData.env.guestEnabled ? "ok" : "info", message: healthData.env.guestEnabled ? "已启用" : "已禁用" };
      sysComponents["WebDAV"] = { status: healthData.env.davEnabled ? "ok" : "info", message: healthData.env.davEnabled ? "已启用" : "未配置" };
    }

    const dbTables = healthData.db?.tables || [];
    const warnings = healthData.warnings || [];

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

          <div class="ov-system-info-card">
            <div class="ov-system-info-header">
              <span class="ov-system-info-title">系统信息</span>
            </div>
            <div class="ov-system-info-body">
              <div class="ov-system-info-grid">
                <div class="ov-system-info-item">
                  <span class="ov-system-info-label">版本</span>
                  <span class="ov-system-info-value">v1.0.0</span>
                </div>
                <div class="ov-system-info-item">
                  <span class="ov-system-info-label">环境</span>
                  <span class="ov-system-info-value">${healthData.env?.guestEnabled !== undefined ? "生产" : "开发"}</span>
                </div>
                <div class="ov-system-info-item">
                  <span class="ov-system-info-label">数据库表</span>
                  <span class="ov-system-info-value">${dbTables.length} 张</span>
                </div>
                <div class="ov-system-info-item">
                  <span class="ov-system-info-label">访客模式</span>
                  <span class="ov-system-info-value">${healthData.env?.guestEnabled ? "启用" : "禁用"}</span>
                </div>
                <div class="ov-system-info-item">
                  <span class="ov-system-info-label">WebDAV</span>
                  <span class="ov-system-info-value">${healthData.env?.davEnabled ? "已启用" : "未配置"}</span>
                </div>
              </div>
              ${healthData.env?.davEnabled ? `
                <div class="ov-system-info-detail">
                  <span class="ov-system-info-label">WebDAV 地址</span>
                  <code class="ov-system-info-code">${escapeHtml(typeof location !== 'undefined' ? location.origin : '')}/dav/</code>
                </div>
              ` : ""}
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
            </div>
          </div>

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
