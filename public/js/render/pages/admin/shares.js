export function createSharesRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderAdminSharesSection(admin) {
    const {
      shares = [], shareFilter = "all", shareSearch = "", sharesLoading, sharesError
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
            <h2 class="ov-shares-title">分享管理</h2>
            <p class="ov-shares-desc">外链管理</p>
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

      </div>
    `;
  }

  function renderSharePage() { return ``; }

  return { renderAdminSharesSection, renderSharePage };
}
