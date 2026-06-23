export function createPathsRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyStateCompact,
  components,
}) {
  function renderAdminProtectedPathsSection(admin) {
    const { protectedPaths, protectedPathsLoading, protectedPathsError } =
      admin;

    return `
      ${
        protectedPathsLoading
          ? renderEmptyStateCompact(
              "正在加载受保护路径",
              "正在获取受保护路径列表。",
              icons.lock,
            )
          : protectedPathsError
            ? components.renderErrorCard({
                icon: icons.lock,
                error: protectedPathsError,
              })
            : protectedPaths.length === 0
              ? renderEmptyStateCompact(
                  "暂无受保护路径",
                  "还没有设置任何受保护路径。点击上方按钮添加。",
                  icons.lock,
                )
              : `
                <div class="latest-list">
                  ${protectedPaths
                    .map((item) => {
                      const path = String(item?.path || item?.folder || "/");
                      const note = item?.note || "";
                      const showName = item?.showName || "";
                      return `
                      <article class="latest-item">
                        <div class="status-bar" style="margin-bottom:8px;">
                          <div class="status-main">
                            <span class="status-dot"></span>
                            <span>${safeText(showName || path)}</span>
                            <span class="toolbar-tag">${safeText(path)}</span>
                          </div>
                          <button class="btn btn-danger" type="button" data-action="confirm-delete-protected-path" data-path="${escapeHtml(path)}">
                            删除
                          </button>
                        </div>
                        ${note ? `<div class="latest-copy">${escapeHtml(note)}</div>` : ""}
                      </article>
                    `;
                    })
                    .join("")}
                </div>
              `
      }
    `;
  }

  function renderAdminHiddenPathsSection(admin) {
    const { hiddenPaths, hiddenPathsLoading, hiddenPathsError } = admin;

    return `
      ${
        hiddenPathsLoading
          ? renderEmptyStateCompact(
              "正在加载隐藏路径",
              "正在获取隐藏路径列表。",
              icons.eye,
            )
          : hiddenPathsError
            ? components.renderErrorCard({
                icon: icons.eye,
                error: hiddenPathsError,
              })
            : hiddenPaths.length === 0
              ? renderEmptyStateCompact(
                  "暂无隐藏路径",
                  "还没有设置任何隐藏路径。点击上方按钮添加。",
                  icons.eye,
                )
              : `
                <div class="latest-list">
                  ${hiddenPaths
                    .map((item) => {
                      const path = String(item?.path || "/");
                      return `
                      <article class="latest-item">
                        <div class="status-bar" style="margin-bottom:8px;">
                          <div class="status-main">
                            <span class="status-dot"></span>
                            <span>${safeText(path)}</span>
                          </div>
                          <button class="btn btn-danger" type="button" data-action="confirm-delete-hidden-path" data-path="${escapeHtml(path)}">
                            取消隐藏
                          </button>
                        </div>
                      </article>
                    `;
                    })
                    .join("")}
                </div>
              `
      }
    `;
  }

  function renderPathManagementSection(admin) {
    const { protectedPaths, protectedPathsLoading, protectedPathsError } =
      admin;
    const { hiddenPaths, hiddenPathsLoading, hiddenPathsError } = admin;

    let protectedHtml = "";
    if (protectedPathsLoading) {
      protectedHtml = renderEmptyStateCompact(
        "正在加载受保护路径",
        "正在获取受保护路径列表。",
        icons.lock,
      );
    } else if (protectedPathsError) {
      protectedHtml = `<div class="empty-state"><div class="empty-orb">${icons.lock}</div><p class="empty-copy">${escapeHtml(protectedPathsError)}</p></div>`;
    } else if (protectedPaths.length === 0) {
      protectedHtml = renderEmptyStateCompact(
        "暂无受保护路径",
        "还没有设置任何受保护路径。点击下方按钮添加。",
        icons.lock,
      );
    } else {
      protectedHtml = `
        <div class="latest-list-compact">
          ${protectedPaths
            .map((item) => {
              const path = String(item?.path || item?.folder || "/");
              const note = item?.note || "";
              const showName = item?.showName || "";
              return `
              <article class="latest-item-compact">
                <div class="status-bar">
                  <div class="status-main">
                    <span class="status-dot"></span>
                    <span>${safeText(showName || path)}</span>
                    <span class="toolbar-tag">${safeText(path)}</span>
                  </div>
                  <button class="btn btn-danger" type="button" data-action="confirm-delete-protected-path" data-path="${escapeHtml(path)}">
                    删除
                  </button>
                </div>
                ${note ? `<div class="latest-copy">${escapeHtml(note)}</div>` : ""}
              </article>
            `;
            })
            .join("")}
        </div>
      `;
    }

    let hiddenHtml = "";
    if (hiddenPathsLoading) {
      hiddenHtml = renderEmptyStateCompact(
        "正在加载隐藏路径",
        "正在获取隐藏路径列表。",
        icons.eye,
      );
    } else if (hiddenPathsError) {
      hiddenHtml = `<div class="empty-state"><div class="empty-orb">${icons.eye}</div><p class="empty-copy">${escapeHtml(hiddenPathsError)}</p></div>`;
    } else if (hiddenPaths.length === 0) {
      hiddenHtml = renderEmptyStateCompact(
        "暂无隐藏路径",
        "还没有设置任何隐藏路径。点击下方按钮添加。",
        icons.eye,
      );
    } else {
      hiddenHtml = `
        <div class="latest-list-compact">
          ${hiddenPaths
            .map((item) => {
              const path = String(item?.path || "/");
              return `
              <article class="latest-item-compact">
                <div class="status-bar">
                  <div class="status-main">
                    <span class="status-dot"></span>
                    <span>${safeText(path)}</span>
                  </div>
                  <button class="btn btn-danger" type="button" data-action="confirm-delete-hidden-path" data-path="${escapeHtml(path)}">
                    取消隐藏
                  </button>
                </div>
              </article>
            `;
            })
            .join("")}
        </div>
      `;
    }

    return `
      <div class="admin-section-compact">
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>受保护路径</h3>
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-protected-path">
              添加
            </button>
          </div>
          ${protectedHtml}
        </section>
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>隐藏路径</h3>
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-hidden-path">
              添加
            </button>
          </div>
          ${hiddenHtml}
        </section>
      </div>
    `;
  }

  return {
    renderAdminProtectedPathsSection,
    renderAdminHiddenPathsSection,
    renderPathManagementSection,
  };
}
