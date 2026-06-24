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
      <div class="ov-page" style="display:flex; flex-direction:column; gap:12px; height:100%; overflow:hidden; font-family:system-ui, sans-serif;">
        <div class="ov-page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:16px; font-weight:600; color:var(--text);">外链管理</h2>
            <p class="ov-page-desc" style="margin:2px 0 0; font-size:11px; color:var(--muted);">管理本系统内下发的所有外链及其状态</p>
          </div>
          <button class="btn btn-danger" type="button" data-action="confirm-cleanup-expired-shares" style="font-size:11px; padding:4px 8px; border-radius:4px;">
            清理过期链接
          </button>
        </div>

        <!-- 扁平检索控制行 -->
        <div style="display:flex; gap:8px; border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:8px 0; align-items:center;">
          <input class="input" type="text" data-action-input="set-shares-search" value="${escapeHtml(shareSearch)}" placeholder="搜索文件名、令牌等..." style="flex:1; padding:5px 8px; font-size:12px; border:1px solid var(--line); border-radius:4px; background:transparent;">
          <select class="input" data-action-change="set-shares-filter" style="width:110px; padding:5px; font-size:12px; border:1px solid var(--line); border-radius:4px; background:transparent;">
            <option value="all" ${shareFilter === "all" ? "selected" : ""}>全部状态</option>
            <option value="active" ${shareFilter === "active" ? "selected" : ""}>仅有效</option>
            <option value="expired" ${shareFilter === "expired" ? "selected" : ""}>已过期</option>
            <option value="exhausted" ${shareFilter === "exhausted" ? "selected" : ""}>额度耗尽</option>
          </select>
        </div>

        <!-- 外链条目列表（高度严格受限防溢出） -->
        <div style="flex:1; overflow-y:auto; max-height:240px; display:flex; flex-direction:column;">
          ${shares.length === 0 ? `
            <p style="text-align:center; color:var(--muted); font-size:12px; padding:32px 0; margin:0;">无符合条件的外链</p>
          ` : shares.map(share => {
              const isExpired = share.expired || (share.expiresAt && share.expiresAt < Date.now());
              const isExhausted = share.exhausted;
              const isActive = !isExpired && !isExhausted;
              
              return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--line); gap:12px; font-size:12px;">
                  <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span style="font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px;">${safeText(share.name, "未命名资源")}</span>
                      <span style="width:5px; height:5px; border-radius:50%; background:${isActive ? "#10b981" : "var(--danger)"};"></span>
                      ${share.hasPassword ? `<span style="font-size:10px; color:var(--muted);">🔒 加密</span>` : ""}
                    </div>
                    <div style="font-size:11px; color:var(--muted); margin-top:2px; display:flex; gap:12px;">
                      <span>路径: ${escapeHtml(share.path)}</span>
                      <span>已下载: ${share.downloadCount}/${share.maxDownloads || "∞"} 次</span>
                      ${share.expiresAt ? `<span>有效期: ${formatTime(share.expiresAt)}</span>` : ""}
                    </div>
                  </div>
                  <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button class="btn" type="button" data-action="copy-share-link" data-key="${escapeHtml(share.token)}" style="font-size:11px; padding:3px 6px; border:1px solid var(--line); border-radius:4px; background:transparent;">复制</button>
                    <button class="btn btn-danger" type="button" data-action="confirm-delete-share" data-key="${escapeHtml(share.token)}" data-name="${escapeHtml(share.name)}" style="font-size:11px; padding:3px 6px; border-radius:4px;">移除</button>
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