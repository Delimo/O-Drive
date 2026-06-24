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
      <div class="ov-page" style="display:flex; flex-direction:column; gap:12px; height:100%; overflow:hidden; font-family:system-ui, sans-serif;">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:16px; font-weight:600; color:var(--text);">运维诊断</h2>
            <p class="ov-page-desc" style="margin:2px 0 0; font-size:11px; color:var(--muted);">执行系统元数据维护、垃圾文件清除及后台队列监控</p>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(12, 1fr); gap:20px; border-top:1px solid var(--line); padding-top:16px; flex:1; min-h-0;">
          
          <!-- 左侧：指令列表 (7 columns) -->
          <div style="grid-column: span 7; display:flex; flex-direction:column; justify-content:space-between; min-h-0;">
            <div style="display:flex; flex-direction:column; gap:8px;">
              <h3 style="margin:0 0 4px 0; font-size:12px; font-weight:600; color:var(--text); text-transform:uppercase; letter-spacing:0.03em;">运维指令控制</h3>
              ${MAINTENANCE_ACTIONS.map(act => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:12px; gap:8px;">
                  <div style="min-width:0;">
                    <div style="font-weight:600; color:${act.danger ? "var(--danger)" : "var(--text)"};">${escapeHtml(act.label)}</div>
                    <div style="font-size:11px; color:var(--muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(act.desc)}</div>
                  </div>
                  <button class="btn" type="button" 
                          data-action="confirm-maintenance-action" 
                          data-maintenance-action="${escapeHtml(act.action)}" 
                          data-maintenance-label="${escapeHtml(act.label)}"
                          style="font-size:11px; padding:3px 8px; border:1px solid var(--line); border-radius:4px; background:transparent; color:${act.danger ? "var(--danger)" : "var(--text)"};">
                    执行
                  </button>
                </div>
              `).join("")}
            </div>

            <!-- 时效联动 -->
            <div style="display:flex; align-items:center; gap:8px; border-top:1px solid var(--line); padding-top:12px; font-size:12px;">
              <span style="color:var(--muted);">垃圾时效设定:</span>
              <input class="input" type="number" data-binding="trash-retention-days" value="${trashRetention ? trashRetention.days : 7}" style="width:50px; padding:3px; font-size:11px; border:1px solid var(--line); background:transparent; text-align:center;">
              <button class="btn" type="button" data-action="save-trash-retention" style="font-size:11px; padding:3px 8px; border:1px solid var(--line); background:transparent; border-radius:4px;">保存</button>
            </div>
          </div>

          <!-- 右侧：后台队列任务 (5 columns) -->
          <div style="grid-column: span 5; border-left:1px solid var(--line); padding-left:20px; display:flex; flex-direction:column; min-h-0;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
              <h3 style="margin:0; font-size:12px; font-weight:600; color:var(--text); text-transform:uppercase; letter-spacing:0.03em;">后台调度流</h3>
              <button class="btn" type="button" data-action="refresh-tasks" style="font-size:10px; padding:1px 4px; border:1px solid var(--line); background:transparent;">刷新</button>
            </div>

            <div style="flex:1; overflow-y:auto; max-height:200px;">
              ${tasksLoading ? `
                <p style="font-size:11px; color:var(--muted); padding:8px 0;">载入中...</p>
              ` : tasks.length === 0 ? `
                <p style="font-size:11px; color:var(--muted); padding:24px 0; margin:0;">无待命或执行中的系统队列</p>
              ` : tasks.map(tsk => `
                <div style="padding:6px 0; border-bottom:1px dashed var(--line); font-size:11px;">
                  <div style="display:flex; justify-content:space-between; font-weight:500;">
                    <span style="color:var(--text);">队列状态: ${escapeHtml(tsk.status || "挂起")}</span>
                    <span style="color:var(--accent);">${tsk.completed || 0}/${tsk.total || 0}</span>
                  </div>
                  <div style="color:var(--muted); font-size:10px; margin-top:2px;">启动于: ${formatTime(tsk.createdAt)}</div>
                </div>
              `).join("")}
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