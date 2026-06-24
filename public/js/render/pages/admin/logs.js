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
      <div class="ov-logs">
        <div class="ov-logs-header">
          <div class="ov-logs-title-group">
            <h2 class="ov-logs-title">审计日志</h2>
            <p class="ov-logs-desc">记录平台所有的管理员安全及数据更改行为</p>
          </div>
        </div>

        <div class="ov-logs-filter">
          <input class="input" type="text"
                 data-action-input="set-logs-filter" data-key="q"
                 value="${escapeHtml(logsFilter.q || "")}" placeholder="过滤关键词...">
          <select class="input" data-action-change="set-logs-filter" data-key="action">
            <option value="">全部事件</option>
            <option value="upload" ${logsFilter.action === "upload" ? "selected" : ""}>上传</option>
            <option value="delete" ${logsFilter.action === "delete" ? "selected" : ""}>删除</option>
            <option value="share" ${logsFilter.action === "share" ? "selected" : ""}>共享</option>
            <option value="login" ${logsFilter.action === "login" ? "selected" : ""}>安全登录</option>
          </select>
          <div class="ov-logs-date-range">
            <input class="input" type="date" data-action-change="set-logs-filter" data-key="from"
                   value="${escapeHtml(logsFilter.from || "")}">
            <span class="ov-logs-date-sep">–</span>
            <input class="input" type="date" data-action-change="set-logs-filter" data-key="to"
                   value="${escapeHtml(logsFilter.to || "")}">
          </div>
        </div>

        <div class="ov-logs-content">
          ${logs.length === 0
            ? `<div class="ov-empty-inline">无匹配行为日志</div>`
            : `
              <div class="ov-logs-table-wrap">
                <table class="ov-logs-table">
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
                      const actCls = log.action === "delete" ? 'ov-action-danger' : log.action === "login" ? 'ov-action-ok' : '';
                      return `
                        <tr>
                          <td class="ov-td-muted">${formatTime(log.createdAt)}</td>
                          <td><span class="ov-action-tag ${actCls}">${escapeHtml(log.action)}</span></td>
                          <td class="ov-td-mono">${safeText(log.path, "-")}</td>
                          <td class="ov-td-mono ov-td-muted">${safeText(log.ip, "-")}</td>
                        </tr>
                      `;
                    }).join("")}
                  </tbody>
                </table>
              </div>
              <div class="ov-logs-pagination">
                <span class="ov-logs-page-info">第 ${logsPage} / ${logsTotalPages} 页</span>
                <div class="ov-logs-page-btns">
                  <button class="btn btn-sm" type="button"
                          data-action="set-logs-page" data-page="${logsPage - 1}"
                          ${logsPage <= 1 ? "disabled" : ""}>上页</button>
                  <button class="btn btn-sm" type="button"
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
