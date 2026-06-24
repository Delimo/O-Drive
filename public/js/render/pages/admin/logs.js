export function createLogsRenderer({
  icons, safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderAdminLogsSection(admin) {
    const { logs = [], logsLoading, logsError, logsPage = 1, logsTotalPages = 1, logsFilter = {} } = admin;

    if (logsError) {
      return components.renderErrorCard({ icon: icons.refresh, error: logsError, onRetry: "refresh-admin-logs" });
    }
    if (logsLoading) {
      return renderEmptyStateCompact("正在读取审计日志", "正在加载列表...", icons.spinner);
    }

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px;">
        <div class="ov-page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:20px; font-weight:700; color:var(--text);">系统日志</h2>
            <p class="ov-page-desc" style="margin:4px 0 0; font-size:13px; color:var(--muted);">审查平台管理员和系统后台行为的安全和运行记录</p>
          </div>
        </div>

        <!-- 检索工具箱 -->
        <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px; display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; align-items:center;">
          <!-- 关键词 -->
          <div style="position:relative;">
            <input class="input" type="text" data-action-input="set-logs-filter" data-key="q" value="${escapeHtml(logsFilter.q || "")}" placeholder="搜索路径、操作员、IP..." style="width:100%; padding:8px 12px 8px 30px; font-size:13px; border-radius:8px; border:1px solid var(--line); background:var(--panel-soft);">
            <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); width:14px; height:14px; color:var(--muted);">${icons.search}</span>
          </div>
          <!-- 操作过滤 -->
          <select class="input" data-action-change="set-logs-filter" data-key="action" style="padding:8px; font-size:13px; border-radius:8px; border:1px solid var(--line); background:var(--panel-soft);">
            <option value="">全部行为 (All)</option>
            <option value="upload" ${logsFilter.action === "upload" ? "selected" : ""}>上传 (Upload)</option>
            <option value="delete" ${logsFilter.action === "delete" ? "selected" : ""}>删除 (Delete)</option>
            <option value="share" ${logsFilter.action === "share" ? "selected" : ""}>分享 (Share)</option>
            <option value="login" ${logsFilter.action === "login" ? "selected" : ""}>安全登录 (Login)</option>
          </select>
          <!-- 起始时间 -->
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:12px; color:var(--muted); flex-shrink:0;">起:</span>
            <input class="input" type="date" data-action-change="set-logs-filter" data-key="from" value="${escapeHtml(logsFilter.from || "")}" style="width:100%; padding:6px; font-size:12px; border-radius:8px; border:1px solid var(--line); background:var(--panel-soft);">
          </div>
          <!-- 截止时间 -->
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:12px; color:var(--muted); flex-shrink:0;">止:</span>
            <input class="input" type="date" data-action-change="set-logs-filter" data-key="to" value="${escapeHtml(logsFilter.to || "")}" style="width:100%; padding:6px; font-size:12px; border-radius:8px; border:1px solid var(--line); background:var(--panel-soft);">
          </div>
        </div>

        <!-- 日志主体表格 -->
        <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden;">
          ${logs.length === 0 ? `
            <p style="text-align:center; color:var(--muted); font-size:13px; padding:48px 12px; margin:0;">无匹配审计日志</p>
          ` : `
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
                <thead>
                  <tr style="border-bottom:1px solid var(--line); background:var(--panel-soft); color:var(--muted);">
                    <th style="padding:12px 16px; font-weight:600;">时间</th>
                    <th style="padding:12px 16px; font-weight:600;">操作</th>
                    <th style="padding:12px 16px; font-weight:600;">资源路径</th>
                    <th style="padding:12px 16px; font-weight:600;">操作人</th>
                    <th style="padding:12px 16px; font-weight:600;">IP 地址</th>
                  </tr>
                </thead>
                <tbody>
                  ${logs.map(log => {
                    const actColor = log.action === "delete" ? "var(--danger)" : log.action === "login" ? "#10b981" : "var(--accent)";
                    return `
                      <tr style="border-bottom:1px solid var(--line); color:var(--text);">
                        <td style="padding:12px 16px; color:var(--muted); white-space:nowrap;">${formatTime(log.createdAt)}</td>
                        <td style="padding:12px 16px;">
                          <span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; text-transform:uppercase; background:var(--panel-soft); color:${actColor};">
                            ${escapeHtml(log.action)}
                          </span>
                        </td>
                        <td style="padding:12px 16px; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:monospace;">
                          ${safeText(log.path, "-")}
                        </td>
                        <td style="padding:12px 16px; font-weight:500;">${safeText(log.user, "System")}</td>
                        <td style="padding:12px 16px; color:var(--muted); font-family:monospace;">${safeText(log.ip, "-")}</td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>

            <!-- 分页管理器 -->
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-top:1px solid var(--line); background:var(--panel-soft);">
              <span style="font-size:12px; color:var(--muted);">第 ${logsPage} / ${logsTotalPages} 页</span>
              <div style="display:flex; gap:6px;">
                <button class="btn" type="button" data-action="set-logs-page" data-page="${logsPage - 1}" 
                        style="font-size:12px; padding:4px 10px; border-radius:6px; border:1px solid var(--line); background:var(--panel);"
                        ${logsPage <= 1 ? "disabled" : ""}>上一页</button>
                <button class="btn" type="button" data-action="set-logs-page" data-page="${logsPage + 1}" 
                        style="font-size:12px; padding:4px 10px; border-radius:6px; border:1px solid var(--line); background:var(--panel);"
                        ${logsPage >= logsTotalPages ? "disabled" : ""}>下一页</button>
              </div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  return { renderAdminLogsSection };
}