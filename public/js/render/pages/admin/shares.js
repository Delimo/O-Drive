export function createSharesRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, formatRelative,
  filterShares, getFilterLabel, getShareStatusTags, components
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

    const now = Date.now();
    const visibleShares = filterShares(shares, shareFilter);
    const totalShares = shares.length;
    const activeShares = shares.filter((item) => !item?.expired && !item?.exhausted && !(item?.expiresAt && item.expiresAt < now)).length;
    const inactiveShares = totalShares - activeShares;
    const passwordShares = shares.filter((item) => item?.hasPassword).length;
    const selectedLabel = getFilterLabel(shareFilter);
    const hasSearch = String(shareSearch || "").trim().length > 0;

    function renderStat(label, value, tone = "") {
      return `
        <div class="ov-share-stat${tone ? ` ov-share-stat-${tone}` : ""}">
          <span class="ov-share-stat-label">${escapeHtml(label)}</span>
          <span class="ov-share-stat-value">${escapeHtml(String(value))}</span>
        </div>
      `;
    }

    function renderShareTags(item) {
      const tags = getShareStatusTags(item);
      return tags
        .filter((tag) => tag.className !== "tag-password")
        .slice(0, 3)
        .map((tag) => `<span class="ov-share-pill ${escapeHtml(tag.className)}">${escapeHtml(tag.label)}</span>`)
        .join("");
    }

    function renderShareItem(share) {
      const isExpired = share?.expired || (share?.expiresAt && share.expiresAt < now);
      const isExhausted = share?.exhausted;
      const isActive = isShareActive(share);
      const statusText = isExpired ? "已失效" : isExhausted ? "已用尽" : "有效";
      const statusClass = isExpired ? "ov-badge-error" : isExhausted ? "ov-badge-warn" : "ov-badge-ok";
      const lastAccessText = share?.lastAccessedAt
        ? `最近访问 ${formatRelative(share.lastAccessedAt)}`
        : "暂无访问记录";

      return `
        <div class="ov-share-item">
          <div class="ov-share-main">
            <div class="ov-share-item-head">
              <div class="ov-share-item-title-row">
                <span class="ov-share-dot${isActive ? " is-on" : ""}"></span>
                <span class="ov-share-name">${safeText(share.name, "未命名资源")}</span>
                <span class="ov-badge ${statusClass}">${statusText}</span>
                ${share?.hasPassword ? `<span class="ov-share-pill tag-password">有密码</span>` : ""}
              </div>
              <div class="ov-share-path">${escapeHtml(share.path || "-")}</div>
            </div>
            <div class="ov-share-meta">
              <span>${escapeHtml(lastAccessText)}</span>
              <span>下载 ${escapeHtml(String(share.downloadCount || 0))}/${escapeHtml(String(share.maxDownloads || "∞"))}</span>
              ${share?.expiresAt ? `<span>到期 ${escapeHtml(formatTime(share.expiresAt))}</span>` : `<span>无限期</span>`}
            </div>
            <div class="ov-share-tags">
              ${renderShareTags(share)}
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
    }

    return `
      <div class="ov-shares">
        <div class="ov-shares-hero">
          <div class="ov-shares-title-group">
            <h2 class="ov-shares-title">分享链接</h2>
            <p class="ov-shares-desc">管理已生成的文件分享。链接过期后会保留 7 天，期间可手动删除；超过 7 天会自动清理。</p>
          </div>
          <div class="ov-shares-hero-actions">
            <button class="btn btn-sm" type="button" data-action="refresh-admin-shares">刷新</button>
            <button class="btn btn-danger btn-sm" type="button" data-action="confirm-cleanup-expired-shares">清理过期</button>
          </div>
        </div>

        <div class="ov-share-stats">
          ${renderStat("全部链接", totalShares)}
          ${renderStat("有效", activeShares, "success")}
          ${renderStat("已失效", inactiveShares, "danger")}
          ${renderStat("有密码", passwordShares, "accent")}
        </div>

        <div class="ov-share-filter-shell">
          <div class="ov-share-filter-row">
            <input class="input ov-share-search" type="text"
                   data-action-input="set-shares-search" value="${escapeHtml(shareSearch)}"
                   placeholder="搜索文件名或路径">
            <select class="input ov-share-select" data-action-change="set-shares-filter">
              <option value="all" ${shareFilter === "all" ? "selected" : ""}>全部状态</option>
              <option value="active" ${shareFilter === "active" ? "selected" : ""}>有效</option>
              <option value="expired" ${shareFilter === "expired" ? "selected" : ""}>已失效</option>
              <option value="exhausted" ${shareFilter === "exhausted" ? "selected" : ""}>已用尽</option>
            </select>
            <div class="ov-share-filter-actions">
              <button class="btn btn-sm" type="button" data-action="refresh-admin-shares">筛选</button>
              <button class="btn btn-sm" type="button" data-action="set-shares-filter" data-filter="all">重置</button>
            </div>
          </div>
        </div>

        <div class="ov-share-panel">
          ${visibleShares.length === 0
            ? `
              <div class="ov-share-empty">
                <div class="ov-share-empty-title">${hasSearch || shareFilter !== "all" ? "没有匹配的分享" : "暂无分享链接"}</div>
                <div class="ov-share-empty-desc">${hasSearch || shareFilter !== "all" ? `当前筛选条件「${escapeHtml(selectedLabel)}」下没有结果。` : "创建分享后会在这里显示。"}</div>
              </div>
            `
            : `<div class="ov-share-list">${visibleShares.map((share) => renderShareItem(share)).join("")}</div>`
          }
        </div>
      </div>
    `;
  }

  function renderSharePage() { return ``; }

  return { renderAdminSharesSection, renderSharePage };
}
