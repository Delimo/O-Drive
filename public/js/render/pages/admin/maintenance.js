export function createMaintenanceRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  const MAINTENANCE_ACTIONS = [
    { action: "rebuild-index", label: "同步元数据库索引", desc: "对齐元数据库数据状态。", danger: false },
    { action: "clear-cache", label: "清理缓存数据库", desc: "强制刷洗 Redis 本地暂存层。", danger: false },
    { action: "purge-trash", label: "同步清除废弃文件", desc: "物理清除已过期回收站数据。", danger: true }
  ];

  function renderAdminMaintenanceSection(admin) {
    const { maintenance, maintenanceLoading, maintenanceError, tasks = [], tasksLoading, trashRetention } = admin;

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
                ${MAINTENANCE_ACTIONS.map(act => `
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
                `).join("")}
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
    MAINTENANCE_ACTIONS
  };
}
