export function createHeaderRenderer({ icons, escapeHtml, formatRelative }) {
  function renderNotifications(state) {
    return `
      <div class="relative" data-component="notifications">
        <button class="header-icon-btn notif-bell" data-action="toggle-notifications" aria-label="通知">
          <span class="icon">${icons.bell}</span>
          <span class="notif-dot${state.admin.notificationsUnread ? "" : " notif-hidden"}" data-role="notif-count"></span>
        </button>
        <div class="notif-dropdown${state.admin.notifOpen ? " notif-open" : ""}" data-role="notif-dropdown">
          <div class="notif-dropdown-head">
            <span class="notif-dropdown-title">通知</span>
            <button class="px-3 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors" data-action="mark-all-notifications-read" ${state.admin.notificationsUnread ? "" : "disabled"}>全部已读</button>
          </div>
          <div class="notif-dropdown-body">
            ${
              state.admin.notifications.length
                ? state.admin.notifications
                    .map(
                      (n) => `
                  <div class="notif-item ${n.read ? "" : "notif-item-unread"}" data-notif-id="${n.id}">
                    <div class="notif-item-main">
                      <div class="notif-item-msg">${escapeHtml(n.message)}</div>
                      <div class="notif-item-time">${formatRelative(n.created_at)}</div>
                    </div>
                    ${n.read ? "" : `<button class="notif-item-dismiss" data-action="mark-notification-read" data-notif-id="${n.id}" aria-label="标记已读">${icons.close}</button>`}
                  </div>
                `,
                    )
                    .join("")
                : `<div class="notif-empty">暂无通知</div>`
            }
          </div>
        </div>
      </div>
    `;
  }

  function renderHeader(state, page) {
    const { role, guestMode } = state.app;
    const searchValue = page === "home" ? state.explorer.queryDraft : "";

    return `
      <header class="header-card mb-4 flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
        <a href="/" class="brand-link flex items-center gap-3 text-lg font-bold text-slate-900 tracking-tight">
          <svg class="w-8 h-8 text-[#b9c6d2]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
          </svg>
          <span class="text-xl font-bold text-slate-800">O-Drive</span>
        </a>
        <div class="flex items-center gap-3">
          ${
            page === "home" && (role === "admin" || guestMode)
              ? `
            <div class="search-bar relative">
              <span class="absolute inset-y-0 left-3 flex items-center text-slate-400">🔍</span>
              <input type="search" value="${escapeHtml(searchValue)}" placeholder="搜索文件..." data-role="search-input" aria-label="搜索文件" class="w-44 pl-9 pr-3 py-1.5 text-sm bg-[#fafbfc] border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-slate-300 transition-all">
            </div>
          `
              : ""
          }
          <button class="header-icon-btn header-theme-btn" data-action="toggle-theme" aria-label="切换主题"><span class="icon">${icons.sun}</span><span class="icon">${icons.moon}</span><span class="icon">${icons.system}</span></button>
          ${role === "admin" ? renderNotifications(state) : ""}
          <div class="flex items-center gap-2">
            ${
              page === "admin"
                ? `<a class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" href="/">返回云盘</a>`
                : `${role === "admin" ? `<a class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" href="/admin">管理</a>` : ""}${
                    role === "admin"
                      ? `<button class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" data-action="logout">退出</button>`
                      : `<button class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" data-action="open-login">登录</button>`
                  }`
            }
          </div>
        </div>
      </header>
    `;
  }

  return { renderHeader };
}
