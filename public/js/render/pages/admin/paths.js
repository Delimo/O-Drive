export function createPathsRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyStateCompact,
  components,
}) {
  function renderPathManagementSection(admin) {
    const { protectedPaths, protectedPathsLoading, protectedPathsError } = admin;
    const { hiddenPaths, hiddenPathsLoading, hiddenPathsError } = admin;

    let protectedHtml = "";
    if (protectedPathsLoading) {
      protectedHtml = renderEmptyStateCompact("正在加载受保护路径", "正在获取受保护路径列表。", icons.lock);
    } else if (protectedPathsError) {
      protectedHtml = `<div class="empty-state"><div class="empty-orb">${icons.lock}</div><p class="empty-copy">${escapeHtml(protectedPathsError)}</p></div>`;
    } else if (protectedPaths.length === 0) {
      protectedHtml = renderEmptyStateCompact("暂无受保护路径", "还没有设置任何受保护路径。", icons.lock);
    } else {
      protectedHtml = protectedPaths.map((item) => {
        const path = String(item?.path || item?.folder || "/");
        const note = item?.note || "";
        const showName = item?.showName || "";
        return `
          <div class="attention-item">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
                <span class="ov2-alert-dot" style="background:var(--accent);width:6px;height:6px;"></span>
                <span style="font-weight:600;font-size:13px;">${safeText(showName || path)}</span>
                <span class="toolbar-tag" style="font-size:11px;">${safeText(path)}</span>
              </div>
              <button class="btn btn-danger" type="button" data-action="confirm-delete-protected-path" data-path="${escapeHtml(path)}" style="min-height:28px;padding:0 8px;font-size:11px;">删除</button>
            </div>
            ${note ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">${escapeHtml(note)}</div>` : ""}
          </div>
        `;
      }).join("");
    }

    let hiddenHtml = "";
    if (hiddenPathsLoading) {
      hiddenHtml = renderEmptyStateCompact("正在加载隐藏路径", "正在获取隐藏路径列表。", icons.eye);
    } else if (hiddenPathsError) {
      hiddenHtml = `<div class="empty-state"><div class="empty-orb">${icons.eye}</div><p class="empty-copy">${escapeHtml(hiddenPathsError)}</p></div>`;
    } else if (hiddenPaths.length === 0) {
      hiddenHtml = renderEmptyStateCompact("暂无隐藏路径", "还没有设置任何隐藏路径。", icons.eye);
    } else {
      hiddenHtml = hiddenPaths.map((item) => {
        const path = String(item?.path || "/");
        return `
          <div class="attention-item">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
                <span class="ov2-alert-dot" style="background:#8b5cf6;width:6px;height:6px;"></span>
                <span style="font-weight:600;font-size:13px;">${safeText(path)}</span>
              </div>
              <button class="btn btn-danger" type="button" data-action="confirm-delete-hidden-path" data-path="${escapeHtml(path)}" style="min-height:28px;padding:0 8px;font-size:11px;">取消隐藏</button>
            </div>
          </div>
        `;
      }).join("");
    }

    return `
      <div class="ov-page">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title">路径管理</h2>
            <p class="ov-page-desc">管理受保护路径与隐藏路径</p>
          </div>
        </div>

        <div class="admin-grid">
          <div class="admin-card span-6">
            <div class="admin-card-header">
              <div class="admin-card-icon" style="background:rgba(14,116,144,0.1);color:#0e7490">${icons.lock}</div>
              <span class="admin-label">受保护路径</span>
              <button class="btn btn-primary" type="button" data-action="show-add-protected-path" style="margin-left:auto;min-height:28px;padding:0 8px;font-size:11px;">添加</button>
            </div>
            <div class="attention-list-compact">${protectedHtml}</div>
          </div>
          <div class="admin-card span-6">
            <div class="admin-card-header">
              <div class="admin-card-icon" style="background:rgba(139,92,246,0.1);color:#8b5cf6">${icons.eye}</div>
              <span class="admin-label">隐藏路径</span>
              <button class="btn btn-primary" type="button" data-action="show-add-hidden-path" style="margin-left:auto;min-height:28px;padding:0 8px;font-size:11px;">添加</button>
            </div>
            <div class="attention-list-compact">${hiddenHtml}</div>
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
