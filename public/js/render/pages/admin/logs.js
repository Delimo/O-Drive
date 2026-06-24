export function createLogsRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderAdminLogsSection(admin) {
    const { logs = [], logsLoading, logsError, logsPage = 1, logsTotalPages = 1, logsFilter = {} } = admin;

    if (logsError) {
      return components.renderErrorCard({ icon: "", error: logsError, onRetry: "refresh-admin-logs" });
    }
    if (logsLoading) {
      return renderEmptyStateCompact("载入中", "读取日志流...", "");
    }

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:12px; height:100%; overflow:hidden; font-family:system-ui, sans-serif;">
        <div class="ov-page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:16px; font-weight:600; color:var(--text);">审计日志</h2>
            <p class="ov-page-desc" style="margin:2px 0 0; font-size:11px; color:var(--muted);">记录平台所有的管理员安全及数据更改行为</p>
          </div>
        </div>

        <!-- 扁平紧凑筛选项 -->
        <div style="display:flex; gap:8px; align-items:center; border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:6px 0;">
          <input class="input" type="text" data-action-input="set-logs-filter" data-key="q" value="${escapeHtml(logsFilter.q || "")}" placeholder="过滤关键词..." style="flex:1.5; padding:4px 8px; font-size:11px; border:1px solid var(--line); border-radius:4px; background:transparent;">
          <select class="input" data-action-change="set-logs-filter" data-key="action" style="flex:1; padding:4px; font-size:11px; border:1px solid var(--line); border-radius:4px; background:transparent;">
            <option value="">全部事件</option>
            <option value="upload" ${logsFilter.action === "upload" ? "selected" : ""}>上传</option>
            <option value="delete" ${logsFilter.action === "delete" ? "selected" : ""}>删除</option>
            <option value="share" ${logsFilter.action === "share" ? "selected" : ""}>共享</option>
            <option value="login" ${logsFilter.action === "login" ? "selected" : ""}>安全登录</option>
          </select>
          <div style="display:flex; align-items:center; gap:2px; font-size:10px; color:var(--muted);">
            <span>时间段:</span>
            <input class="input" type="date" data-action-change="set-logs-filter" data-key="from" value="${escapeHtml(logsFilter.from || "")}" style="padding:2px 4px; border:1px solid var(--line); background:transparent; font-size:10px;">
            <span>-</span>
            <input class="input" type="date" data-action-change="set-logs-filter" data-key="to" value="${escapeHtml(logsFilter.to || "")}" style="padding:2px 4px; border:1px solid var(--line); background:transparent; font-size:10px;">
          </div>
        </div>

        <!-- 日志表格（行高与容量缩减，高度严格在 190px 以内） -->
        <div style="display:flex; flex-direction:column; flex:1; min-h-0;">
          ${logs.length === 0 ? `
            <p style="text-align:center; color:var(--muted); font-size:11px; padding:24px 0;">无匹配行为日志</p>
          ` : `
            <div style="overflow-y:auto; max-height:190px; border-bottom:1px solid var(--line);">
              <table style="width:100%; border-collapse:collapse; text-align:left; font-size:11px;">
                <thead>
                  <tr style="border-bottom:1px solid var(--line); color:var(--muted);">
                    <th style="padding:6px 8px; font-weight:500;">操作时间</th>
                    <th style="padding:6px 8px; font-weight:500;">动作行为</th>
                    <th style="padding:6px 8px; font-weight:500;">目标资源路径</th>
                    <th style="padding:6px 8px; font-weight:500;">IP</th>
                  </tr>
                </thead>
                <tbody>
                  ${logs.map(log => {
                    const actColor = log.action === "delete" ? "var(--danger)" : log.action === "login" ? "#10b981" : "var(--text)";
                    return `
                      <tr style="border-bottom:1px dashed var(--line); color:var(--text);">
                        <td style="padding:6px 8px; color:var(--muted); white-space:nowrap;">${formatTime(log.createdAt)}</td>
                        <td style="padding:6px 8px; font-weight:600; color:${actColor}; text-transform:uppercase; font-size:10px;">${escapeHtml(log.action)}</td>
                        <td style="padding:6px 8px; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:monospace;">${safeText(log.path, "-")}</td>
                        <td style="padding:6px 8px; color:var(--muted); font-family:monospace;">${safeText(log.ip, "-")}</td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>

            <!-- 扁平翻页栏 -->
            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; font-size:11px;">
              <span style="color:var(--muted);">第 ${logsPage} / ${logsTotalPages} 页</span>
              <div style="display:flex; gap:4px;">
                <button class="btn" type="button" data-action="set-logs-page" data-page="${logsPage - 1}" style="font-size:10px; padding:2px 6px; border:1px solid var(--line); border-radius:4px; background:transparent;" ${logsPage <= 1 ? "disabled" : ""}>上页</button>
                <button class="btn" type="button" data-action="set-logs-page" data-page="${logsPage + 1}" style="font-size:10px; padding:2px 6px; border:1px solid var(--line); border-radius:4px; background:transparent;" ${logsPage >= logsTotalPages ? "disabled" : ""}>下页</button>
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  return { renderAdminLogsSection };
}