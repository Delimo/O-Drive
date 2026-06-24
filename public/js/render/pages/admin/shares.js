export function createSharesRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderAdminSharesSection(admin) {
    const {
      shares = [], shareFilter = "all", shareSearch = "", sharesLoading, sharesError,
      protectedPaths = [], protectedPathsLoading, protectedPathsError,
      hiddenPaths = [], hiddenPathsLoading, hiddenPathsError
    } = admin;

    if (sharesError) {
      return components.renderErrorCard({ icon: "", error: sharesError, onRetry: "refresh-admin-shares" });
    }
    if (sharesLoading) {
      return renderEmptyStateCompact("载入中", "拉取外链列表中...", "");
    }

    return `
      <div class="ov-shares">
        <div class="ov-shares-header">
          <div class="ov-shares-title-group">
            <h2 class="ov-shares-title">分享与路径</h2>
            <p class="ov-shares-desc">外链管理、受保护路径与隐藏路径配置</p>
          </div>
          <button class="btn btn-danger btn-sm" type="button" data-action="confirm-cleanup-expired-shares">清理过期</button>
        </div>

        <div class="ov-shares-top">
          <div class="ov-shares-filter">
            <input class="input" type="text"
                   data-action-input="set-shares-search" value="${escapeHtml(shareSearch)}"
                   placeholder="搜索文件名、令牌...">
            <select class="input" data-action-change="set-shares-filter">
              <option value="all" ${shareFilter === "all" ? "selected" : ""}>全部状态</option>
              <option value="active" ${shareFilter === "active" ? "selected" : ""}>有效</option>
              <option value="expired" ${shareFilter === "expired" ? "selected" : ""}>已过期</option>
              <option value="exhausted" ${shareFilter === "exhausted" ? "selected" : ""}>额度耗尽</option>
            </select>
          </div>
        </div>

        <div class="ov-shares-content">
          <div class="ov-shares-list">
            ${shares.length === 0
              ? `<div class="ov-empty-inline">无符合条件的外链</div>`
              : shares.map(share => {
                  const isExpired = share.expired || (share.expiresAt && share.expiresAt < Date.now());
                  const isExhausted = share.exhausted;
                  const isActive = !isExpired && !isExhausted;
                  const statusCls = isExpired ? 'ov-badge-error' : isExhausted ? 'ov-badge-warn' : 'ov-badge-ok';
                  const statusText = isExpired ? '已过期' : isExhausted ? '耗尽' : '有效';

                  return `
                    <div class="ov-share-item">
                      <div class="ov-share-info">
                        <div class="ov-share-main">
                          <span class="ov-share-dot" style="background:${isActive ? '#10b981' : 'var(--danger)'};"></span>
                          <span class="ov-share-name">${safeText(share.name, "未命名资源")}</span>
                          <span class="ov-badge ${statusCls}">${statusText}</span>
                          ${share.hasPassword ? `<span class="ov-tag">加密</span>` : ""}
                        </div>
                        <div class="ov-share-meta">
                          <span>路径: ${escapeHtml(share.path)}</span>
                          <span>下载: ${share.downloadCount}/${share.maxDownloads || "∞"}</span>
                          ${share.expiresAt ? `<span>到期: ${formatTime(share.expiresAt)}</span>` : ""}
                        </div>
                      </div>
                      <div class="ov-share-actions">
                        <button class="btn btn-sm" type="button"
                                data-action="copy-share-link" data-key="${escapeHtml(share.token)}">复制</button>
                        <button class="btn btn-danger btn-sm" type="button"
                                data-action="confirm-delete-share"
                                data-key="${escapeHtml(share.token)}"
                                data-name="${escapeHtml(share.name)}">移除</button>
                      </div>
                    </div>
                  `;
                }).join("")}
          </div>
        </div>

        <div class="ov-shares-paths">
          <div class="ov-path-section">
            <div class="ov-path-header">
              <div class="ov-path-title-group">
                <span class="ov-path-dot" style="background:var(--accent);"></span>
                <span class="ov-path-title">受保护路径</span>
              </div>
              <button class="btn btn-sm" type="button" data-action="show-add-protected-path">添加</button>
            </div>
            <div class="ov-path-body">
              ${protectedPathsLoading
                ? `<div class="ov-empty-inline">载入中...</div>`
                : protectedPathsError
                  ? `<div class="ov-empty-inline" style="color:var(--danger);">${escapeHtml(protectedPathsError)}</div>`
                  : protectedPaths.length === 0
                    ? `<div class="ov-empty-inline">尚未配置受保护路径</div>`
                    : `<div class="ov-path-list">
                        ${protectedPaths.map(item => {
                          const path = String(item?.path || item?.folder || "/");
                          const note = item?.note || "";
                          const name = item?.showName || path;
                          return `
                            <div class="ov-path-item">
                              <div class="ov-path-item-info">
                                <span class="ov-path-item-dot" style="background:var(--accent);"></span>
                                <span class="ov-path-item-name">${safeText(name)}</span>
                                <code class="ov-path-item-code">${safeText(path)}</code>
                              </div>
                              <button class="btn btn-sm" type="button"
                                      data-action="confirm-delete-protected-path"
                                      data-path="${escapeHtml(path)}">移除</button>
                            </div>
                            ${note ? `<div class="ov-path-item-note">${escapeHtml(note)}</div>` : ""}
                          `;
                        }).join("")}
                      </div>`
              }
            </div>
          </div>

          <div class="ov-path-section">
            <div class="ov-path-header">
              <div class="ov-path-title-group">
                <span class="ov-path-dot" style="background:#8b5cf6;"></span>
                <span class="ov-path-title">隐藏路径</span>
              </div>
              <button class="btn btn-sm" type="button" data-action="show-add-hidden-path">添加</button>
            </div>
            <div class="ov-path-body">
              ${hiddenPathsLoading
                ? `<div class="ov-empty-inline">载入中...</div>`
                : hiddenPathsError
                  ? `<div class="ov-empty-inline" style="color:var(--danger);">${escapeHtml(hiddenPathsError)}</div>`
                  : hiddenPaths.length === 0
                    ? `<div class="ov-empty-inline">尚未配置隐藏路径</div>`
                    : `<div class="ov-path-list">
                        ${hiddenPaths.map(item => {
                          const path = String(item?.path || item?.folder || "/");
                          const note = item?.note || "";
                          const name = item?.showName || path;
                          return `
                            <div class="ov-path-item">
                              <div class="ov-path-item-info">
                                <span class="ov-path-item-dot" style="background:#8b5cf6;"></span>
                                <span class="ov-path-item-name">${safeText(name)}</span>
                                <code class="ov-path-item-code">${safeText(path)}</code>
                              </div>
                              <button class="btn btn-sm" type="button"
                                      data-action="confirm-delete-hidden-path"
                                      data-path="${escapeHtml(path)}">移除</button>
                            </div>
                            ${note ? `<div class="ov-path-item-note">${escapeHtml(note)}</div>` : ""}
                          `;
                        }).join("")}
                      </div>`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderSharePage() { return ``; }

  return { renderAdminSharesSection, renderSharePage };
}
