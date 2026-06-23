export function createMaintenanceRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyStateCompact,
  components,
}) {
  const MAINTENANCE_ACTIONS = [
    { action: "rebuild-index", label: "重建文件索引", desc: "从 R2 存储重新扫描并同步文件索引表，修复索引与存储不一致的问题。", danger: false },
    { action: "cleanup-access-attempts", label: "清理访问记录", desc: "删除所有路径访问失败记录，释放数据库空间。", danger: false },
    { action: "cleanup-thumbnails", label: "清理缩略图缓存", desc: "删除 R2 中所有缩略图缓存对象，释放存储空间。", danger: false },
    { action: "cleanup-logs", label: "清理旧操作日志", desc: "删除超过保留期限的操作日志记录，释放数据库空间。", danger: false },
    { action: "cleanup-tasks", label: "清理已完成任务", desc: "删除所有已完成的后台文件任务记录，释放数据库空间。", danger: false },
    { action: "cleanup-warnings", label: "确认系统提醒", desc: "将所有未确认的系统提醒标记为已确认，清除提醒标记。", danger: false },
  ];

  function renderAdminMaintenanceSection(admin) {
    const { maintenance, maintenanceLoading, maintenanceError, maintenanceBusyAction } = admin;
    const { tasks, tasksLoading } = admin;
    const { trashRetention, trashRetentionLoading, trashCleanupBusy } = admin;

    let maintStatsHtml = "";
    if (maintenanceError) {
      maintStatsHtml = `<div class="empty-state"><p class="empty-copy">${escapeHtml(maintenanceError)}</p></div>`;
    } else if (maintenanceLoading || !maintenance) {
      maintStatsHtml = renderEmptyStateCompact("加载中", "正在获取系统维护快照...", icons.spinner);
    } else {
      maintStatsHtml = `
        <div class="ov2-hero" style="grid-template-columns:repeat(4,1fr)">
          <div class="ov2-hero-card">
            <div class="ov2-hero-body">
              <span class="admin-label">索引记录</span>
              <div class="admin-value">${safeText(maintenance.indexCount, "0")}</div>
              <div class="admin-copy">${safeText(maintenance.indexTotalSizeFormatted, "0 B")}${maintenance.indexFresh ? " · 已同步" : " · 待同步"}</div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-body">
              <span class="admin-label">R2 对象</span>
              <div class="admin-value">${safeText(maintenance.r2SampleCount, "0")}</div>
              <div class="admin-copy">${maintenance.r2SampleTruncated ? "超 1000 条" : "可见对象数"}</div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-body">
              <span class="admin-label">访问记录</span>
              <div class="admin-value">${safeText(maintenance.accessAttemptCount, "0")}</div>
              <div class="admin-copy">失败记录数</div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-body">
              <span class="admin-label">回收站</span>
              <div class="admin-value">${safeText(maintenance.trashCount, "0")}</div>
              <div class="admin-copy">当前回收站项目</div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-body">
              <span class="admin-label">操作日志</span>
              <div class="admin-value">${safeText(maintenance.logsCount, "0")}</div>
              <div class="admin-copy">总记录数</div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-body">
              <span class="admin-label">后台任务</span>
              <div class="admin-value">${safeText(maintenance.taskCount, "0")}</div>
              <div class="admin-copy">待处理任务</div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-body">
              <span class="admin-label">缩略图缓存</span>
              <div class="admin-value" style="font-size:16px;">${maintenance.thumbnailsPresent ? "有缓存" : "无缓存"}</div>
              <div class="admin-copy">.thumbs/ 系统前缀</div>
            </div>
          </div>
        </div>
        <div class="admin-action-grid" style="margin-top:8px;">
          ${MAINTENANCE_ACTIONS.map((item) => {
            const busy = maintenanceBusyAction === item.action;
            return `
              <div class="admin-action-card" style="padding:10px 12px;">
                <div class="admin-label" style="font-size:11px;">${escapeHtml(item.label)}</div>
                <div class="admin-copy" style="font-size:11px;">${escapeHtml(item.desc)}</div>
                <button class="btn ${item.danger ? "btn-danger" : "btn-primary"}" type="button" style="min-height:28px;padding:0 10px;font-size:11px;margin-top:6px;"
                  data-action="confirm-maintenance-action"
                  data-maintenance-action="${escapeHtml(item.action)}"
                  data-maintenance-label="${escapeHtml(item.label)}"
                  ${busy ? "disabled" : ""}>
                  ${busy ? icons.spinner : ""}
                  <span>${busy ? "执行中..." : "执行"}</span>
                </button>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    let retentionHtml = "";
    if (trashRetentionLoading) {
      retentionHtml = renderEmptyStateCompact("加载中", "正在获取回收站保留天数...", icons.spinner);
    } else {
      const currentDays = trashRetention?.days ?? 0;
      retentionHtml = `
        <div class="sr-retention-form">
          <div class="sr-retention-input-group">
            <label class="sr-retention-label">保留天数（0 为不自动清理）</label>
            <div class="sr-retention-row">
              <input class="input" type="number" min="0" max="3650" value="${currentDays}" data-binding="trash-retention-days">
              <button class="btn btn-primary" type="button" data-action="save-trash-retention" ${trashCleanupBusy ? "disabled" : ""} style="min-height:32px;padding:0 12px;font-size:13px;border-radius:8px;">保存设置</button>
              <button class="btn toolbar-btn" type="button" data-action="cleanup-trash-by-retention" ${trashCleanupBusy ? "disabled" : ""} style="min-height:32px;padding:0 12px;font-size:13px;border-radius:8px;">
                ${trashCleanupBusy ? "清理中..." : "按保留天数清理"}
              </button>
            </div>
          </div>
          ${currentDays > 0
            ? `<div class="sr-retention-hint"><span class="badge badge-info">自动清理</span> 超过 ${currentDays} 天的回收站项目将被自动清除</div>`
            : `<div class="sr-retention-hint"><span class="badge badge-warning">未设置</span> 未设置保留天数，不会自动清理</div>`}
        </div>
      `;
    }

    let tasksHtml = "";
    if (tasksLoading) {
      tasksHtml = renderEmptyStateCompact("加载中", "正在获取任务列表...", icons.spinner);
    } else if (!tasks || !tasks.length) {
      tasksHtml = renderEmptyStateCompact("暂无任务", "当前没有后台任务在运行。", icons.list);
    } else {
      const fmtTime = (ts) => {
        if (!ts) return "-";
        const d = new Date(ts);
        return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      };
      const statusLabel = (status) => {
        if (status === "completed") return '<span class="badge badge-success">完成</span>';
        if (status === "partial") return '<span class="badge badge-warning">部分失败</span>';
        if (status === "failed") return '<span class="badge badge-error">失败</span>';
        if (status === "running") return '<span class="badge badge-info">运行中</span>';
        return '<span class="badge">待处理</span>';
      };
      tasksHtml = `
        <div class="table-wrap">
          <table class="data-table-compact">
            <thead><tr><th>文件数</th><th>进度</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              ${tasks.map((t) => {
                const files = t.payload?.files || [];
                const fileList = files.slice(0, 3).map((f) => escapeHtml(f.name)).join(", ") + (files.length > 3 ? ` 等 ${files.length} 个` : "");
                return `<tr><td>${escapeHtml(fileList)}</td><td>${t.completed || 0}/${t.total || 0}</td><td>${statusLabel(t.status)}</td><td>${fmtTime(t.createdAt)}</td></tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    return `
      <div class="ov-page">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title">维护</h2>
            <p class="ov-page-desc">系统维护操作、回收站策略与后台任务</p>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-header">
            <div class="admin-card-icon" style="background:rgba(14,116,144,0.1);color:#0e7490">${icons.stats}</div>
            <span class="admin-label">系统快照</span>
          </div>
          ${maintStatsHtml}
        </div>

        <div class="admin-card">
          <div class="admin-card-header">
            <div class="admin-card-icon" style="background:rgba(217,119,6,0.1);color:#d97706">${icons.trash}</div>
            <span class="admin-label">回收站自动清理</span>
          </div>
          ${retentionHtml}
        </div>

        <div class="admin-card">
          <div class="admin-card-header">
            <div class="admin-card-icon" style="background:rgba(5,150,105,0.1);color:#059669">${icons.list}</div>
            <span class="admin-label">后台任务</span>
          </div>
          ${tasksHtml}
        </div>
      </div>
    `;
  }

  function renderAdminTaskListSection(admin) {
    const { tasks, tasksLoading } = admin;
    if (tasksLoading) return renderEmptyStateCompact("加载中", "正在获取任务列表...", icons.spinner);
    if (!tasks || !tasks.length) return "";
    const fmtTime = (ts) => {
      if (!ts) return "-";
      const d = new Date(ts);
      return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    };
    const statusLabel = (status) => {
      if (status === "completed") return '<span class="badge badge-success">完成</span>';
      if (status === "partial") return '<span class="badge badge-warning">部分失败</span>';
      if (status === "failed") return '<span class="badge badge-error">失败</span>';
      if (status === "running") return '<span class="badge badge-info">运行中</span>';
      return '<span class="badge">待处理</span>';
    };
    return `
      <div class="table-wrap" style="margin-top:12px;">
        <table class="data-table">
          <thead><tr><th>文件数</th><th>进度</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>
            ${tasks.map((t) => {
              const files = t.payload?.files || [];
              const fileList = files.slice(0, 3).map((f) => escapeHtml(f.name)).join(", ") + (files.length > 3 ? ` 等 ${files.length} 个` : "");
              return `<tr><td>${escapeHtml(fileList)}</td><td>${t.completed || 0}/${t.total || 0}</td><td>${statusLabel(t.status)}</td><td>${fmtTime(t.createdAt)}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  return {
    MAINTENANCE_ACTIONS,
    renderAdminMaintenanceSection,
    renderAdminTaskListSection,
  };
}
