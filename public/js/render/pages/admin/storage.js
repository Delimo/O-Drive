export function createStorageRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  const MAINTENANCE_ACTIONS = [
    { action: "rebuild-index", label: "同步元数据库索引", desc: "对齐元数据库数据状态。", danger: false },
    { action: "clear-cache", label: "清理缓存数据库", desc: "强制刷洗 Redis 本地暂存层。", danger: false },
    { action: "purge-trash", label: "同步清除废弃文件", desc: "物理清除已过期回收站数据。", danger: true }
  ];

  function renderStorageSection(admin) {
    const {
      storageConfig, storageConfigLoading, storageConfigError,
      trashRetention, trashRetentionLoading, trashCleanupBusy,
      maintenance, maintenanceLoading, maintenanceError,
      tasks = [], tasksLoading
    } = admin;

    if (storageConfigError) {
      return components.renderErrorCard({ icon: "", error: storageConfigError, onRetry: "refresh-admin-storage-config" });
    }
    if (storageConfigLoading || !storageConfig) {
      return renderEmptyStateCompact("载入中", "读取存储桶配额...", "");
    }

    const r2 = storageConfig.r2 || {};
    const usedPercent = r2.usedPercent || 0;
    const fillColor = usedPercent > 80 ? 'var(--danger)' : usedPercent > 60 ? 'var(--warning)' : 'var(--accent)';

    return `
      <div class="ov-storage">
        <div class="ov-storage-header">
          <div class="ov-storage-title-group">
            <h2 class="ov-storage-title">存储与维护</h2>
            <p class="ov-storage-desc">存储配额、回收站策略与系统运维</p>
          </div>
        </div>

        <div class="ov-storage-top">
          <div class="ov-storage-quota">
            <div class="ov-quota-header">
              <span class="ov-quota-title">存储配额</span>
              <button class="btn btn-sm" type="button" data-action="show-edit-storage-quota">调整限额</button>
            </div>
            <div class="ov-quota-body">
              <div class="ov-quota-info">
                <span class="ov-quota-label">R2 实例</span>
                <span class="ov-quota-name">${escapeHtml(r2.name || "bucket")}</span>
              </div>
              <div class="ov-quota-stats">
                <div class="ov-quota-stat">
                  <span class="ov-quota-stat-label">已使用</span>
                  <span class="ov-quota-stat-value">${safeText(r2.usedFormatted)}</span>
                </div>
                <div class="ov-quota-stat">
                  <span class="ov-quota-stat-label">配额上限</span>
                  <span class="ov-quota-stat-value">${safeText(r2.quotaFormatted)}</span>
                </div>
                <div class="ov-quota-stat">
                  <span class="ov-quota-stat-label">使用率</span>
                  <span class="ov-quota-stat-value" style="color:${fillColor};">${usedPercent}%</span>
                </div>
              </div>
              <div class="ov-quota-track">
                <div class="ov-quota-fill" style="width:${usedPercent}%;background:${fillColor};"></div>
              </div>
            </div>
          </div>

          <div class="ov-storage-trash">
            <div class="ov-trash-header">
              <span class="ov-trash-title">回收站策略</span>
            </div>
            <div class="ov-trash-body">
              <p class="ov-trash-desc">设置已删除文件在系统内被永久抹除前的暂存天数。</p>
              <div class="ov-trash-input-row">
                <input class="input" type="number" data-binding="trash-retention-days"
                       value="${trashRetention ? trashRetention.days : 7}" style="width:60px;text-align:center;">
                <span class="ov-trash-unit">天</span>
                <button class="btn btn-primary btn-sm" style="margin-left:auto;" type="button"
                        data-action="save-trash-retention">保存</button>
              </div>
              <div class="ov-trash-divider"></div>
              <div class="ov-trash-cleanup">
                <span class="ov-trash-cleanup-label">强制清空回收站</span>
                <button class="btn btn-danger btn-sm" type="button"
                        data-action="cleanup-trash-by-retention" ${trashCleanupBusy ? 'disabled' : ''}>
                  ${trashCleanupBusy ? '清理中...' : '立即清理'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="ov-storage-bottom">
          <div class="ov-maintenance">
            <div class="ov-maintenance-header">
              <span class="ov-maintenance-title">运维指令</span>
            </div>
            <div class="ov-maintenance-body">
              ${MAINTENANCE_ACTIONS.map(act => `
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
    renderStorageSection,
    renderAdminStorageSection: renderStorageSection
  };
}
