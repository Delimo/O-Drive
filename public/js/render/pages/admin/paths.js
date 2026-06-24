export function createPathsRenderer({
  safeText, escapeHtml, renderEmptyStateCompact
}) {

  function renderPathCard({ listBorderColor, title, addAction, items, emptyMsg, loading, error, deleteAction }) {
    if (loading) return renderEmptyStateCompact("载入中...", "", "");
    if (error) return `<p style="color:var(--danger); font-size:11px; text-align:center;">${escapeHtml(error)}</p>`;
    
    const listHtml = items.length === 0
      ? `<p style="padding:16px 0; text-align:center; color:var(--muted); font-size:12px; margin:0;">${escapeHtml(emptyMsg)}</p>`
      : `<div style="display:flex; flex-direction:column; max-height:190px; overflow-y:auto;">
          ${items.map(item => {
            const path = String(item?.path || item?.folder || "/");
            const note = item?.note || "";
            const name = item?.showName || path;
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line); font-size:12px;">
                <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                  <span style="width:6px; height:6px; border-radius:50%; background:${listBorderColor}; flex-shrink:0;"></span>
                  <span style="font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeText(name)}</span>
                  <span style="font-family:monospace; font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">(${safeText(path)})</span>
                </div>
                <button class="btn btn-danger" type="button" data-action="${escapeHtml(deleteAction)}" data-path="${escapeHtml(path)}"
                        style="height:22px; padding:0 6px; font-size:11px; border-radius:4px;">移除</button>
              </div>
            `;
          }).join("")}
        </div>`;

    return `
      <div style="display:flex; flex-direction:column; height:100%;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid var(--line); margin-bottom:8px;">
          <span style="font-size:12px; font-weight:600; color:var(--text); text-transform:uppercase; letter-spacing:0.05em;">${escapeHtml(title)}</span>
          <button class="btn" type="button" data-action="${escapeHtml(addAction)}" style="font-size:11px; padding:2px 8px; border:1px solid var(--line); border-radius:4px; background:transparent; color:var(--accent);">+ 添加</button>
        </div>
        <div>${listHtml}</div>
      </div>
    `;
  }

  function renderPathManagementSection(admin) {
    const { protectedPaths = [], protectedPathsLoading, protectedPathsError } = admin;
    const { hiddenPaths = [], hiddenPathsLoading, hiddenPathsError } = admin;

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:12px; height:100%; overflow:hidden; font-family:system-ui, sans-serif;">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:16px; font-weight:600; color:var(--text);">路径限制</h2>
            <p class="ov-page-desc" style="margin:2px 0 0; font-size:11px; color:var(--muted);">设置密码保护目录及前台隐藏目录</p>
          </div>
        </div>
        
        <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:24px; border-top:1px solid var(--line); padding-top:16px; flex:1; min-h-0;">
          <div>
            ${renderPathCard({
              listBorderColor: "var(--accent)",
              title: "受保护路径",
              addAction: "show-add-protected-path",
              deleteAction: "confirm-delete-protected-path",
              items: protectedPaths,
              loading: protectedPathsLoading,
              error: protectedPathsError,
              emptyMsg: "尚未配置受保护路径",
            })}
          </div>
          <div style="border-left:1px solid var(--line); padding-left:24px;">
            ${renderPathCard({
              listBorderColor: "#8b5cf6",
              title: "隐藏路径",
              addAction: "show-add-hidden-path",
              deleteAction: "confirm-delete-hidden-path",
              items: hiddenPaths,
              loading: hiddenPathsLoading,
              error: hiddenPathsError,
              emptyMsg: "尚未配置隐藏路径",
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