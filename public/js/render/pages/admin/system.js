import {
  ADVANCED_MAINTENANCE_ACTIONS,
  COMMON_MAINTENANCE_ACTIONS,
} from "./utils.js";

export function createSystemRenderer({
  safeText, escapeHtml, renderEmptyState, renderEmptyStateCompact, formatTime, formatRelative, formatBytes, components
}) {
  function taskTypeLabel(type) {
    if (type === "zip_download") return "ZIP 下载";
    if (type === "upload") return "上传队列";
    return type || "后台任务";
  }

  function taskStatusLabel(status) {
    if (status === "completed") return "已完成";
    if (status === "running") return "执行中";
    if (status === "failed") return "失败";
    if (status === "partial") return "部分失败";
    if (status === "pending") return "等待中";
    return status || "挂起";
  }

  function renderMaintenanceItem(act) {
    return `
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
    `;
  }

  function renderMaintenanceActions() {
    return `
      ${COMMON_MAINTENANCE_ACTIONS.map(renderMaintenanceItem).join("")}
      <details class="ov-maintenance-advanced">
        <summary class="ov-maintenance-advanced-trigger">显示高级清理</summary>
        <div class="ov-maintenance-advanced-body">
          ${ADVANCED_MAINTENANCE_ACTIONS.map(renderMaintenanceItem).join("")}
        </div>
      </details>
    `;
  }

  function taskStatusClass(status) {
    if (status === "completed") return "ov-task-state-ok";
    if (status === "failed") return "ov-task-state-error";
    if (status === "partial") return "ov-task-state-warning";
    if (status === "running") return "ov-task-state-running";
    return "ov-task-state-muted";
  }

  function buildTaskDiagnostics(tsk, progress, canRetry, downloadUrl) {
    const details = [];
    const result = tsk.result || {};
    const payload = tsk.payload || {};

    if (tsk.type === "zip_download") {
      if (downloadUrl) details.push("结果可下载");
      else if (tsk.status === "completed") details.push("结果链接缺失，请检查 ZIP 任务产物");
      else if (tsk.status === "failed") details.push(canRetry ? "ZIP 生成失败，可重试" : "ZIP 生成失败");
      else if (tsk.status === "running") details.push(`正在打包 ${progress}%`);
      else details.push("等待后台打包");

      const outputName = result.filename || payload.filename || result.name || "";
      if (outputName) details.push(`文件：${outputName}`);
      if (result.outputKey) details.push(`产物：${result.outputKey}`);
      if (result.size) details.push(`大小：${formatBytes(result.size)}`);
    } else if (tsk.type === "upload") {
      const failedCount = Number(tsk.failed || 0);
      if (failedCount > 0) details.push(`失败 ${failedCount} 个`);
      if (tsk.status === "partial") details.push("上传任务部分完成，请查看上传面板诊断");
      if (tsk.status === "failed") details.push("上传任务失败，请重新选择失败文件");
    } else if (canRetry) {
      details.push("失败任务可重试");
    }

    if (tsk.error) details.push(`错误：${tsk.error}`);
    if (tsk.finishedAt) details.push(`结束：${formatTime(tsk.finishedAt)}`);
    else if (tsk.updatedAt) details.push(`更新：${formatTime(tsk.updatedAt)}`);

    return details.filter(Boolean);
  }

  function renderSystemSection(admin) {
    const {
      healthLoading, healthError,
      maintenanceLoading, maintenanceError,
      tasks = [], tasksLoading, taskRetryingId = "",
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
              <div class="ov-system-info-card ov-webdav-card">
                <div class="ov-system-info-header">
                  <span class="ov-system-info-title">WebDAV</span>
                  ${components.renderBadge({
                    label: davEnabled ? "已启用" : "未配置",
                    className: davEnabled ? "ov-badge-ok" : "ov-badge-info",
                  })}
                </div>
                <div class="ov-system-info-body">
                  ${davEnabled ? `
                    <div class="ov-webdav-panel">
                      <div class="ov-webdav-endpoint">
                        <div class="ov-webdav-endpoint-head">
                          <span class="ov-webdav-eyebrow">连接地址</span>
                          <span class="ov-webdav-live"><span class="ov-webdav-live-dot"></span>服务可用</span>
                        </div>
                        <div class="ov-webdav-url-row">
                          <code class="ov-webdav-url" data-action="copy-webdav-url" data-url="${escapeHtml(davUrl)}">${escapeHtml(davUrl)}</code>
                          <button class="btn btn-sm" type="button" data-action="copy-webdav-url" data-url="${escapeHtml(davUrl)}">复制</button>
                        </div>
                      </div>

                      <div class="ov-webdav-facts">
                        <div class="ov-webdav-fact">
                          <span>协议</span>
                          <strong>DAV Level 1</strong>
                        </div>
                        <div class="ov-webdav-fact">
                          <span>用户名</span>
                          <strong>管理员用户名</strong>
                        </div>
                        <div class="ov-webdav-fact">
                          <span>密码</span>
                          <strong>管理员密码</strong>
                        </div>
                        <div class="ov-webdav-fact">
                          <span>上传限制</span>
                          <strong>单次 PUT &le; 100MB</strong>
                        </div>
                      </div>

                      <div class="ov-webdav-foot">
                        <div class="ov-webdav-limits">
                          <span>不支持 LOCK</span>
                          <span>使用后台账号认证</span>
                        </div>
                        <div class="ov-webdav-ops" aria-label="WebDAV 支持的操作">
                          <span class="ov-webdav-op">浏览</span>
                          <span class="ov-webdav-op">下载</span>
                          <span class="ov-webdav-op">上传</span>
                          <span class="ov-webdav-op">新建</span>
                          <span class="ov-webdav-op">删除</span>
                          <span class="ov-webdav-op">移动</span>
                          <span class="ov-webdav-op">复制</span>
                        </div>
                      </div>
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

          <div class="ov-maintenance ov-maintenance-has-advanced">
            <div class="ov-maintenance-header">
              <span class="ov-maintenance-title">运维指令</span>
            </div>
            <div class="ov-maintenance-body">
              ${maintenanceLoading
                ? `<div class="ov-empty-inline">载入中...</div>`
                : maintenanceError
                  ? `<div class="ov-empty-inline" style="color:var(--danger);">${escapeHtml(maintenanceError)}</div>`
                  : renderMaintenanceActions()}
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
                        const canRetry = ["failed", "partial"].includes(tsk.status || "") && tsk.type !== "upload";
                        const retrying = taskRetryingId === tsk.id;
                        const details = buildTaskDiagnostics(tsk, progress, canRetry, downloadUrl);
                        return `
                          <div class="ov-task-item" data-task-type="${escapeHtml(tsk.type || "")}" data-task-status="${escapeHtml(tsk.status || "")}">
                            <div class="ov-task-info">
                              <div class="ov-task-title-row">
                                <span class="ov-task-status">${escapeHtml(taskTypeLabel(tsk.type))}</span>
                                <span class="ov-task-state ${taskStatusClass(tsk.status)}">${escapeHtml(taskStatusLabel(tsk.status))}</span>
                              </div>
                              <span class="ov-task-time">启动于 ${formatTime(tsk.createdAt)}</span>
                              ${details.length ? `<div class="ov-task-diagnostics">
                                ${details.map(detail => `<span class="ov-task-diagnostic">${escapeHtml(detail)}</span>`).join("")}
                              </div>` : ""}
                            </div>
                            <div class="ov-task-progress">
                              <div class="ov-task-progress-bar">
                                <div class="ov-task-progress-fill" style="width:${progress}%"></div>
                              </div>
                              <span class="ov-task-progress-text">${tsk.completed || 0}/${tsk.total || 0}</span>
                            </div>
                            ${downloadUrl ? `<a class="btn btn-sm" href="${escapeHtml(downloadUrl)}" target="_blank">下载结果</a>` : ""}
                            ${canRetry ? `<button class="btn btn-sm" type="button" data-action="retry-task" data-id="${escapeHtml(tsk.id)}" ${retrying ? "disabled" : ""}>${retrying ? "重试中..." : "重试"}</button>` : ""}
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
