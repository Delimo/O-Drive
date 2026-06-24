export function createPathsRenderer({
  safeText, escapeHtml, renderEmptyStateCompact
}) {

  function renderPathCard({ accent, title, addAction, items, emptyMsg, loading, error, deleteAction }) {
    if (loading) return renderEmptyStateCompact("载入中...", "", "");
    if (error) return `<div class="ap-card" style="border-left:3px solid var(--danger);"><p class="ap-desc-text" style="color:var(--danger);margin:0;">${escapeHtml(error)}</p></div>`;

    return `
      <div class="ap-card ap-col-6">
        <div class="ap-card-head" style="border-bottom:1px solid var(--line);margin-bottom:0;padding-bottom:10px;">
          <div class="ap-row" style="align-items:center;gap:8px;">
            <span style="width:8px;height:8px;border-radius:2px;background:${accent};flex-shrink:0;"></span>
            <span class="ap-lbl" style="margin:0;">${escapeHtml(title)}</span>
          </div>
          <button class="ap-btn ap-btn-sm" type="button" data-action="${escapeHtml(addAction)}">+ 添加</button>
        </div>
        <div class="ap-card-body" style="padding:0;">
          ${items.length === 0
            ? `<p class="ap-empty-inline">${escapeHtml(emptyMsg)}</p>`
            : `<div class="ap-list">
                ${items.map(item => {
                  const path = String(item?.path || item?.folder || "/");
                  const note = item?.note || "";
                  const name = item?.showName || path;
                  return `
                    <div class="ap-list-row">
                      <div class="ap-list-row-main">
                        <span style="width:6px;height:6px;border-radius:1px;background:${accent};flex-shrink:0;"></span>
                        <span class="ap-list-row-name">${safeText(name)}</span>
                        <code class="ap-list-row-code">${safeText(path)}</code>
                      </div>
                      <button class="ap-btn ap-btn-sm ap-btn-ghost" type="button"
                              data-action="${escapeHtml(deleteAction)}"
                              data-path="${escapeHtml(path)}">移除</button>
                    </div>
                    ${note ? `<div class="ap-list-row-note">${escapeHtml(note)}</div>` : ""}
                  `;
                }).join("")}
              </div>`
          }
        </div>
      </div>
    `;
  }

  function renderPathManagementSection(admin) {
    const { protectedPaths = [], protectedPathsLoading, protectedPathsError } = admin;
    const { hiddenPaths = [], hiddenPathsLoading, hiddenPathsError } = admin;

    return `
      <div class="ap">
        <div class="ap-head">
          <div>
            <h2 class="ap-title">路径管理</h2>
            <p class="ap-desc">设置密码保护目录及前台隐藏目录</p>
          </div>
        </div>
        <div class="ap-grid" style="margin-top:4px;">
          ${renderPathCard({
            accent: "var(--accent)",
            title: "受保护路径",
            addAction: "show-add-protected-path",
            deleteAction: "confirm-delete-protected-path",
            items: protectedPaths,
            loading: protectedPathsLoading,
            error: protectedPathsError,
            emptyMsg: "尚未配置受保护路径",
          })}
          ${renderPathCard({
            accent: "#8b5cf6",
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
    `;
  }

  return {
    renderAdminProtectedPathsSection: renderPathManagementSection,
    renderAdminHiddenPathsSection: renderPathManagementSection,
    renderPathManagementSection,
  };
}
