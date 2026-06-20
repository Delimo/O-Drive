export function createSettingsRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyState,
  renderEmptyStateCompact,
  formatBytes,
  formatTime,
  formatRelative,
}) {
  function renderAdminHealthSection(admin) {
    const health = admin.health;
    const loading = admin.healthLoading;
    const error = admin.healthError;

    if (error) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.lock}</div>
          <p class="empty-copy">${escapeHtml(error)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-health">${icons.eye}<span>重新加载</span></button></div>
        </div>
      `;
    }

    if (loading || !health) {
      return renderEmptyState(
        "加载中",
        "正在检查各服务组件运行状态...",
        icons.eye,
      );
    }

    const items = Object.entries(health.components || health).filter(
      ([, v]) => typeof v === "object",
    );
    return `
      <div class="hero-strip">
        ${items
          .map(([key, value]) => {
            const status = String(value?.status || "unknown");
            const ok = status === "ok" || status === "healthy";
            return `
            <div class="mini-stat">
              <div class="mini-stat-label">${safeText(key)}</div>
              <div class="mini-stat-value">${ok ? icons.check : icons.close}</div>
              <div class="mini-stat-meta">${safeText(value?.message || status, "未知")}</div>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  function renderAdminQuotaSection(admin) {
    const { quota, quotaLoading, quotaError } = admin;

    if (quotaError) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.lock}</div>
          <p class="empty-copy">${escapeHtml(quotaError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-quota">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
    }

    if (quotaLoading || !quota) {
      return renderEmptyStateCompact(
        "加载中",
        "正在获取存储配额信息...",
        icons.stats,
      );
    }

    const usedFormatted = formatBytes(quota.used || 0);
    const totalFormatted = formatBytes(quota.total || quota.limit || 0);
    const pct =
      quota.used && (quota.total || quota.limit)
        ? Math.round((quota.used / (quota.total || quota.limit)) * 100)
        : 0;

    return `
      <div class="hero-strip">
        <div class="mini-stat">
          <div class="mini-stat-label">已用空间</div>
          <div class="mini-stat-value">${usedFormatted}</div>
          <div class="mini-stat-meta">占总额的 ${pct}%</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">总配额</div>
          <div class="mini-stat-value">${totalFormatted}</div>
          <div class="mini-stat-meta">${quota.count ? `共 ${quota.count} 个文件` : ""}</div>
        </div>
      </div>
    `;
  }

  function renderAdminProtectedPathsSection(admin) {
    const { protectedPaths, protectedPathsLoading, protectedPathsError } =
      admin;

    return `
      ${
        protectedPathsLoading
          ? renderEmptyStateCompact(
              "正在加载受保护路径",
              "正在获取受保护路径列表。",
              icons.lock,
            )
          : protectedPathsError
            ? `
              <div class="empty-state">
                <div class="empty-orb">${icons.lock}</div>
                <p class="empty-copy">${escapeHtml(protectedPathsError)}</p>
              </div>
            `
            : protectedPaths.length === 0
              ? renderEmptyStateCompact(
                  "暂无受保护路径",
                  "还没有设置任何受保护路径。点击上方按钮添加。",
                  icons.lock,
                )
              : `
                <div class="latest-list">
                  ${protectedPaths
                    .map((item) => {
                      const path = String(item?.path || item?.folder || "/");
                      const note = item?.note || "";
                      const showName = item?.showName || "";
                      return `
                      <article class="latest-item">
                        <div class="status-bar" style="margin-bottom:8px;">
                          <div class="status-main">
                            <span class="status-dot"></span>
                            <span>${safeText(showName || path)}</span>
                            <span class="toolbar-tag">${safeText(path)}</span>
                          </div>
                          <button class="btn btn-danger" type="button" data-action="confirm-delete-protected-path" data-path="${escapeHtml(path)}">
                            ${icons.trash}<span>删除</span>
                          </button>
                        </div>
                        ${note ? `<div class="latest-copy">${escapeHtml(note)}</div>` : ""}
                      </article>
                    `;
                    })
                    .join("")}
                </div>
              `
      }
    `;
  }

  function renderAdminHiddenPathsSection(admin) {
    const { hiddenPaths, hiddenPathsLoading, hiddenPathsError } = admin;

    return `
      ${
        hiddenPathsLoading
          ? renderEmptyStateCompact(
              "正在加载隐藏路径",
              "正在获取隐藏路径列表。",
              icons.eye,
            )
          : hiddenPathsError
            ? `
              <div class="empty-state">
                <div class="empty-orb">${icons.eye}</div>
                <p class="empty-copy">${escapeHtml(hiddenPathsError)}</p>
              </div>
            `
            : hiddenPaths.length === 0
              ? renderEmptyStateCompact(
                  "暂无隐藏路径",
                  "还没有设置任何隐藏路径。点击上方按钮添加。",
                  icons.eye,
                )
              : `
                <div class="latest-list">
                  ${hiddenPaths
                    .map((item) => {
                      const path = String(item?.path || "/");
                      return `
                      <article class="latest-item">
                        <div class="status-bar" style="margin-bottom:8px;">
                          <div class="status-main">
                            <span class="status-dot"></span>
                            <span>${safeText(path)}</span>
                          </div>
                          <button class="btn btn-danger" type="button" data-action="confirm-delete-hidden-path" data-path="${escapeHtml(path)}">
                            ${icons.trash}<span>取消隐藏</span>
                          </button>
                        </div>
                      </article>
                    `;
                    })
                    .join("")}
                </div>
              `
      }
    `;
  }

  function renderAdminStorageSection(admin) {
    const {
      storageConfig,
      storageConfigLoading,
      storageConfigError,
      storageConfigSaving,
    } = admin;

    if (storageConfigError) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.stats}</div>
          <p class="empty-copy">${escapeHtml(storageConfigError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-storage-config">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
    }

    if (storageConfigLoading || !storageConfig) {
      return renderEmptyState("加载中", "正在加载存储空间配置...", icons.stats);
    }

    const r2 = storageConfig.r2 || {};
    const spaces = storageConfig.spaces || [];
    const bindings = storageConfig.bindings || [];
    const usagePercent = r2.usedPercent || 0;
    const usageBarColor =
      usagePercent >= 90
        ? "var(--danger)"
        : usagePercent >= 75
          ? "var(--warning)"
          : "var(--primary)";

    return `
      <div class="admin-grid">
        <div class="admin-card span-6">
          <div class="mini-stat">
            <div class="mini-stat-label">${escapeHtml(r2.name || "Cloudflare R2")}</div>
            <div class="mini-stat-value">${escapeHtml(r2.usedFormatted || "0")} / ${escapeHtml(r2.quotaFormatted || "未设置")}</div>
            <div style="margin:8px 0;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(usagePercent, 100)}%;background:${usageBarColor};border-radius:3px;transition:width .3s;"></div>
            </div>
            <div class="mini-stat-meta">已用 ${usagePercent}%</div>
          </div>
          <div class="btn-row" style="margin-top:8px;">
            <button class="btn toolbar-btn" type="button" data-action="show-edit-storage-quota" ${storageConfigSaving ? "disabled" : ""}>${icons.edit}<span>编辑配额</span></button>
          </div>
        </div>

        <div class="admin-card span-6">
          <div class="mini-stat">
            <div class="mini-stat-label">溢出策略</div>
            <div class="mini-stat-value">${storageConfig.overflowEnabled ? "已启用" : "已禁用"}</div>
            <div class="mini-stat-meta">阈值：${storageConfig.overflowThresholdPercent || 85}%</div>
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:24px;">
        <h3 style="margin:0;font-size:18px;font-weight:700;">S3 存储空间</h3>
        <div class="btn-row">
          <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-storage-space" ${storageConfigSaving ? "disabled" : ""}>${icons.plus}<span>添加空间</span></button>
        </div>
      </div>
      ${
        spaces.length === 0
          ? renderEmptyState(
              "暂无 S3 空间",
              "还没有配置任何外部存储空间。",
              icons.stats,
            )
          : `
            <div class="latest-list">
              ${spaces
                .map((item) => {
                  const pct = item.usedPercent || 0;
                  const barColor =
                    pct >= 90
                      ? "var(--danger)"
                      : pct >= 75
                        ? "var(--warning)"
                        : "var(--primary)";
                  return `
                  <article class="latest-item">
                    <div class="status-bar" style="margin-bottom:4px;">
                      <div class="status-main">
                        <span class="status-dot" style="background:${item.enabled ? "var(--primary)" : "var(--muted)"}"></span>
                        <span>${safeText(item.name)}</span>
                        <span class="toolbar-tag">${safeText(item.bucket)}</span>
                        ${!item.enabled ? '<span class="toolbar-tag tag-expired">已禁用</span>' : ""}
                        ${item.overflowTarget ? '<span class="toolbar-tag tag-unlimited">溢出目标</span>' : ""}
                      </div>
                      <div class="btn-row">
                        <button class="btn toolbar-btn" type="button" data-action="test-storage-space" data-id="${escapeHtml(item.id)}" ${storageConfigSaving ? "disabled" : ""}>${icons.eye}<span>测试</span></button>
                        <button class="btn btn-danger" type="button" data-action="confirm-delete-storage-space" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" ${storageConfigSaving ? "disabled" : ""}>${icons.trash}<span>删除</span></button>
                      </div>
                    </div>
                    <div style="font-size:13px;color:var(--muted);">
                      ${escapeHtml(item.usedFormatted || "0")} / ${escapeHtml(item.quotaFormatted || "未设置")}
                      <span style="margin:0 8px;">·</span>
                      <span style="color:${barColor};">${pct}%</span>
                      <span style="margin:0 8px;">·</span>
                      ${escapeHtml(item.endpoint || "N/A")}
                    </div>
                  </article>
                `;
                })
                .join("")}
            </div>
          `
      }

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:24px;">
        <h3 style="margin:0;font-size:18px;font-weight:700;">路径绑定</h3>
        <div class="btn-row">
          <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-storage-binding" ${storageConfigSaving ? "disabled" : ""}>${icons.plus}<span>添加绑定</span></button>
        </div>
      </div>
      ${
        bindings.length === 0
          ? renderEmptyState(
              "暂无路径绑定",
              "还没有配置任何路径与存储空间的绑定。",
              icons.link,
            )
          : `
            <div class="latest-list">
              ${bindings
                .map((item) => {
                  const storageName =
                    item.storageId === "r2"
                      ? "Cloudflare R2"
                      : spaces.find((s) => s.id === item.storageId)?.name ||
                        item.storageId;
                  return `
                  <article class="latest-item">
                    <div class="status-bar" style="margin-bottom:4px;">
                      <div class="status-main">
                        <span class="status-dot"></span>
                        <span>${safeText(item.path)}</span>
                        <span class="toolbar-tag">${escapeHtml(storageName)}</span>
                      </div>
                      <button class="btn btn-danger" type="button" data-action="confirm-delete-storage-binding" data-path="${escapeHtml(item.path)}" ${storageConfigSaving ? "disabled" : ""}>
                        ${icons.trash}<span>删除</span>
                      </button>
                    </div>
                  </article>
                `;
                })
                .join("")}
            </div>
          `
      }
    `;
  }

  function renderAdminNotificationsSection(admin) {
    const { adminNotifHistory, adminNotifHistoryLoading, notificationsUnread } =
      admin;
    if (adminNotifHistoryLoading) {
      return renderEmptyStateCompact(
        "加载中",
        "正在获取通知历史...",
        icons.bell,
      );
    }
    const items = adminNotifHistory || [];
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <span style="font-size:14px;color:var(--muted);">共 ${items.length} 条通知${notificationsUnread ? `，${notificationsUnread} 条未读` : ""}</span>
        <button class="btn toolbar-btn" type="button" data-action="refresh-admin-notifications">${icons.refresh}<span>刷新</span></button>
      </div>
      ${
        items.length === 0
          ? renderEmptyStateCompact(
              "暂无通知",
              "目前还没有任何通知记录。",
              icons.bell,
            )
          : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width:120px;">时间</th>
                    <th>消息</th>
                    <th style="width:72px;">状态</th>
                    <th style="width:72px;">操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${items
                    .map(
                      (n) => `
                    <tr class="${n.read ? "" : "notif-table-row-unread"}">
                      <td style="white-space:nowrap;font-size:12px;color:var(--muted);">${formatRelative(n.created_at)}</td>
                      <td>${escapeHtml(n.message)}</td>
                      <td>${n.read ? '<span class="table-tag">已读</span>' : '<span class="table-tag table-tag-unread">未读</span>'}</td>
                      <td>${n.read ? "" : `<button class="btn btn-small btn-ghost" type="button" data-action="admin-mark-notif-read" data-notif-id="${n.id}">${icons.check}</button>`}</td>
                    </tr>
                  `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
      }
    `;
  }

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
      maintenanceHtml = `
        <div class="empty-state">
          <div class="empty-orb">${icons.lock}</div>
          <p class="empty-copy">${escapeHtml(maintenanceError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-maintenance">${icons.refresh}<span>重新加载</span></button></div>
        </div>
      `;
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

    return `
      <div class="admin-section-compact">
        <section>
          <h3>维护操作</h3>
          ${maintenanceHtml}
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

  function renderSystemStatusSection(admin) {
    const health = admin.health;
    const healthLoading = admin.healthLoading;
    const healthError = admin.healthError;
    const { quota, quotaLoading, quotaError } = admin;
    const {
      maintenance,
      maintenanceLoading,
      maintenanceError,
      maintenanceBusyAction,
    } = admin;

    let envHtml = "";
    if (healthError) {
      envHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(healthError)}</p></div>`;
    } else if (healthLoading || !health) {
      envHtml = renderEmptyStateCompact(
        "加载中",
        "正在检查服务组件状态...",
        icons.eye,
      );
    } else {
      const items = Object.entries(health.components || health).filter(
        ([, v]) => typeof v === "object",
      );
      envHtml = `
        <div class="env-grid">
          ${items
            .map(([key, value]) => {
              const status = String(value?.status || "unknown");
              const ok = status === "ok" || status === "healthy";
              return `
              <div class="env-item">
                <div class="env-item-head">
                  <span class="env-item-name">${safeText(key)}</span>
                  <span class="env-status ${ok ? "env-status-ok" : "env-status-error"}">${ok ? "正常" : "异常"}</span>
                </div>
                <div class="env-item-desc">${safeText(value?.message || status, "未知")}</div>
              </div>
            `;
            })
            .join("")}
        </div>
      `;
    }

    let maintHtml = "";
    if (maintenanceError) {
      maintHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(maintenanceError)}</p></div>`;
    } else if (maintenanceLoading || !maintenance) {
      maintHtml = renderEmptyStateCompact(
        "加载中",
        "正在获取维护快照...",
        icons.spinner,
      );
    } else {
      maintHtml = `
        <div class="maint-grid">
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">文件索引</span>
              <span class="maint-item-value">${safeText(maintenance.indexCount, "0")}</span>
            </div>
            <div class="maint-item-desc">${safeText(maintenance.indexTotalSizeFormatted, "0 B")}${maintenance.indexFresh ? " · 已同步" : " · 待同步"}</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">索引更新</span>
              <span class="maint-item-time">${maintenance.indexUpdatedAt ? formatTime(maintenance.indexUpdatedAt) : "未知"}</span>
            </div>
            <div class="maint-item-desc">索引与存储${maintenance.indexFresh ? "一致" : "不一致"}</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">访问失败记录</span>
              <span class="maint-item-value">${safeText(maintenance.accessAttemptCount, "0")}</span>
            </div>
            <div class="maint-item-desc">受保护路径的密码错误记录</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">回收站</span>
              <span class="maint-item-value">${safeText(maintenance.trashCount, "0")}</span>
            </div>
            <div class="maint-item-desc">可回收站占用 R2 空间</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">操作日志</span>
              <span class="maint-item-value">${safeText(maintenance.logsCount, "0")}</span>
            </div>
            <div class="maint-item-desc">管理员操作记录</div>
          </div>
          <div class="maint-item">
            <div class="maint-item-head">
              <span class="maint-item-name">缩略图缓存</span>
              <span class="maint-item-value">${maintenance.thumbnailsPresent ? "有" : "无"}</span>
            </div>
            <div class="maint-item-desc">.thumbs/ 系统前缀</div>
          </div>
        </div>
        <div class="maint-actions">
          <button class="btn btn-primary toolbar-btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="rebuild-index" data-maintenance-label="重建文件索引" ${maintenanceBusyAction ? "disabled" : ""}>
            ${maintenanceBusyAction === "rebuild-index" ? icons.spinner : icons.trash}
            <span>${maintenanceBusyAction === "rebuild-index" ? "执行中..." : "重建文件索引"}</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="cleanup-access-attempts" data-maintenance-label="清理访问失败记录" ${maintenanceBusyAction ? "disabled" : ""}>
            ${maintenanceBusyAction === "cleanup-access-attempts" ? icons.spinner : icons.trash}
            <span>${maintenanceBusyAction === "cleanup-access-attempts" ? "执行中..." : "清理访问失败记录"}</span>
          </button>
          <button class="btn toolbar-btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="cleanup-thumbnails" data-maintenance-label="清理缩略图缓存" ${maintenanceBusyAction ? "disabled" : ""}>
            ${maintenanceBusyAction === "cleanup-thumbnails" ? icons.spinner : icons.trash}
            <span>${maintenanceBusyAction === "cleanup-thumbnails" ? "执行中..." : "清理缩略图缓存"}</span>
          </button>
        </div>
      `;
    }

    let quotaHtml = "";
    if (quotaError) {
      quotaHtml = `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(quotaError)}</p></div>`;
    } else if (quotaLoading || !quota) {
      quotaHtml = renderEmptyStateCompact(
        "加载中",
        "正在获取存储配额信息...",
        icons.stats,
      );
    } else {
      const usedFormatted = formatBytes(quota.used || 0);
      const totalFormatted = formatBytes(quota.total || quota.limit || 0);
      const pct =
        quota.used && (quota.total || quota.limit)
          ? Math.round((quota.used / (quota.total || quota.limit)) * 100)
          : 0;
      quotaHtml = `
        <div class="quota-bar-wrap">
          <div class="quota-bar-info">
            <span>已用 ${usedFormatted} / ${totalFormatted}</span>
            <span>${pct}%</span>
          </div>
          <div class="quota-bar">
            <div class="quota-bar-fill" style="width:${Math.min(pct, 100)}%;"></div>
          </div>
        </div>
      `;
    }

    return `
      <div class="sys-status-page">
        <div class="sys-status-header">
          <div>
            <h3 class="sys-status-title">系统状态</h3>
            <p class="sys-status-desc">检查部署绑定、索引状态和维护入口。</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin-health" data-action2="refresh-admin-maintenance">${icons.refresh}<span>刷新</span></button>
        </div>
        <div class="sys-status-body">
          <div class="sys-status-left">
            <div class="sys-status-card">
              <div class="sys-status-card-head">
                <h4 class="sys-status-card-title">环境检查</h4>
                <span class="sys-status-card-desc">关键绑定和登录配置</span>
              </div>
              ${envHtml}
            </div>
            <div class="sys-status-card">
              <div class="sys-status-card-head">
                <h4 class="sys-status-card-title">存储配额</h4>
              </div>
              ${quotaHtml}
            </div>
          </div>
          <div class="sys-status-right">
            <div class="sys-status-card">
              <div class="sys-status-card-head">
                <h4 class="sys-status-card-title">维护中心</h4>
                <span class="sys-status-card-desc">索引、缓存和记录清理</span>
              </div>
              ${maintHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderStorageSection(admin) {
    const {
      storageConfig,
      storageConfigLoading,
      storageConfigError,
      storageConfigSaving,
    } = admin;

    if (storageConfigError) {
      return `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(storageConfigError)}</p></div>`;
    }

    if (storageConfigLoading || !storageConfig) {
      return renderEmptyStateCompact(
        "加载中",
        "正在加载存储空间配置...",
        icons.stats,
      );
    }

    const r2 = storageConfig.r2 || {};
    const spaces = storageConfig.spaces || [];
    const bindings = storageConfig.bindings || [];
    const usagePercent = r2.usedPercent || 0;
    const usageBarColor =
      usagePercent >= 90
        ? "var(--danger)"
        : usagePercent >= 75
          ? "var(--warning)"
          : "var(--primary)";

    return `
      <div class="admin-section-compact">
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>Cloudflare R2</h3>
            <button class="btn toolbar-btn" type="button" data-action="show-edit-storage-quota" ${storageConfigSaving ? "disabled" : ""}>${icons.edit}<span>编辑配额</span></button>
          </div>
          <div class="sys-status-card" style="margin:0;">
            <div class="env-item">
              <div class="env-item-head">
                <span class="env-item-name">${escapeHtml(r2.name || "Cloudflare R2")}</span>
                <span class="env-status env-status-ok">正常</span>
              </div>
              <div class="env-item-desc">${escapeHtml(r2.usedFormatted || "0")} / ${escapeHtml(r2.quotaFormatted || "未设置")} · 已用 ${usagePercent}%</div>
              <div style="margin:8px 0 0;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(usagePercent, 100)}%;background:${usageBarColor};border-radius:3px;transition:width .3s;"></div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>S3 存储空间</h3>
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-storage-space" ${storageConfigSaving ? "disabled" : ""}>${icons.plus}<span>添加空间</span></button>
          </div>
          ${
            spaces.length === 0
              ? renderEmptyStateCompact(
                  "暂无 S3 空间",
                  "还没有配置任何外部存储空间。",
                  icons.stats,
                )
              : `
                <div class="latest-list-compact">
                  ${spaces
                    .map((item) => {
                      const pct = item.usedPercent || 0;
                      const barColor =
                        pct >= 90
                          ? "var(--danger)"
                          : pct >= 75
                            ? "var(--warning)"
                            : "var(--primary)";
                      return `
                      <article class="latest-item-compact">
                        <div class="status-bar">
                          <div class="status-main">
                            <span class="status-dot" style="background:${item.enabled ? "var(--primary)" : "var(--muted)"}"></span>
                            <span>${safeText(item.name)}</span>
                            <span class="toolbar-tag">${safeText(item.bucket)}</span>
                            ${!item.enabled ? '<span class="toolbar-tag tag-expired">已禁用</span>' : ""}
                            ${item.overflowTarget ? '<span class="toolbar-tag tag-unlimited">溢出目标</span>' : ""}
                          </div>
                          <div class="btn-row">
                            <button class="btn toolbar-btn" type="button" data-action="test-storage-space" data-id="${escapeHtml(item.id)}" ${storageConfigSaving ? "disabled" : ""}>${icons.eye}<span>测试</span></button>
                            <button class="btn btn-danger" type="button" data-action="confirm-delete-storage-space" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" ${storageConfigSaving ? "disabled" : ""}>${icons.trash}<span>删除</span></button>
                          </div>
                        </div>
                        <div class="latest-copy">
                          ${escapeHtml(item.usedFormatted || "0")} / ${escapeHtml(item.quotaFormatted || "未设置")}
                          <span style="margin:0 6px;">·</span>
                          <span style="color:${barColor};">${pct}%</span>
                          <span style="margin:0 6px;">·</span>
                          ${escapeHtml(item.endpoint || "N/A")}
                        </div>
                      </article>
                    `;
                    })
                    .join("")}
                </div>
              `
          }
        </section>

        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>溢出策略</h3>
          </div>
          <div class="sys-status-card" style="margin:0;">
            <div class="env-item">
              <div class="env-item-head">
                <span class="env-item-name">${storageConfig.overflowEnabled ? "已启用" : "已禁用"}</span>
                <span class="toolbar-tag">阈值 ${storageConfig.overflowThresholdPercent || 85}%</span>
              </div>
              <div class="env-item-desc">R2 空间满时自动写入指定的 S3 溢出目标</div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderPathManagementSection(admin) {
    const { protectedPaths, protectedPathsLoading, protectedPathsError } =
      admin;
    const { hiddenPaths, hiddenPathsLoading, hiddenPathsError } = admin;

    let protectedHtml = "";
    if (protectedPathsLoading) {
      protectedHtml = renderEmptyStateCompact(
        "正在加载受保护路径",
        "正在获取受保护路径列表。",
        icons.lock,
      );
    } else if (protectedPathsError) {
      protectedHtml = `<div class="empty-state"><div class="empty-orb">${icons.lock}</div><p class="empty-copy">${escapeHtml(protectedPathsError)}</p></div>`;
    } else if (protectedPaths.length === 0) {
      protectedHtml = renderEmptyStateCompact(
        "暂无受保护路径",
        "还没有设置任何受保护路径。点击下方按钮添加。",
        icons.lock,
      );
    } else {
      protectedHtml = `
        <div class="latest-list-compact">
          ${protectedPaths
            .map((item) => {
              const path = String(item?.path || item?.folder || "/");
              const note = item?.note || "";
              const showName = item?.showName || "";
              return `
              <article class="latest-item-compact">
                <div class="status-bar">
                  <div class="status-main">
                    <span class="status-dot"></span>
                    <span>${safeText(showName || path)}</span>
                    <span class="toolbar-tag">${safeText(path)}</span>
                  </div>
                  <button class="btn btn-danger" type="button" data-action="confirm-delete-protected-path" data-path="${escapeHtml(path)}">
                    ${icons.trash}<span>删除</span>
                  </button>
                </div>
                ${note ? `<div class="latest-copy">${escapeHtml(note)}</div>` : ""}
              </article>
            `;
            })
            .join("")}
        </div>
      `;
    }

    let hiddenHtml = "";
    if (hiddenPathsLoading) {
      hiddenHtml = renderEmptyStateCompact(
        "正在加载隐藏路径",
        "正在获取隐藏路径列表。",
        icons.eye,
      );
    } else if (hiddenPathsError) {
      hiddenHtml = `<div class="empty-state"><div class="empty-orb">${icons.eye}</div><p class="empty-copy">${escapeHtml(hiddenPathsError)}</p></div>`;
    } else if (hiddenPaths.length === 0) {
      hiddenHtml = renderEmptyStateCompact(
        "暂无隐藏路径",
        "还没有设置任何隐藏路径。点击下方按钮添加。",
        icons.eye,
      );
    } else {
      hiddenHtml = `
        <div class="latest-list-compact">
          ${hiddenPaths
            .map((item) => {
              const path = String(item?.path || "/");
              return `
              <article class="latest-item-compact">
                <div class="status-bar">
                  <div class="status-main">
                    <span class="status-dot"></span>
                    <span>${safeText(path)}</span>
                  </div>
                  <button class="btn btn-danger" type="button" data-action="confirm-delete-hidden-path" data-path="${escapeHtml(path)}">
                    ${icons.trash}<span>取消隐藏</span>
                  </button>
                </div>
              </article>
            `;
            })
            .join("")}
        </div>
      `;
    }

    return `
      <div class="admin-section-compact">
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>受保护路径</h3>
          </div>
          ${protectedHtml}
        </section>
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>隐藏路径</h3>
          </div>
          ${hiddenHtml}
        </section>
      </div>
    `;
  }

  return {
    renderAdminHealthSection,
    renderAdminQuotaSection,
    renderAdminProtectedPathsSection,
    renderAdminHiddenPathsSection,
    renderAdminStorageSection,
    renderAdminNotificationsSection,
    MAINTENANCE_ACTIONS,
    renderAdminMaintenanceSection,
    renderAdminTaskListSection,
    renderSystemStatusSection,
    renderStorageSection,
    renderPathManagementSection,
  };
}
