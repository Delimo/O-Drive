export function createMaintenanceRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyStateCompact,
  components,
}) {
  const MAINTENANCE_ACTIONS = [
    {
      action: "rebuild-index",
      label: "重建文件索引",
      desc: "从 R2 存储重新扫描并同步文件索引表，修复索引与存储不一致的问题。",
      danger: false,
    },
    {
      action: "cleanup-access-attempts",
      label: "清理访问记录",
      desc: "删除所有路径访问失败记录，释放数据库空间。",
      danger: false,
    },
    {
      action: "cleanup-thumbnails",
      label: "清理缩略图缓存",
      desc: "删除 R2 中所有缩略图缓存对象，释放存储空间。",
      danger: false,
    },
    {
      action: "cleanup-logs",
      label: "清理旧操作日志",
      desc: "删除超过保留期限的操作日志记录，释放数据库空间。",
      danger: false,
    },
    {
      action: "cleanup-tasks",
      label: "清理已完成任务",
      desc: "删除所有已完成的后台文件任务记录，释放数据库空间。",
      danger: false,
    },
    {
      action: "cleanup-warnings",
      label: "确认系统提醒",
      desc: "将所有未确认的系统提醒标记为已确认，清除提醒标记。",
      danger: false,
    },
  ];

  function renderAdminMaintenanceSection(admin) {
    const {
      maintenance,
      maintenanceLoading,
      maintenanceError,
      maintenanceBusyAction,
    } = admin;
    const { tasks, tasksLoading } = admin;

    let maintenanceHtml = "";
    if (maintenanceError) {
      maintenanceHtml = components.renderErrorCard({
        icon: icons.lock,
        error: maintenanceError,
        onRetry: "refresh-admin-maintenance",
      });
    } else if (maintenanceLoading || !maintenance) {
      maintenanceHtml = renderEmptyStateCompact(
        "加载中",
        "正在获取系统维护快照...",
        icons.spinner,
      );
    } else {
      maintenanceHtml = `
        <div class="hero-strip-compact">
          <div class="mini-stat-compact">
            <div class="mini-stat-label">索引记录</div>
            <div class="mini-stat-value">${safeText(maintenance.indexCount, "0")}</div>
            <div class="mini-stat-meta">${safeText(maintenance.indexTotalSizeFormatted, "0 B")}${maintenance.indexFresh ? " · 同步中" : " · 待同步"}</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">R2 对象</div>
            <div class="mini-stat-value">${safeText(maintenance.r2SampleCount, "0")}</div>
            <div class="mini-stat-meta">${maintenance.r2SampleTruncated ? "超 1000 条" : "可见对象数"}</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">访问记录</div>
            <div class="mini-stat-value">${safeText(maintenance.accessAttemptCount, "0")}</div>
            <div class="mini-stat-meta">失败记录数</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">回收站</div>
            <div class="mini-stat-value">${safeText(maintenance.trashCount, "0")}</div>
            <div class="mini-stat-meta">当前回收站项目</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">操作日志</div>
            <div class="mini-stat-value">${safeText(maintenance.logsCount, "0")}</div>
            <div class="mini-stat-meta">总记录数</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">后台任务</div>
            <div class="mini-stat-value">${safeText(maintenance.taskCount, "0")}</div>
            <div class="mini-stat-meta">待处理任务</div>
          </div>
          <div class="mini-stat-compact">
            <div class="mini-stat-label">缩略图缓存</div>
            <div class="mini-stat-value">${maintenance.thumbnailsPresent ? icons.check : icons.close}</div>
            <div class="mini-stat-meta">${maintenance.thumbnailsPresent ? "有缓存" : "无缓存"}</div>
          </div>
        </div>
        <div class="admin-action-grid">
          ${MAINTENANCE_ACTIONS.map((item) => {
            const busy = maintenanceBusyAction === item.action;
            return `
              <div class="admin-action-card">
                <div class="admin-label">${escapeHtml(item.label)}</div>
                <div class="admin-copy">${escapeHtml(item.desc)}</div>
                <button class="btn ${item.danger ? "btn-danger" : "btn-primary"}" type="button" style="min-height:32px;padding:0 12px;font-size:12px;"
                  data-action="confirm-maintenance-action"
                  data-maintenance-action="${escapeHtml(item.action)}"
                  data-maintenance-label="${escapeHtml(item.label)}"
                  ${busy ? "disabled" : ""}>
                  ${busy ? icons.spinner : icons.trash}
                  <span>${busy ? "执行中..." : "执行"}</span>
                </button>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    let tasksHtml = "";
    if (tasksLoading) {
      tasksHtml = renderEmptyStateCompact(
        "加载中",
        "正在获取任务列表...",
        icons.spinner,
      );
    } else if (!tasks || !tasks.length) {
      tasksHtml = renderEmptyStateCompact(
        "暂无任务",
        "当前没有后台任务在运行。",
        icons.list,
      );
    } else {
      const fmtTime = (ts) => {
        if (!ts) return "-";
        const d = new Date(ts);
        return d.toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      };
      const statusLabel = (status) => {
        if (status === "completed")
          return '<span class="badge badge-success">完成</span>';
        if (status === "partial")
          return '<span class="badge badge-warning">部分失败</span>';
        if (status === "failed")
          return '<span class="badge badge-error">失败</span>';
        if (status === "running")
          return '<span class="badge badge-info">运行中</span>';
        return '<span class="badge">待处理</span>';
      };
      tasksHtml = `
        <div class="table-wrap">
          <table class="data-table-compact">
            <thead>
              <tr>
                <th>文件数</th>
                <th>进度</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              ${tasks
                .map((t) => {
                  const files = t.payload?.files || [];
                  const fileList =
                    files
                      .slice(0, 3)
                      .map((f) => escapeHtml(f.name))
                      .join(", ") +
                    (files.length > 3 ? ` 等 ${files.length} 个` : "");
                  return `
                  <tr>
                    <td>${escapeHtml(fileList)}</td>
                    <td>${t.completed || 0}/${t.total || 0}</td>
                    <td>${statusLabel(t.status)}</td>
                    <td>${fmtTime(t.createdAt)}</td>
                  </tr>
                `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    const {
      trashRetention,
      trashRetentionLoading,
      trashCleanupBusy,
    } = admin;

    let retentionHtml = "";
    if (trashRetentionLoading) {
      retentionHtml = renderEmptyStateCompact("加载中", "正在获取回收站保留天数...", icons.spinner);
    } else {
      const currentDays = trashRetention?.days ?? 0;
      retentionHtml = `
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:8px;">
          <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:160px;">
            <label style="font-size:13px;color:var(--muted);">保留天数（0 为不自动清理）</label>
            <input class="input" type="number" min="0" max="3650" value="${currentDays}" data-binding="trash-retention-days" style="max-width:200px;">
          </div>
          <button class="btn btn-primary toolbar-btn" type="button" data-action="save-trash-retention" ${trashCleanupBusy ? "disabled" : ""}>
            保存设置
          </button>
          <button class="btn toolbar-btn" type="button" data-action="cleanup-trash-by-retention" ${trashCleanupBusy ? "disabled" : ""}>
            ${trashCleanupBusy ? "清理中..." : "按保留天数清理"}
          </button>
          ${currentDays > 0 ? `<span style="font-size:12px;color:var(--muted);align-self:center;">超过 ${currentDays} 天的回收站项目将被自动清除</span>` : '<span style="font-size:12px;color:var(--warning);align-self:center;">未设置保留天数，不会自动清理</span>'}
        </div>
      `;
    }

    return `
      <div class="admin-section-compact">
        <section>
          <h3>维护操作</h3>
          ${maintenanceHtml}
        </section>
        <section>
          <h3>回收站自动清理</h3>
          ${retentionHtml}
        </section>
        <section>
          <h3>后台任务</h3>
          ${tasksHtml}
        </section>
      </div>
    `;
  }

  function renderAdminTaskListSection(admin) {
    const { tasks, tasksLoading } = admin;
    if (tasksLoading) {
      return renderEmptyStateCompact(
        "加载中",
        "正在获取任务列表...",
        icons.spinner,
      );
    }
    if (!tasks || !tasks.length) {
      return "";
    }
    const fmtTime = (ts) => {
      if (!ts) return "-";
      const d = new Date(ts);
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    };
    const statusLabel = (status) => {
      if (status === "completed")
        return '<span class="badge badge-success">完成</span>';
      if (status === "partial")
        return '<span class="badge badge-warning">部分失败</span>';
      if (status === "failed")
        return '<span class="badge badge-error">失败</span>';
      if (status === "running")
        return '<span class="badge badge-info">运行中</span>';
      return '<span class="badge">待处理</span>';
    };
    return `
      <div class="table-wrap" style="margin-top:12px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>文件数</th>
              <th>进度</th>
              <th>状态</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            ${tasks
              .map((t) => {
                const files = t.payload?.files || [];
                const fileList =
                  files
                    .slice(0, 3)
                    .map((f) => escapeHtml(f.name))
                    .join(", ") +
                  (files.length > 3 ? ` 等 ${files.length} 个` : "");
                return `
                <tr>
                  <td>${escapeHtml(fileList)}</td>
                  <td>${t.completed || 0}/${t.total || 0}</td>
                  <td>${statusLabel(t.status)}</td>
                  <td>${fmtTime(t.createdAt)}</td>
                </tr>
              `;
              })
              .join("")}
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
