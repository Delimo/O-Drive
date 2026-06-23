export function createNotificationsRenderer({
  icons,
  escapeHtml,
  renderEmptyStateCompact,
  formatRelative,
  components,
}) {
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
        <button class="btn toolbar-btn" type="button" data-action="refresh-admin-notifications">刷新</button>
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
                      <td>${n.read ? "" : `<button class="btn btn-small btn-ghost" type="button" data-action="admin-mark-notif-read" data-notif-id="${n.id}">✓</button>`}</td>
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

  return {
    renderAdminNotificationsSection,
  };
}
