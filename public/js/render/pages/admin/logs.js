export function createLogsRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyState,
  renderEmptyStateCompact,
  formatTime,
  formatRelative,
  components,
}) {
  function renderAdminLogsSection(admin) {
    const { logs, logsLoading, logsError, logsPage, logsTotalPages, logsFilter } = admin;

    if (logsError) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.lock}</div>
          <p class="empty-copy">${escapeHtml(logsError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-logs">重新加载</button></div>
        </div>
      `;
    }

    return `
      <div class="ov-page">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title">操作日志</h2>
            <p class="ov-page-desc">系统操作记录与审计追踪</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="export-logs-csv">导出 CSV</button>
        </div>

        <div class="admin-card">
          <div class="admin-card-header" style="flex-wrap:wrap;gap:6px;">
            <div class="admin-card-icon" style="background:rgba(14,116,144,0.1);color:#0e7490">${icons.search}</div>
            <span class="admin-label">筛选</span>
            <input class="input" type="text" placeholder="搜索关键字..." value="${escapeHtml(logsFilter.q || "")}" data-action-input="set-logs-filter" data-key="q" style="flex:1;min-width:120px;">
            <select class="input" data-action-change="set-logs-filter" data-key="action" style="width:auto;">
              <option value="">全部类型</option>
              <option value="create" ${logsFilter.action === "create" ? "selected" : ""}>创建</option>
              <option value="delete" ${logsFilter.action === "delete" ? "selected" : ""}>删除</option>
              <option value="update" ${logsFilter.action === "update" ? "selected" : ""}>更新</option>
              <option value="share" ${logsFilter.action === "share" ? "selected" : ""}>分享</option>
              <option value="login" ${logsFilter.action === "login" ? "selected" : ""}>登录</option>
              <option value="upload" ${logsFilter.action === "upload" ? "selected" : ""}>上传</option>
            </select>
            <div style="display:flex;align-items:center;gap:4px;">
              <span style="font-size:11px;color:var(--muted);">从</span>
              <input class="input" type="date" value="${escapeHtml(logsFilter.from || "")}" data-action-change="set-logs-filter" data-key="from" style="width:auto;padding:2px 6px;min-height:28px;">
              <span style="font-size:11px;color:var(--muted);">至</span>
              <input class="input" type="date" value="${escapeHtml(logsFilter.to || "")}" data-action-change="set-logs-filter" data-key="to" style="width:auto;padding:2px 6px;min-height:28px;">
            </div>
          </div>
        </div>

        ${
          logsLoading
            ? renderEmptyStateCompact("正在加载日志", "正在获取系统操作记录。", icons.refresh)
            : logs.length === 0
              ? renderEmptyStateCompact("暂无操作日志", "系统中还没有操作记录。", icons.list)
              : `
                <div class="admin-card" style="padding:0;">
                  <div style="padding:10px 12px;display:flex;flex-direction:column;gap:4px;">
                    ${logs.map((item) => `
                      <div class="latest-item-compact" style="padding:8px 10px;margin:0;">
                        <div class="latest-title" style="font-size:12px;">${safeText(item.action || "操作")} · ${safeText(item.path || "/")}</div>
                        <div class="latest-copy" style="font-size:11px;">
                          ${item.user ? `用户 ${escapeHtml(item.user)}` : ""}
                          ${item.ip ? ` · IP ${escapeHtml(item.ip)}` : ""}
                          ${item.createdAt ? ` · ${formatTime(item.createdAt)} (${formatRelative(item.createdAt)})` : ""}
                        </div>
                        ${item.detail ? `<div class="latest-copy" style="margin-top:1px;color:var(--muted);font-size:11px;">${escapeHtml(item.detail)}</div>` : ""}
                      </div>
                    `).join("")}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;justify-content:center;">
                  <button class="btn btn-muted" type="button" data-action="set-logs-page" data-page="${logsPage - 1}" ${logsPage <= 1 ? "disabled" : ""}>上一页</button>
                  <span style="font-size:12px;color:var(--muted);">第 ${logsPage} / ${logsTotalPages || 1} 页</span>
                  <button class="btn btn-muted" type="button" data-action="set-logs-page" data-page="${logsPage + 1}" ${logsPage >= logsTotalPages ? "disabled" : ""}>下一页</button>
                </div>
              `
        }
      </div>
    `;
  }

  return { renderAdminLogsSection };
}
