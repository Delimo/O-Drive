export function createSystemRenderer({
  safeText, escapeHtml, renderEmptyState, renderEmptyStateCompact, formatTime, formatRelative, formatBytes, components
}) {

  const MAINTENANCE_ACTIONS = [
    { action: "rebuild-index", label: "同步元数据库索引", desc: "对齐元数据库数据状态。", danger: false },
    { action: "clear-cache", label: "清理缓存数据库", desc: "强制刷洗 Redis 本地暂存层。", danger: false },
    { action: "purge-trash", label: "同步清除废弃文件", desc: "物理清除已过期回收站数据。", danger: true }
  ];

  function renderSystemSection(admin) {
    const {
      healthLoading, healthError,
      maintenanceLoading, maintenanceError,
      tasks = [], tasksLoading
    } = admin;

    const healthData = admin.health || {};
    const sysComponents = {};
    if (healthData.db) {
      sysComponents["数据库"] = { status: healthData.db.ok ? "ok" : "error", message: healthData.db.message || "" };
    }
    if (healthData.r2) {
      sysComponents["对象存储"] = { status: healthData.r2.ok ? "ok" : "error", message: healthData.r2.message || "" };
    }
    if (healthData.env) {
      sysComponents["管理员账户"] = { status: healthData.env.adminUsername && healthData.env.adminPassword ? "ok" : "error", message: "" };
      sysComponents["Token密钥"] = { status: healthData.env.tokenSecret?.bound ? "ok" : "error", message: "" };
    }

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
        </div>

        <div class="ov-system-middle">
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
                  ? `<div class="ov-empty-inline">无待命或执行中的系统队列</div>`
                  : `<div class="ov-tasks-list">
                      ${tasks.map(tsk => `
                        <div class="ov-task-item">
                          <div class="ov-task-info">
                            <span class="ov-task-status">队列: ${escapeHtml(tsk.status || "挂起")}</span>
                            <span class="ov-task-time">启动于 ${formatTime(tsk.createdAt)}</span>
                          </div>
                          <span class="ov-badge ov-badge-info">${tsk.completed || 0}/${tsk.total || 0}</span>
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
