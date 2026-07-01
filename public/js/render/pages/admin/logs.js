export function createLogsRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {
  const ACTION_LABELS = {
    upload: "上传",
    delete: "删除",
    share: "分享",
    share_create: "创建分享",
    share_delete: "删除分享",
    share_cleanup: "清理分享",
    login: "登录",
    mkdir: "新建文件夹",
    rename: "重命名",
    trash: "移入回收站",
    purge: "永久清理",
    trash_clear: "清空回收站",
    task_create: "创建任务",
    maintenance: "运维指令",
    copy: "复制",
    move: "移动",
    restore: "恢复",
  };

  function getActionLabel(action) {
    const raw = String(action || "").trim();
    if (!raw) return "未知操作";
    const normalized = raw.toLowerCase().replace(/-/g, "_");
    return ACTION_LABELS[normalized] || raw.toUpperCase();
  }

  function getLogTime(log = {}) {
    return log.timestamp || log.createdAt || log.created_at || log.time || 0;
  }

  function getLogPath(log = {}) {
    return log.path || log.targetPath || log.target_path || log.details || "";
  }

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

        <div class="ov-logs-filter-shell">
          <div class="ov-logs-filter-row">
            <input class="input" type="text"
                   data-action-input="set-logs-filter" data-key="q"
                   value="${escapeHtml(logsFilter.q || "")}" placeholder="关键词：路径、详情、IP">
            ${components.renderCustomSelect({
              value: logsFilter.action || "",
              options: [
                { value: "", label: "全部事件" },
                { value: "upload", label: "上传" },
                { value: "delete", label: "删除" },
                { value: "share_create", label: "创建分享" },
                { value: "share_delete", label: "删除分享" },
                { value: "trash", label: "移入回收站" },
                { value: "login", label: "安全登录" },
              ],
              actionChange: "set-logs-filter",
              dataKey: "action",
              className: "ov-logs-action-select",
            })}
            <input class="input" type="text"
                   data-action-input="set-logs-filter" data-key="ip"
                   value="${escapeHtml(logsFilter.ip || "")}" placeholder="IP">
            <div class="ov-logs-date-range">
              ${components.renderCustomDatePicker({
                value: logsFilter.from || "",
                placeholder: "开始日期",
                actionChange: "set-logs-filter",
                dataKey: "from",
                className: "ov-logs-date-from",
              })}
              <span class="ov-logs-date-sep">–</span>
              ${components.renderCustomDatePicker({
                value: logsFilter.to || "",
                placeholder: "结束日期",
                actionChange: "set-logs-filter",
                dataKey: "to",
                className: "ov-logs-date-to",
              })}
            </div>
            <div class="ov-logs-filter-actions">
              <button class="btn btn-primary" type="button" data-action="refresh-admin-logs">筛选</button>
              <button class="btn" type="button" data-action="reset-logs-filter">重置</button>
            </div>
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
                      <th scope="col">操作时间</th>
                      <th scope="col">动作行为</th>
                      <th scope="col">目标资源路径</th>
                      <th scope="col">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${logs.map(log => {
                      const rawAction = String(log.action || "-");
                      const actKey = rawAction.toLowerCase().replace(/-/g, "_");
                      const actCls = actKey === "delete" || actKey === "purge" || actKey === "trash_clear" ? "ov-action-danger" : actKey === "login" ? "ov-action-ok" : "";
                      const actLabel = getActionLabel(rawAction);
                      const logTime = getLogTime(log);
                      const logPath = getLogPath(log);
                      return `
                        <tr>
                          <td class="ov-td-muted">${formatTime(logTime)}</td>
                          <td>
                            <span class="ov-action-tag ${actCls}" title="${escapeHtml(rawAction)}">
                              <span class="ov-action-main">${escapeHtml(actLabel)}</span>
                              <span class="ov-action-sub">${escapeHtml(rawAction)}</span>
                            </span>
                          </td>
                          <td class="ov-td-mono" title="${escapeHtml(String(logPath || "-"))}">${safeText(logPath, "-")}</td>
                          <td class="ov-td-mono ov-td-muted" title="${escapeHtml(String(log.ip || "-"))}">${safeText(log.ip, "-")}</td>
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
                          aria-label="上一页"
                          ${logsPage <= 1 ? "disabled" : ""}>上页</button>
                  <button class="btn btn-sm" type="button"
                          data-action="set-logs-page" data-page="${logsPage + 1}"
                          aria-label="下一页"
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
