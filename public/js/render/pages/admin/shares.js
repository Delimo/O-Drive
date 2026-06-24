export function createSharesRenderer({
  icons, safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderAdminSharesSection(admin) {
    const { shares = [], shareFilter = "all", shareSearch = "", sharesLoading, sharesError } = admin;

    if (sharesError) {
      return components.renderErrorCard({ icon: icons.refresh, error: sharesError, onRetry: "refresh-admin-shares" });
    }
    if (sharesLoading) {
      return renderEmptyStateCompact("正在读取分享链接", "加载列表中...", icons.spinner);
    }

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px;">
        <div class="ov-page-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:20px; font-weight:700; color:var(--text);">分享链接</h2>
            <p class="ov-page-desc" style="margin:4px 0 0; font-size:13px; color:var(--muted);">监控与管理本系统下发的所有公共外链及密钥状态</p>
          </div>
          <button class="btn btn-danger" type="button" data-action="confirm-cleanup-expired-shares" style="font-size:12px; font-weight:600; padding:8px 14px; border-radius:8px;">
            一键清除过期链接
          </button>
        </div>

        <!-- 过滤器控制台 -->
        <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          <div style="position:relative; flex:1; min-width:200px;">
            <input class="input" type="text" data-action-input="set-shares-search" value="${escapeHtml(shareSearch)}" placeholder="搜索文件名、令牌、资源路径..." style="width:100%; padding:8px 12px 8px 32px; font-size:13px; border-radius:8px; border:1px solid var(--line); background:var(--panel-soft);">
            <span style="position:absolute; left:10px; top:50%; transform:translateY(-50%); width:14px; height:14px; color:var(--muted);">${icons.search}</span>
          </div>
          <select class="input" data-action-change="set-shares-filter" style="width:150px; padding:8px; font-size:13px; border-radius:8px; border:1px solid var(--line); background:var(--panel-soft);">
            <option value="all" ${shareFilter === "all" ? "selected" : ""}>全部链接</option>
            <option value="active" ${shareFilter === "active" ? "selected" : ""}>仅有效</option>
            <option value="expired" ${shareFilter === "expired" ? "selected" : ""}>已过期</option>
            <option value="exhausted" ${shareFilter === "exhausted" ? "selected" : ""}>额度耗尽</option>
          </select>
        </div>

        <!-- 分享条目列表 -->
        ${shares.length === 0 ? `
          <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:48px 12px; text-align:center;">
            <div style="width:48px; height:48px; color:var(--muted); margin:0 auto 12px auto;">${icons.share}</div>
            <p style="font-size:14px; color:var(--text); font-weight:600; margin:0;">没有找到符合过滤条件的分享链接</p>
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${shares.map(share => {
              const isExpired = share.expired || (share.expiresAt && share.expiresAt < Date.now());
              const isExhausted = share.exhausted;
              const isActive = !isExpired && !isExhausted;
              
              return `
                <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px; display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
                  <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                    <div style="width:36px; height:36px; border-radius:8px; background:var(--panel-soft); display:grid; place-items:center; color:var(--muted); flex-shrink:0;">
                      ${icons.file}
                    </div>
                    <div style="min-width:0;">
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-weight:600; font-size:14px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px;">
                          ${safeText(share.name, "未知资源")}
                        </span>
                        <!-- 状态标签 -->
                        <span style="font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600; 
                          background:${isActive ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)"}; 
                          color:${isActive ? "#10b981" : "#ef4444"};">
                          ${isActive ? "生效中" : isExhausted ? "超量耗尽" : "已失效"}
                        </span>
                        ${share.hasPassword ? `<span style="font-size:10px; background:var(--panel-soft); border:1px solid var(--line); padding:2px 6px; border-radius:4px; color:var(--muted);">🔒 密码保护</span>` : ""}
                      </div>
                      <div style="font-size:12px; color:var(--muted); margin-top:4px; display:flex; gap:12px; flex-wrap:wrap;">
                        <span>路径: ${escapeHtml(share.path)}</span>
                        <span>下载限制: ${share.downloadCount} / ${share.maxDownloads || "∞"} 次</span>
                        ${share.expiresAt ? `<span>有效期至: ${formatTime(share.expiresAt)}</span>` : "<span>永不过期</span>"}
                      </div>
                    </div>
                  </div>
                  
                  <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button class="btn" type="button" data-action="copy-share-link" data-key="${escapeHtml(share.token)}"
                            style="font-size:12px; padding:6px 12px; border-radius:8px; border:1px solid var(--line); background:var(--panel); display:flex; align-items:center; gap:4px;">
                      <span style="width:12px; height:12px;">${icons.copy}</span> 复制链接
                    </button>
                    <button class="btn btn-danger" type="button" 
                            data-action="confirm-delete-share" 
                            data-key="${escapeHtml(share.token)}" 
                            data-name="${escapeHtml(share.name)}"
                            style="font-size:12px; padding:6px 12px; border-radius:8px;">
                      取消分享
                    </button>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    `;
  }

  // 保留公共独立分享页面 renderSharePage 不作改动
  function renderSharePage() {
    return ``; 
  }

  return {
    renderAdminSharesSection,
    renderSharePage
  };
}