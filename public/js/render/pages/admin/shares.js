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
              ${icons.refresh}
              <span>重新加载</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderShareList(shares, busyToken) {
    return `
      <div class="latest-list-compact">
        ${shares.map((item) => renderShareItem(item, busyToken)).join("")}
      </div>
    `;
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

    return `
      <article class="latest-item-compact ${isExpired ? "share-item-expired" : ""} ${isExhausted ? "share-item-exhausted" : ""} ${isExpiringSoon ? "share-item-expiring-soon" : ""}">
        <div class="status-bar">
          <div class="status-main">
            <span class="status-dot ${isExpired ? "status-dot-expired" : isExhausted ? "status-dot-exhausted" : isExpiringSoon ? "status-dot-soon" : ""}"></span>
            <span style="font-weight:600;color:var(--text);">${safeText(item?.name || item?.path || token, "未命名分享")}</span>
            <span class="toolbar-tag">${safeText(token, "-")}</span>
          </div>
          <div class="btn-row">
            <button class="btn toolbar-btn" type="button" style="min-height:32px;padding:0 10px;font-size:12px;" data-action="copy-share-link" data-key="${escapeHtml(token)}">
              ${icons.link}<span>复制链接</span>
            </button>
            <button class="btn ${deleting ? "btn-primary" : "btn-danger"}" type="button" style="min-height:32px;padding:0 10px;font-size:12px;" data-action="confirm-delete-share" data-key="${escapeHtml(token)}" data-name="${escapeHtml(item?.name || token)}">
              ${icons.trash}
              <span>${deleting ? "删除中..." : "删除"}</span>
            </button>
          </div>
        </div>

        <div class="share-status-tags">
          ${statusTags.map((tag) => `<span class="toolbar-tag ${tag.className}">${escapeHtml(tag.label)}</span>`).join("")}
        </div>

        ${
          isExpiringSoon && isActive
            ? `
          <div class="attention-item" data-level="warning" style="margin:6px 0;">
            <h3 class="attention-title">即将到期</h3>
            <div class="attention-copy">此分享将于 ${safeText(expiry.label)}，之后将无法访问。</div>
          </div>
        `
            : ""
        }

        ${
          isExpired
            ? `
          <div class="attention-item" data-level="warning" style="margin:6px 0;">
            <h3 class="attention-title">已过期</h3>
            <div class="attention-copy">此分享已过期，无法继续访问。建议清理过期分享以释放资源。</div>
          </div>
        `
            : ""
        }

        ${
          isExhausted && !isExpired
            ? `
          <div class="attention-item" data-level="warning" style="margin:6px 0;">
            <h3 class="attention-title">下载次数已用尽</h3>
            <div class="attention-copy">此分享的下载次数已达上限${item?.allowPreview ? "，预览功能仍可使用" : ""}。</div>
          </div>
        `
            : ""
        }

        <div class="latest-copy" style="margin-top:6px;line-height:1.7;display:grid;grid-template-columns:auto 1fr;gap:2px 12px;">
          <span style="color:var(--muted);font-size:12px;">路径</span><span style="font-size:13px;">${safeText(item?.path || "/")}</span>
          <span style="color:var(--muted);font-size:12px;">链接</span><span style="font-size:13px;"><a href="${escapeHtml(shareLink)}" target="_blank" rel="noreferrer" style="color:var(--accent);text-decoration:none;">${escapeHtml(shareLink)}</a></span>
          <span style="color:var(--muted);font-size:12px;">到期</span><span style="font-size:13px;">${isUnlimited ? '<span class="toolbar-tag tag-unlimited">不限期</span>' : safeText(item?.expiresAt ? `${formatTime(item.expiresAt)} (${expiry.label})` : "不限")}</span>
          <span style="color:var(--muted);font-size:12px;">下载</span><span style="font-size:13px;">${safeText(item?.downloadCount || 0, "0")} / ${safeText(item?.maxDownloads || "不限", "不限")}</span>
          <span style="color:var(--muted);font-size:12px;">状态</span><span style="font-size:13px;">${item?.allowPreview ? "允许预览" : "禁止预览"} · ${item?.allowDownload ? "允许下载" : "禁止下载"}</span>
          <span style="color:var(--muted);font-size:12px;">访问</span><span style="font-size:13px;">${safeText(item?.lastAccessedAt ? `${formatTime(item.lastAccessedAt)}` : "暂无")}${item?.lastAccessIp ? ` · ${safeText(item.lastAccessIp)}` : ""}</span>
        </div>
      </article>
    `;
  }

  function renderAdminSharesSection(admin) {
    const shares = admin.shares || [];
    const busyToken = admin.shareBusyToken || "";
    const shareFilter = admin.shareFilter || "all";
    const filteredShares = filterShares(shares, shareFilter);
    const expiredCount = shares.filter((item) => item?.expired).length;
    const exhaustedCount = shares.filter((item) => item?.exhausted).length;

    return `
      <div class="hero-strip-compact">
        <div class="mini-stat-compact">
          <div class="mini-stat-label">分享总数</div>
          <div class="mini-stat-value">${safeText(shares.length, "0")}</div>
          <div class="mini-stat-meta">当前可管理的全部分享条目</div>
        </div>
        <div class="mini-stat-compact">
          <div class="mini-stat-label">有效分享</div>
          <div class="mini-stat-value">${safeText(shares.filter((item) => isShareActive(item)).length, "0")}</div>
          <div class="mini-stat-meta">未过期且次数未用尽</div>
        </div>
        <div class="mini-stat-compact">
          <div class="mini-stat-label">已失效</div>
          <div class="mini-stat-value">${safeText(expiredCount + exhaustedCount, "0")}</div>
          <div class="mini-stat-meta">已过期 ${expiredCount} · 次数用尽 ${exhaustedCount}</div>
        </div>
      </div>
      ${
        admin.sharesLoading
          ?           renderEmptyStateCompact(
              "正在加载分享列表",
              "正在获取已创建的分享记录和访问状态。",
              icons.spinner,
            )
          : admin.sharesError
            ? renderShareErrorState(admin.sharesError)
            : shares.length === 0
              ? renderEmptyStateCompact(
                  "暂无分享记录",
                  "系统中还没有创建任何分享。您可以在文件管理页面选择文件并创建分享链接。",
                  icons.share,
                )
              : filteredShares.length === 0
                ? renderEmptyStateCompact(
                    "筛选结果为空",
                    `当前筛选条件"${getFilterLabel(shareFilter)}"没有匹配的分享记录，请尝试其他筛选条件。`,
                    icons.search,
                  )
                : renderShareList(filteredShares, busyToken)
      }
    `;
  }

  function renderSharePreview(token, item) {
    if (!item.allowPreview) {
      return renderEmptyState(
        "预览已关闭",
        "当前分享仅允许下载，不开放在线预览。",
        icons.lock,
      );
    }

    if (item.mockPreviewHtml) {
      return item.mockPreviewHtml;
    }

    const src = `/api/share/${encodeURIComponent(token)}/preview`;
    const type = String(item.contentType || "").toLowerCase();

    if (type.startsWith("image/"))
      return `<img src="${src}" alt="${escapeHtml(item.name)}">`;
    if (type.startsWith("video/"))
      return `<video src="${src}" controls></video>`;
    if (type.startsWith("audio/"))
      return `<div class="empty-state"><audio src="${src}" controls style="width:min(520px,100%);"></audio></div>`;
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
          ${
            share.token && !share.requiresPassword
              ? `
            <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="copy-share-link" data-key="${escapeHtml(share.token)}">复制链接</button>
          `
              : ""
          }
        </div>
      </div>

      <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col">
        ${
          share.loading
            ? renderEmptyState(
                "正在读取分享",
                "正在加载分享文件信息与预览权限。",
                icons.spinner,
              )
            : share.error && !share.requiresPassword
              ? renderEmptyState("分享不可用", share.error, icons.lock)
              : share.requiresPassword
                ? `
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
                  </div>
                `
                : item
                  ? `
                    <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                      <span class="w-2 h-2 rounded-full bg-sky-600"></span>
                      <span class="text-sm font-semibold text-slate-800">${safeText(item.name)} · ${safeText(item.sizeFormatted)}</span>
                    </div>
                    <div class="flex-1 min-h-[320px] rounded-xl overflow-hidden bg-slate-50 border border-slate-200">
                      ${renderSharePreview(share.token, item)}
                    </div>
                  `
                  : renderEmptyState(
                      "等待分享链接",
                      "当前页面没有读取到分享 token，可通过 share.html?token=你的分享码 打开。",
                      icons.file,
                    )
        }
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
