export function createPathsRenderer({
  icons, safeText, escapeHtml, renderEmptyStateCompact, components
}) {

  function renderPathCard({ icon, iconBg, iconColor, title, addAction, items, emptyMsg, loading, error, deleteAction }) {
    if (loading) return renderEmptyStateCompact("加载中", "正在获取数据...", icons.spinner);
    if (error) return `<div class="empty-state-compact" style="padding:16px; text-align:center;"><p class="empty-copy" style="color:var(--danger);">${escapeHtml(error)}</p></div>`;
    
    const listHtml = items.length === 0
      ? `<p style="padding:24px 0; text-align:center; color:var(--muted); font-size:13px; margin:0;">${escapeHtml(emptyMsg)}</p>`
      : items.map(item => {
          const path = String(item?.path || item?.folder || "/");
          const note = item?.note || "";
          const name = item?.showName || path;
          return `
            <div style="margin-bottom:8px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;
                          padding:10px 12px; border-radius:8px; background:var(--panel-soft);
                          border:1px solid var(--line);">
                <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                  <span style="width:6px; height:6px; border-radius:50%; background:${iconColor}; flex-shrink:0;"></span>
                  <span style="font-weight:600; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeText(name)}</span>
                  <span class="toolbar-tag" style="font-size:11px; font-family:monospace; background:var(--line); padding:2px 6px; border-radius:4px; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeText(path)}</span>
                </div>
                <button class="btn btn-danger" type="button"
                        data-action="${escapeHtml(deleteAction)}"
                        data-path="${escapeHtml(path)}"
                        style="min-height:28px; padding:0 10px; font-size:11px; border-radius:6px;">移除</button>
              </div>
              ${note ? `<div style="font-size:12px; color:var(--muted); margin:4px 0 8px 14px; line-height:1.4;">备注: ${escapeHtml(note)}</div>` : ""}
            </div>
          `;
        }).join("");

    return `
      <div class="admin-card" style="padding:0; background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; height:100%;">
        <div style="display:flex; align-items:center; gap:8px; padding:14px 16px; border-bottom:1px solid var(--line);">
          <div style="width:28px; height:28px; border-radius:6px; display:grid; place-items:center; background:${iconBg}; color:${iconColor}; flex-shrink:0;">
            ${icon}
          </div>
          <span style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--text); flex:1;">${escapeHtml(title)}</span>
          <button class="btn btn-primary" type="button"
                  data-action="${escapeHtml(addAction)}"
                  style="min-height:28px; padding:0 12px; font-size:11px; font-weight:600; border-radius:6px;">添加路径</button>
        </div>
        <div style="padding:16px; flex:1; display:flex; flex-direction:column; gap:4px; overflow-y:auto;">${listHtml}</div>
      </div>
    `;
  }

  function renderPathManagementSection(admin) {
    const { protectedPaths = [], protectedPathsLoading, protectedPathsError } = admin;
    const { hiddenPaths = [], hiddenPathsLoading, hiddenPathsError } = admin;

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px;">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:20px; font-weight:700; color:var(--text);">路径管理</h2>
            <p class="ov-page-desc" style="margin:4px 0 0; font-size:13px; color:var(--muted);">设置需要强制输入权限密码的“受保护路径”，以及在前台界面不可见的“隐藏路径”</p>
          </div>
        </div>
        <div class="admin-grid" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:16px;">
          <div>
            ${renderPathCard({
              icon: icons.lock,
              iconBg: "rgba(14,116,144,0.1)",
              iconColor: "#0e7490",
              title: "受保护路径 (Protected)",
              addAction: "show-add-protected-path",
              deleteAction: "confirm-delete-protected-path",
              items: protectedPaths,
              loading: protectedPathsLoading,
              error: protectedPathsError,
              emptyMsg: "目前没有设置受保护路径。",
            })}
          </div>
          <div>
            ${renderPathCard({
              icon: icons.eye,
              iconBg: "rgba(139,92,246,0.1)",
              iconColor: "#8b5cf6",
              title: "隐藏路径 (Hidden)",
              addAction: "show-add-hidden-path",
              deleteAction: "confirm-delete-hidden-path",
              items: hiddenPaths,
              loading: hiddenPathsLoading,
              error: hiddenPathsError,
              emptyMsg: "目前没有设置隐藏路径。",
            })}
          </div>
        </div>
      </div>
    `;
  }

  return {
    renderAdminProtectedPathsSection: renderPathManagementSection,
    renderAdminHiddenPathsSection: renderPathManagementSection,
    renderPathManagementSection,
  };
}