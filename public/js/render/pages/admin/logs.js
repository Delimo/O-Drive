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
      <div class="ap">
        <div class="ap-head">
          <div>
            <h2 class="ap-title">审计日志</h2>
            <p class="ap-desc">记录平台所有的管理员安全及数据更改行为</p>
          </div>
        </div>

        <div class="ap-filter-bar">
          <input class="ap-input ap-input-search" type="text"
                 data-action-input="set-logs-filter" data-key="q"
                 value="${escapeHtml(logsFilter.q || "")}" placeholder="过滤关键词...">
          <select class="ap-input ap-input-select" data-action-change="set-logs-filter" data-key="action">
            <option value="">全部事件</option>
            <option value="upload" ${logsFilter.action === "upload" ? "selected" : ""}>上传</option>
            <option value="delete" ${logsFilter.action === "delete" ? "selected" : ""}>删除</option>
            <option value="share" ${logsFilter.action === "share" ? "selected" : ""}>共享</option>
            <option value="login" ${logsFilter.action === "login" ? "selected" : ""}>安全登录</option>
          </select>
          <div class="ap-row" style="align-items:center;gap:4px;">
            <input class="ap-input" type="date" data-action-change="set-logs-filter" data-key="from"
                   value="${escapeHtml(logsFilter.from || "")}" style="width:120px;font-size:11px;">
            <span style="color:var(--muted);">–</span>
            <input class="ap-input" type="date" data-action-change="set-logs-filter" data-key="to"
                   value="${escapeHtml(logsFilter.to || "")}" style="width:120px;font-size:11px;">
          </div>
        </div>

        <div class="ap-card" style="overflow:hidden;">
          ${logs.length === 0
            ? `<p class="ap-empty-inline" style="padding:24px;">无匹配行为日志</p>`
            : `
              <div style="overflow-x:auto;">
                <table class="ap-table">
                  <thead>
                    <tr>
                      <th>操作时间</th>
                      <th>动作行为</th>
                      <th>目标资源路径</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${logs.map(log => {
                      const actCls = log.action === "delete" ? 'ap-act-danger' : log.action === "login" ? 'ap-act-ok' : '';
                      return `
                        <tr>
                          <td class="ap-td-muted">${formatTime(log.createdAt)}</td>
                          <td><span class="ap-action-tag ${actCls}">${escapeHtml(log.action)}</span></td>
                          <td class="ap-td-mono">${safeText(log.path, "-")}</td>
                          <td class="ap-td-mono ap-td-muted">${safeText(log.ip, "-")}</td>
                        </tr>
                      `;
                    }).join("")}
                  </tbody>
                </table>
              </div>
              <div class="ap-pagination">
                <span class="ap-desc-text" style="margin:0;">第 ${logsPage} / ${logsTotalPages} 页</span>
                <div class="ap-row" style="gap:4px;">
                  <button class="ap-btn ap-btn-sm ap-btn-ghost" type="button"
                          data-action="set-logs-page" data-page="${logsPage - 1}"
                          ${logsPage <= 1 ? "disabled" : ""}>上页</button>
                  <button class="ap-btn ap-btn-sm ap-btn-ghost" type="button"
                          data-action="set-logs-page" data-page="${logsPage + 1}"
                          ${logsPage >= logsTotalPages ? "disabled" : ""}>下页</button>
                </div>
              </div>
            `}
        </div>
      </div>
    `;
  }

  return { renderAdminLogsSection };
}
