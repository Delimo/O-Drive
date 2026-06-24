export function createMaintenanceRenderer({
  icons, safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  const MAINTENANCE_ACTIONS = [
    { action: "rebuild-index", label: "重建元数据索引", desc: "完整遍历数据库与存储桶，更正文件状态不一致问题。", danger: false },
    { action: "clear-cache", label: "清空全局缓存", desc: "抹去 Redis 或 KV 内关于目录结构的本地临时缓存。", danger: false },
    { action: "purge-trash", label: "回收站即刻强制清空", desc: "物理清除已经处于删除状态超过保留期限的所有文件。", danger: true }
  ];

  function renderAdminMaintenanceSection(admin) {
    const { maintenance, maintenanceLoading, maintenanceError, tasks = [], tasksLoading, trashRetention, trashRetentionLoading } = admin;

    if (maintenanceError) {
      return components.renderErrorCard({ icon: icons.refresh, error: maintenanceError, onRetry: "refresh-admin-maintenance" });
    }
    if (maintenanceLoading) {
      return renderEmptyStateCompact("正在获取系统维护状况", "请稍候...", icons.spinner);
    }

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px;">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:20px; font-weight:700; color:var(--text);">运维工具</h2>
            <p class="ov-page-desc" style="margin:4px 0 0; font-size:13px; color:var(--muted);">针对文件索引、系统缓存以及垃圾数据进行集中管理维护与调度</p>
          </div>
        </div>

        <div class="admin-grid" style="display:grid; grid-template-columns: repeat(12, 1fr); gap:16px;">
          
          <!-- 左侧：主要运维工具箱 (7 columns) -->
          <div style="grid-column: span 7; display:flex; flex-direction:column; gap:14px;">
            <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px;">
              <h3 style="margin:0 0 16px 0; font-size:15px; font-weight:700; color:var(--text);">深度运维工具箱</h3>
              <div style="display:flex; flex-direction:column; gap:12px;">
                ${MAINTENANCE_ACTIONS.map(act => `
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; padding:12px; background:var(--panel-soft); border:1px solid var(--line); border-radius:10px;">
                    <div style="min-width:0;">
                      <div style="font-size:13px; font-weight:600; color:${act.danger ? "var(--danger)" : "var(--text)"};">${escapeHtml(act.label)}</div>
                      <div style="font-size:12px; color:var(--muted); margin-top:4px; line-height:1.4;">${escapeHtml(act.desc)}</div>
                    </div>
                    <button class="btn ${act.danger ? "btn-danger" : "btn-primary"}" type="button" 
                            data-action="confirm-maintenance-action" 
                            data-maintenance-action="${escapeHtml(act.action)}" 
                            data-maintenance-label="${escapeHtml(act.label)}"
                            style="font-size:12px; font-weight:600; padding:8px 14px; border-radius:8px; flex-shrink:0;">
                      执行
                    </button>
                  </div>
                `).join("")}
              </div>
            </div>

            <!-- 回收站联动输入设定 -->
            <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px;">
              <h3 style="margin:0 0 12px 0; font-size:14px; font-weight:600; color:var(--text);">回收站保留时效联动</h3>
              <div style="display:flex; gap:10px; align-items:center;">
                <div style="position:relative; flex:1;">
                  <input class="input" type="number" data-binding="trash-retention-days" value="${trashRetention ? trashRetention.days : 7}" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:var(--panel-soft); font-size:13px;">
                  <span style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:12px; color:var(--muted);">天</span>
                </div>
                <button class="btn btn-primary" type="button" data-action="save-trash-retention" style="padding:8px 16px; font-size:13px; font-weight:600; border-radius:8px;">
                  保存
                </button>
              </div>
            </div>
          </div>

          <!-- 右侧：正在调度的队列/后台任务 (5 columns) -->
          <div style="grid-column: span 5; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px; display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h3 style="margin:0; font-size:15px; font-weight:700; color:var(--text);">后台任务监控队列</h3>
              <button class="btn" type="button" data-action="refresh-tasks" style="padding:4px; width:24px; height:24px; border-radius:6px; border:1px solid var(--line); background:var(--panel); color:var(--muted);">
                ${icons.refresh}
              </button>
            </div>

            <div style="flex:1; overflow-y:auto; max-height:360px;">
              ${tasksLoading ? `
                <p style="text-align:center; font-size:12px; color:var(--muted); padding:32px 0;">加载队列中...</p>
              ` : tasks.length === 0 ? `
                <div style="text-align:center; padding:32px 0; color:var(--muted);">
                  <div style="width:32px; height:32px; margin:0 auto 8px auto;">${icons.check}</div>
                  <p style="font-size:12px; margin:0;">当前无活跃队列任务</p>
                </div>
              ` : `
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${tasks.map(tsk => `
                    <div style="padding:10px; border-radius:8px; border:1px solid var(--line); background:var(--panel-soft); font-size:12px;">
                      <div style="display:flex; justify-content:space-between; font-weight:600;">
                        <span style="color:var(--text);">任务: ${escapeHtml(tsk.status || "执行中")}</span>
                        <span style="color:var(--accent);">${tsk.completed || 0}/${tsk.total || 0}</span>
                      </div>
                      <div style="font-size:11px; color:var(--muted); margin-top:4px;">建立时间: ${formatTime(tsk.createdAt)}</div>
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
    renderAdminMaintenanceSection,
    MAINTENANCE_ACTIONS
  };
}