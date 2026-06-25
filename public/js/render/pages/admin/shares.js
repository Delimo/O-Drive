export function createSharesRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, formatRelative, formatBytes,
  filterShares, getFilterLabel, getShareStatusTags, isShareActive, components
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
    const normalizedSearch = String(shareSearch || "").trim().toLowerCase();
    const visibleShares = filterShares(shares, shareFilter).filter((item) => {
      if (!normalizedSearch) return true;
      const haystacks = [
        item?.name,
        item?.path,
        item?.token,
        item?.lastAccessIp,
        item?.contentType
      ];
      return haystacks.some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
    });
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
            ${components.renderCustomSelect({
              value: shareFilter,
              options: [
                { value: "all", label: "全部状态" },
                { value: "active", label: "有效" },
                { value: "expired", label: "已失效" },
                { value: "exhausted", label: "已用尽" },
              ],
              actionChange: "set-shares-filter",
              dataKey: "",
              className: "ov-share-status-select",
            })}
            <div class="ov-share-filter-actions">
              <button class="btn btn-sm" type="button" data-action="filter-shares">筛选</button>
              <button class="btn btn-sm" type="button" data-action="reset-shares-filter">重置</button>
            </div>
          </div>
          <div class="ov-share-filter-meta">
            <span>当前状态：${escapeHtml(selectedLabel)}</span>
            <span>显示 ${escapeHtml(String(visibleShares.length))} / ${escapeHtml(String(totalShares))} 条</span>
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

  function renderSharePage(state) {
    const { share } = state;
    const { loading, error, item, requiresPassword, password } = share;

    if (loading) {
      return `
        <div class="share-page">
          <div class="empty-state-compact">
            <div>
              <div class="empty-orb"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
              <h3 class="empty-title">载入中</h3>
              <p class="empty-copy">正在获取分享信息...</p>
            </div>
          </div>
        </div>`;
    }

    if (requiresPassword) {
      return `
        <div class="share-page">
          <div class="share-card">
            <div class="share-card-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 class="share-card-title">此分享需要密码</h2>
            <p class="share-card-desc">${escapeHtml(error || "请输入访问密码以查看分享内容。")}</p>
            <form class="share-card-form" data-form="share-unlock">
              <input class="inline-input" name="share-password" type="password" placeholder="输入访问密码" value="${escapeHtml(password || "")}" required style="max-width:280px;">
              <button class="btn btn-primary" type="submit">解锁</button>
            </form>
          </div>
        </div>`;
    }

    if (error) {
      return `
        <div class="share-page">
          <div class="share-card">
            <div class="share-card-icon" style="color:var(--danger);">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <h2 class="share-card-title">无法访问此分享</h2>
            <p class="share-card-desc">${escapeHtml(error)}</p>
          </div>
        </div>`;
    }

    if (!item) {
      return `
        <div class="share-page">
          <div class="empty-state-compact">
            <div>
              <div class="empty-orb"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
              <h3 class="empty-title">暂无分享内容</h3>
              <p class="empty-copy">分享信息不可用。</p>
            </div>
          </div>
        </div>`;
    }

    const kind = item.contentType || "file";
    const isPreviewable = item.allowPreview && ["image","video","audio","pdf","text/markdown","text/plain"].some(t => kind.includes(t));
    const isDownloadable = item.allowDownload;
    const sizeText = item.size ? formatBytes(item.size) : "";
    const expiresText = item.expiresAt ? `有效期至 ${formatTime(Math.floor(item.expiresAt / 1000))}` : "永久有效";
    const downloadsText = item.maxDownloads > 0 ? `下载 ${item.downloadCount}/${item.maxDownloads}` : "";

    return `
      <div class="share-page">
        <div class="share-card">
          <div class="share-card-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
          </div>
          <h2 class="share-card-title">${safeText(item.name, "未命名文件")}</h2>
          <div class="share-card-meta">
            ${sizeText ? `<span>${escapeHtml(sizeText)}</span>` : ""}
            <span>${escapeHtml(expiresText)}</span>
            ${downloadsText ? `<span>${escapeHtml(downloadsText)}</span>` : ""}
          </div>
          <div class="share-card-actions">
            ${isDownloadable ? `<a class="btn btn-primary" href="/api/share/${encodeURIComponent(share.token)}/download" target="_blank">下载文件</a>` : ""}
            ${isPreviewable ? `<a class="btn" href="/api/share/${encodeURIComponent(share.token)}/preview" target="_blank">在线预览</a>` : ""}
          </div>
        </div>
      </div>`;
  }

  return { renderAdminSharesSection, renderSharePage };
}
