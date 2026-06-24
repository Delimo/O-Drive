export function createSharesRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderAdminSharesSection(admin) {
    const { shares = [], shareFilter = "all", shareSearch = "", sharesLoading, sharesError } = admin;

    if (sharesError) {
      return components.renderErrorCard({ icon: "", error: sharesError, onRetry: "refresh-admin-shares" });
    }
    if (sharesLoading) {
      return renderEmptyStateCompact("载入中", "拉取外链列表中...", "");
    }

    return `
      <div class="ap">
        <div class="ap-head">
          <div>
            <h2 class="ap-title">外链管理</h2>
            <p class="ap-desc">管理本系统内下发的所有外链及其状态</p>
          </div>
          <button class="ap-btn ap-btn-danger" type="button" data-action="confirm-cleanup-expired-shares">清理过期</button>
        </div>

        <div class="ap-filter-bar">
          <input class="ap-input ap-input-search" type="text"
                 data-action-input="set-shares-search" value="${escapeHtml(shareSearch)}"
                 placeholder="搜索文件名、令牌...">
          <select class="ap-input ap-input-select" data-action-change="set-shares-filter">
            <option value="all" ${shareFilter === "all" ? "selected" : ""}>全部状态</option>
            <option value="active" ${shareFilter === "active" ? "selected" : ""}>有效</option>
            <option value="expired" ${shareFilter === "expired" ? "selected" : ""}>已过期</option>
            <option value="exhausted" ${shareFilter === "exhausted" ? "selected" : ""}>额度耗尽</option>
          </select>
        </div>

        <div class="ap-list" style="flex:1;overflow-y:auto;">
          ${shares.length === 0
            ? `<p class="ap-empty-inline">无符合条件的外链</p>`
            : shares.map(share => {
                const isExpired = share.expired || (share.expiresAt && share.expiresAt < Date.now());
                const isExhausted = share.exhausted;
                const isActive = !isExpired && !isExhausted;
                const statusCls = isExpired ? 'ap-badge-error' : isExhausted ? 'ap-badge-warn' : 'ap-badge-ok';
                const statusText = isExpired ? '已过期' : isExhausted ? '耗尽' : '有效';

                return `
                  <div class="ap-list-row" style="padding:12px 14px;">
                    <div class="ap-list-row-main" style="flex:1;min-width:0;">
                      <div class="ap-row" style="align-items:center;gap:6px;min-width:0;">
                        <span style="width:6px;height:6px;border-radius:1px;background:${isActive ? '#10b981' : 'var(--danger)'};flex-shrink:0;"></span>
                        <span class="ap-list-row-name" style="max-width:260px;">${safeText(share.name, "未命名资源")}</span>
                        <span class="ap-badge ${statusCls}">${statusText}</span>
                        ${share.hasPassword ? `<span class="ap-tag">加密</span>` : ""}
                      </div>
                      <div class="ap-row" style="gap:12px;margin-top:4px;font-size:11px;color:var(--muted);flex-wrap:wrap;">
                        <span>路径: ${escapeHtml(share.path)}</span>
                        <span>下载: ${share.downloadCount}/${share.maxDownloads || "∞"}</span>
                        ${share.expiresAt ? `<span>到期: ${formatTime(share.expiresAt)}</span>` : ""}
                      </div>
                    </div>
                    <div class="ap-row" style="gap:4px;flex-shrink:0;">
                      <button class="ap-btn ap-btn-sm ap-btn-ghost" type="button"
                              data-action="copy-share-link" data-key="${escapeHtml(share.token)}">复制</button>
                      <button class="ap-btn ap-btn-sm ap-btn-danger" type="button"
                              data-action="confirm-delete-share"
                              data-key="${escapeHtml(share.token)}"
                              data-name="${escapeHtml(share.name)}">移除</button>
                    </div>
                  </div>
                `;
              }).join("")}
        </div>
      </div>
    `;
  }

  function renderSharePage() { return ``; }

  return { renderAdminSharesSection, renderSharePage };
}
