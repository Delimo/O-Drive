export function createSharesRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyState,
  renderEmptyStateCompact,
  formatBytes,
  formatTime,
  formatRelative,
  filterShares,
  getFilterLabel,
  getShareStatusTags,
  getExpiryStatus,
  isShareActive,
  components,
}) {
  function renderShareErrorState(error) {
    return `
      <div class="empty-state">
        <div>
          <div class="empty-orb">${icons.lock}</div>
          <h3 class="empty-title">分享列表加载失败</h3>
          <p class="empty-copy">${escapeHtml(error)}</p>
          <div style="margin-top:18px;">
            <button class="btn btn-primary" type="button" data-action="refresh-admin-shares">
              ${icons.refresh} 重新加载
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderShareList(shares, busyToken) {
    return shares.map((item) => renderShareItem(item, busyToken)).join("");
  }

  function renderShareItem(item, busyToken) {
    const token = String(item?.token || "");
    const deleting = busyToken === token;
    const shareLink = `${window.location.origin}/share.html?token=${encodeURIComponent(token)}`;
    const statusTags = getShareStatusTags(item);
    const expiry = getExpiryStatus(item?.expiresAt);
    const isActive = isShareActive(item);
    const isExpired = item?.expired || expiry.level === "expired";
    const isExhausted = item?.exhausted;
    const isExpiringSoon = expiry.level === "soon";
    const isUnlimited = expiry.level === "unlimited";

    const statusDotClass = isExpired ? "status-dot-expired" : isExhausted ? "status-dot-exhausted" : isExpiringSoon ? "status-dot-soon" : "";

    return `
      <div class="latest-item-compact ${isExpired ? "share-item-expired" : ""} ${isExhausted ? "share-item-exhausted" : ""} ${isExpiringSoon ? "share-item-expiring-soon" : ""}">
        <div class="status-bar">
          <div class="status-main">
            <span class="status-dot ${statusDotClass}"></span>
            <span style="font-weight:600;color:var(--text);">${safeText(item?.name || item?.path || token, "未命名分享")}</span>
            <span class="toolbar-tag">${safeText(token, "-")}</span>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn toolbar-btn" type="button" style="min-height:28px;padding:0 8px;font-size:11px;" data-action="copy-share-link" data-key="${escapeHtml(token)}">复制链接</button>
            <button class="btn ${deleting ? "btn-primary" : "btn-danger"}" type="button" style="min-height:28px;padding:0 8px;font-size:11px;" data-action="confirm-delete-share" data-key="${escapeHtml(token)}" data-name="${escapeHtml(item?.name || token)}">${deleting ? "删除中..." : "删除"}</button>
          </div>
        </div>
        <div class="share-status-tags" style="margin-top:6px;">
          ${statusTags.map((tag) => `<span class="toolbar-tag ${tag.className}">${escapeHtml(tag.label)}</span>`).join("")}
        </div>
        ${isExpiringSoon && isActive ? `<div class="attention-item" data-level="warning" style="margin-top:6px;"><div class="attention-title">即将到期</div><div class="attention-copy">此分享将于 ${safeText(expiry.label)}，之后将无法访问。</div></div>` : ""}
        ${isExpired ? `<div class="attention-item" data-level="warning" style="margin-top:6px;"><div class="attention-title">已过期</div><div class="attention-copy">此分享已过期，建议清理过期分享以释放资源。</div></div>` : ""}
        ${isExhausted && !isExpired ? `<div class="attention-item" data-level="warning" style="margin-top:6px;"><div class="attention-title">下载次数已用尽</div><div class="attention-copy">此分享的下载次数已达上限${item?.allowPreview ? "，预览功能仍可使用" : ""}。</div></div>` : ""}
        <div style="margin-top:6px;display:grid;grid-template-columns:auto 1fr;gap:1px 12px;font-size:12px;line-height:1.6;">
          <span style="color:var(--muted);">路径</span><span>${safeText(item?.path || "/")}</span>
          <span style="color:var(--muted);">链接</span><span><a href="${escapeHtml(shareLink)}" target="_blank" rel="noreferrer" style="color:var(--accent);text-decoration:none;">${escapeHtml(shareLink)}</a></span>
          <span style="color:var(--muted);">到期</span><span>${isUnlimited ? '<span class="toolbar-tag tag-unlimited">不限期</span>' : safeText(item?.expiresAt ? `${formatTime(item.expiresAt)} (${expiry.label})` : "不限")}</span>
          <span style="color:var(--muted);">下载</span><span>${safeText(item?.downloadCount || 0, "0")} / ${safeText(item?.maxDownloads || "不限", "不限")}</span>
          <span style="color:var(--muted);">状态</span><span>${item?.allowPreview ? "允许预览" : "禁止预览"} · ${item?.allowDownload ? "允许下载" : "禁止下载"}</span>
          <span style="color:var(--muted);">访问</span><span>${safeText(item?.lastAccessedAt ? `${formatTime(item.lastAccessedAt)}` : "暂无")}${item?.lastAccessIp ? ` · ${safeText(item.lastAccessIp)}` : ""}</span>
        </div>
      </div>
    `;
  }

  function renderAdminSharesSection(admin) {
    const shares = admin.shares || [];
    const busyToken = admin.shareBusyToken || "";
    const shareFilter = admin.shareFilter || "all";
    const shareSearch = admin.shareSearch || "";
    const currentPage = admin.sharePage || 1;
    const pageSize = 20;

    let filteredShares = filterShares(shares, shareFilter);
    if (shareSearch) {
      const q = shareSearch.toLowerCase();
      filteredShares = filteredShares.filter(item =>
        (item.name || "").toLowerCase().includes(q) ||
        (item.token || "").toLowerCase().includes(q)
      );
    }

    const expiredCount = shares.filter((item) => item?.expired).length;
    const exhaustedCount = shares.filter((item) => item?.exhausted).length;

    const totalPages = Math.ceil(filteredShares.length / pageSize) || 1;
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedShares = filteredShares.slice(startIndex, startIndex + pageSize);

    return `
      <div class="ov-page">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title">分享管理</h2>
            <p class="ov-page-desc">管理所有分享链接与访问权限</p>
          </div>
          <button class="btn btn-danger toolbar-btn" type="button" data-action="confirm-cleanup-expired-shares">清理过期</button>
        </div>

        <div class="ov2-hero" style="grid-template-columns:repeat(3,1fr)">
          <div class="ov2-hero-card">
            <div class="ov2-hero-icon" style="background:rgba(14,116,144,0.1);color:#0e7490">${icons.share}</div>
            <div class="ov2-hero-body">
              <span class="admin-label">分享总数</span>
              <div class="admin-value">${safeText(shares.length, "0")}</div>
              <div class="admin-copy">当前可管理的全部分享条目</div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-icon" style="background:rgba(5,150,105,0.1);color:#059669">${icons.check}</div>
            <div class="ov2-hero-body">
              <span class="admin-label">有效分享</span>
              <div class="admin-value">${safeText(shares.filter((item) => isShareActive(item)).length, "0")}</div>
              <div class="admin-copy">未过期且次数未用尽</div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-icon" style="background:rgba(192,57,43,0.1);color:#c0392b">${icons.close}</div>
            <div class="ov2-hero-body">
              <span class="admin-label">已失效</span>
              <div class="admin-value">${safeText(expiredCount + exhaustedCount, "0")}</div>
              <div class="admin-copy">已过期 ${expiredCount} · 次数用尽 ${exhaustedCount}</div>
            </div>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-header" style="flex-wrap:wrap;gap:6px;">
            <div class="admin-card-icon" style="background:rgba(14,116,144,0.1);color:#0e7490">${icons.search}</div>
            <span class="admin-label">筛选</span>
            <input class="input" type="text" placeholder="按文件名或 token 搜索..." value="${escapeHtml(shareSearch)}" data-action-input="set-shares-search" style="flex:1;min-width:120px;margin-left:auto;">
            <select class="input" data-action-change="set-shares-filter" style="width:auto;">
              <option value="all" ${shareFilter === "all" ? "selected" : ""}>全部分享</option>
              <option value="active" ${shareFilter === "active" ? "selected" : ""}>有效分享</option>
              <option value="expired" ${shareFilter === "expired" ? "selected" : ""}>已过期</option>
              <option value="exhausted" ${shareFilter === "exhausted" ? "selected" : ""}>次数已用尽</option>
            </select>
          </div>
        </div>

        ${
          admin.sharesLoading
            ? renderEmptyStateCompact("正在加载分享列表", "正在获取已创建的分享记录和访问状态。", icons.spinner)
            : admin.sharesError
              ? renderShareErrorState(admin.sharesError)
              : shares.length === 0
                ? renderEmptyStateCompact("暂无分享记录", "系统中还没有创建任何分享。", icons.share)
                : filteredShares.length === 0
                  ? renderEmptyStateCompact("筛选结果为空", "当前筛选条件没有匹配的分享记录。", icons.search)
                  : `
                    <div class="admin-card" style="padding:0;">
                      <div class="latest-list-compact" style="padding:10px 12px;">
                        ${renderShareList(paginatedShares, busyToken)}
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;justify-content:center;">
                      <button class="btn btn-muted" type="button" data-action="set-shares-page" data-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>上一页</button>
                      <span style="font-size:12px;color:var(--muted);">第 ${currentPage} / ${totalPages} 页</span>
                      <button class="btn btn-muted" type="button" data-action="set-shares-page" data-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>下一页</button>
                    </div>
                  `
        }
      </div>
    `;
  }

  function renderSharePreview(token, item) {
    if (!item.allowPreview) {
      return renderEmptyState("预览已关闭", "当前分享仅允许下载，不开放在线预览。", icons.lock);
    }
    if (item.mockPreviewHtml) return item.mockPreviewHtml;
    const src = `/api/share/${encodeURIComponent(token)}/preview`;
    const type = String(item.contentType || "").toLowerCase();
    if (type.startsWith("image/")) return `<img src="${src}" alt="${escapeHtml(item.name)}">`;
    if (type.startsWith("video/")) return `<video src="${src}" controls></video>`;
    if (type.startsWith("audio/")) return `<div class="empty-state"><audio src="${src}" controls style="width:min(520px,100%);"></audio></div>`;
    return `<iframe src="${src}" title="${escapeHtml(item.name)}"></iframe>`;
  }

  function renderSharePage(state) {
    const share = state.share;
    const item = share.item;
    const shareLink = `${window.location.origin}/share.html?token=${encodeURIComponent(share.token || "")}`;

    return `
      <div class="toolbar-card flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
        <div class="tools-left">
          <div class="text-sm font-bold text-slate-800 bg-[#fafbfc] border border-slate-200 rounded-lg px-4 py-1.5 shadow-sm">
            ${share.token ? `分享 · ${safeText(share.token)}` : "分享访问"}
          </div>
        </div>
        <div class="tools-right flex items-center gap-2">
          ${share.token && !share.requiresPassword ? `<button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="copy-share-link" data-key="${escapeHtml(share.token)}">复制链接</button>` : ""}
        </div>
      </div>
      <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
        ${share.loading ? renderEmptyState("正在读取分享", "正在加载分享文件信息与预览权限。", icons.spinner)
          : share.error && !share.requiresPassword ? renderEmptyState("分享不可用", share.error, icons.lock)
          : share.requiresPassword ? `
            <div class="flex-1 flex flex-col items-center justify-center text-slate-400 min-h-[280px]">
              <div>
                <div class="w-18 h-18 mx-auto mb-4 rounded-xl grid place-items-center bg-sky-100 text-sky-600">${icons.lock}</div>
                <h3 class="text-2xl font-bold text-center text-slate-800">请输入访问密码</h3>
                <p class="mt-2 text-sm text-slate-500 text-center max-w-md mx-auto">${safeText(share.error || "该分享资源启用了额外保护，输入正确密码后即可查看内容。")}</p>
                <form data-form="share-password" class="mt-6 max-w-xs mx-auto grid gap-3">
                  <input class="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-sky-500 text-slate-800" type="password" name="password" value="${escapeHtml(share.password)}" placeholder="输入分享密码">
                  <button class="w-full px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors" type="submit">解锁分享</button>
                </form>
              </div>
            </div>`
          : item ? `
            <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
              <span class="w-2 h-2 rounded-full bg-sky-600"></span>
              <span class="text-sm font-semibold text-slate-800">${safeText(item.name)} · ${safeText(item.sizeFormatted)}</span>
            </div>
            <div class="flex-1 min-h-[320px] rounded-xl overflow-hidden bg-slate-50 border border-slate-200">
              ${renderSharePreview(share.token, item)}
            </div>`
          : renderEmptyState("等待分享链接", "当前页面没有读取到分享 token，可通过 share.html?token=你的分享码 打开。", icons.file)}
      </div>
    `;
  }

  return {
    renderShareErrorState,
    renderShareList,
    renderShareItem,
    renderAdminSharesSection,
    renderSharePreview,
    renderSharePage,
  };
}
