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
      const targetLabel = share?.targetType === "folder" ? "文件夹" : "文件";
      const statusText = isExpired ? "已失效" : isExhausted ? "已用尽" : "有效";
      const statusClass = isExpired ? "ov-badge-error" : isExhausted ? "ov-badge-warn" : "ov-badge-ok";
      const itemStateClass = isExpired ? " is-expired" : isExhausted ? " is-exhausted" : " is-active";
      const lastAccessText = share?.lastAccessedAt
        ? formatRelative(share.lastAccessedAt)
        : "暂无记录";
      const downloadsText = `${share.downloadCount || 0}/${share.maxDownloads || "∞"}`;
      const expiresText = share?.expiresAt ? formatTime(share.expiresAt) : "无限期";

      return `
        <div class="ov-share-item${itemStateClass}">
          <div class="ov-share-main">
            <div class="ov-share-item-head">
              <div class="ov-share-item-title-row">
                <span class="ov-share-dot${isActive ? " is-on" : ""}"></span>
                <span class="ov-share-name">${safeText(share.name, "未命名资源")}</span>
                <span class="ov-share-pill">${escapeHtml(targetLabel)}</span>
              </div>
              <div class="ov-share-path">${escapeHtml(share.path || "-")}</div>
            </div>
            <div class="ov-share-tags">
              <span class="ov-badge ${statusClass}">${statusText}</span>
              ${share?.hasPassword ? `<span class="ov-share-pill tag-password">有密码</span>` : ""}
              ${renderShareTags(share)}
            </div>
          </div>
          <div class="ov-share-meta-strip">
            <span class="ov-share-meta-item">
              <span class="ov-share-meta-label">最近访问</span>
              <strong class="ov-share-meta-value">${escapeHtml(lastAccessText)}</strong>
            </span>
            <span class="ov-share-meta-item">
              <span class="ov-share-meta-label">下载</span>
              <strong class="ov-share-meta-value">${escapeHtml(downloadsText)}</strong>
            </span>
            <span class="ov-share-meta-item">
              <span class="ov-share-meta-label">到期</span>
              <strong class="ov-share-meta-value">${escapeHtml(expiresText)}</strong>
            </span>
          </div>
          <div class="ov-share-actions">
            <button class="btn btn-sm" type="button"
                    data-action="copy-share-link" data-key="${escapeHtml(share.token)}"
                    aria-label="复制分享链接">复制</button>
            <button class="btn btn-danger btn-sm" type="button"
                    data-action="confirm-delete-share"
                    data-key="${escapeHtml(share.token)}"
                    data-name="${escapeHtml(share.name)}"
                    aria-label="移除分享链接">移除</button>
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
    const { loading, error, item, directory, requiresPassword, password } = share;

    if (loading) {
      return `
        <div class="share-page">
          <div class="share-shell">
            <div class="share-top">
              <div class="share-brand">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                <span>O-Drive</span>
              </div>
              <span class="share-status-tag share-status-loading">载入中</span>
            </div>
            <div class="share-mid">
              <div class="share-preview-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </div>
              <p class="share-loading-text">正在获取分享信息...</p>
            </div>
            <div class="share-bottom"></div>
          </div>
        </div>`;
    }

    if (requiresPassword) {
      return `
        <div class="share-page">
          <div class="share-shell">
            <div class="share-top">
              <div class="share-brand">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                <span>O-Drive</span>
              </div>
              <span class="share-status-tag share-status-locked">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                需要密码
              </span>
            </div>
            <div class="share-mid">
              <div class="share-preview-placeholder share-preview-locked">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h2 class="share-file-name">此分享需要密码</h2>
              <p class="share-file-desc">${escapeHtml(error || "请输入访问密码以查看分享内容。")}</p>
            </div>
            <div class="share-bottom">
              <form class="share-unlock-form" data-form="share-unlock">
                <input class="share-unlock-input" name="share-password" type="password" placeholder="输入访问密码" value="${escapeHtml(password || "")}" required>
                <button class="share-unlock-btn" type="submit">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                  解锁
                </button>
              </form>
            </div>
          </div>
        </div>`;
    }

    if (error) {
      return `
        <div class="share-page">
          <div class="share-shell">
            <div class="share-top">
              <div class="share-brand">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                <span>O-Drive</span>
              </div>
              <span class="share-status-tag share-status-error">无法访问</span>
            </div>
            <div class="share-mid">
              <div class="share-preview-placeholder share-preview-error">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </div>
              <h2 class="share-file-name">无法访问此分享</h2>
              <p class="share-file-desc">${escapeHtml(error)}</p>
            </div>
            <div class="share-bottom"></div>
          </div>
        </div>`;
    }

    if (!item) {
      return `
        <div class="share-page">
          <div class="share-shell">
            <div class="share-top">
              <div class="share-brand">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                <span>O-Drive</span>
              </div>
            </div>
            <div class="share-mid">
              <div class="share-preview-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </div>
              <h2 class="share-file-name">暂无分享内容</h2>
              <p class="share-file-desc">分享信息不可用。</p>
            </div>
            <div class="share-bottom"></div>
          </div>
        </div>`;
    }

    const token = share.token;
    const currentSharePath = String(share.path || directory?.path || "").replace(/^\/+|\/+$/g, "");
    const sharePageUrl = (path = "") => {
      const params = new URLSearchParams({ token });
      if (path) params.set("path", path);
      return `/share.html?${params.toString()}`;
    };
    const shareActionUrl = (action, path = "") => {
      const params = new URLSearchParams();
      if (path) params.set("path", path);
      const query = params.toString();
      return `/api/share/${encodeURIComponent(token)}/${action}${query ? `?${query}` : ""}`;
    };
    const relativeEntryPath = (entry) => {
      const root = String(item.path || "").replace(/^\/+|\/+$/g, "");
      const fullKey = String(entry?.fullKey || entry?.path || "").replace(/^\/+|\/+$/g, "");
      if (!fullKey) return "";
      if (root && fullKey === root) return "";
      if (root && fullKey.startsWith(`${root}/`)) return fullKey.slice(root.length + 1);
      return fullKey;
    };

    if (item.targetType === "folder") {
      const folders = directory?.folders || [];
      const files = directory?.files || [];
      const entriesCount = folders.length + files.length;
      const expiresText = item.expiresAt ? formatTime(Math.floor(item.expiresAt / 1000)) : null;
      const downloadsText = item.maxDownloads > 0 ? `${item.downloadCount} / ${item.maxDownloads}` : null;
      const parts = currentSharePath.split("/").filter(Boolean);
      const crumbItems = [
        { label: item.name || "根目录", path: "" },
        ...parts.map((part, index) => ({
          label: part,
          path: parts.slice(0, index + 1).join("/"),
        })),
      ];
      const canPreviewFile = (file) => {
        const type = String(file?.contentType || "");
        return item.allowPreview && (
          type.startsWith("image/") ||
          type.startsWith("video/") ||
          type.startsWith("audio/") ||
          type === "application/pdf" ||
          type.startsWith("text/")
        );
      };
      const renderFolderRow = (folder) => {
        const path = relativeEntryPath(folder);
        return `
          <a class="share-dir-row" href="${escapeHtml(sharePageUrl(path))}">
            <span class="share-dir-icon share-dir-icon-folder">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            </span>
            <span class="share-dir-name">${safeText(folder.name, "未命名文件夹")}</span>
            <span class="share-dir-meta">文件夹</span>
          </a>
        `;
      };
      const renderFileRow = (file) => {
        const path = relativeEntryPath(file);
        return `
          <div class="share-dir-row">
            <span class="share-dir-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </span>
            <span class="share-dir-name">${safeText(file.name, "未命名文件")}</span>
            <span class="share-dir-meta">${escapeHtml(file.sizeFormatted || formatBytes(file.size || 0))}</span>
            <span class="share-dir-actions">
              ${canPreviewFile(file) ? `<a class="share-dir-action" href="${escapeHtml(shareActionUrl("preview", path))}" target="_blank">预览</a>` : ""}
              ${item.allowDownload ? `<a class="share-dir-action" href="${escapeHtml(shareActionUrl("download", path))}" target="_blank">下载</a>` : ""}
            </span>
          </div>
        `;
      };

      return `
        <div class="share-page">
          <div class="share-shell share-shell-folder">
            <div class="share-top">
              <div class="share-brand">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
                <span>O-Drive</span>
              </div>
              <span class="share-status-tag share-status-active">
                <span class="share-status-dot"></span>
                有效分享
              </span>
            </div>

            <div class="share-mid share-mid-folder">
              <div class="share-preview-icon share-preview-folder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              </div>
              <h1 class="share-file-name">${safeText(item.name, "未命名文件夹")}</h1>
              <div class="share-file-meta">
                <span class="share-meta-chip">${escapeHtml(String(entriesCount))} 项</span>
                ${expiresText ? `<span class="share-meta-chip">有效期至 ${escapeHtml(expiresText)}</span>` : ""}
                ${downloadsText ? `<span class="share-meta-chip">下载 ${escapeHtml(downloadsText)}</span>` : ""}
              </div>
              <div class="share-dir-panel">
                <div class="share-dir-crumbs">
                  ${crumbItems.map((crumb, index) => `${index > 0 ? `<span class="share-dir-sep">/</span>` : ""}<a class="share-dir-crumb${index === crumbItems.length - 1 ? " is-current" : ""}" href="${escapeHtml(sharePageUrl(crumb.path))}">${escapeHtml(crumb.label)}</a>`).join("")}
                </div>
                <div class="share-dir-list">
                  ${entriesCount === 0 ? `<div class="share-dir-empty">当前目录为空</div>` : `${folders.map(renderFolderRow).join("")}${files.map(renderFileRow).join("")}`}
                </div>
              </div>
            </div>

            <div class="share-bottom">
              <div class="share-actions">
                ${item.allowDownload ? `<a class="share-btn share-btn-primary" href="${escapeHtml(shareActionUrl("download", currentSharePath))}" target="_blank"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>下载当前目录</a>` : ""}
              </div>
            </div>
          </div>
        </div>`;
    }

    const kind = item.contentType || "";
    const isImage = kind.startsWith("image/");
    const isVideo = kind.startsWith("video/");
    const isAudio = kind.startsWith("audio/");
    const isPdf = kind === "application/pdf";
    const isText = kind.startsWith("text/");
    const isPreviewable = item.allowPreview && (isImage || isVideo || isAudio || isPdf || isText);
    const isDownloadable = item.allowDownload;
    const sizeText = item.size ? formatBytes(item.size) : "";
    const expiresText = item.expiresAt ? formatTime(Math.floor(item.expiresAt / 1000)) : null;
    const downloadsText = item.maxDownloads > 0 ? `${item.downloadCount} / ${item.maxDownloads}` : null;

    let previewIcon = "file";
    if (isImage) previewIcon = "image";
    else if (isVideo) previewIcon = "video";
    else if (isAudio) previewIcon = "audio";
    else if (isPdf) previewIcon = "pdf";
    else if (isText) previewIcon = "text";

    const iconSvg = {
      file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
      image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
      video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
      audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
      pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
      text: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    };

    return `
      <div class="share-page">
        <div class="share-shell">
          <div class="share-top">
            <div class="share-brand">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
              <span>O-Drive</span>
            </div>
            <span class="share-status-tag share-status-active">
              <span class="share-status-dot"></span>
              有效分享
            </span>
          </div>

          <div class="share-mid">
            <div class="share-preview-icon share-preview-${previewIcon}">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${iconSvg[previewIcon] || iconSvg.file}</svg>
            </div>
            <h1 class="share-file-name">${safeText(item.name, "未命名文件")}</h1>
            <div class="share-file-meta">
              ${sizeText ? `<span class="share-meta-chip">${escapeHtml(sizeText)}</span>` : ""}
              ${expiresText ? `<span class="share-meta-chip">有效期至 ${escapeHtml(expiresText)}</span>` : ""}
              ${downloadsText ? `<span class="share-meta-chip">下载 ${escapeHtml(downloadsText)}</span>` : ""}
            </div>
          </div>

          <div class="share-bottom">
            <div class="share-actions">
              ${isDownloadable ? `<a class="share-btn share-btn-primary" href="/api/share/${encodeURIComponent(token)}/download" target="_blank"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>下载文件</a>` : ""}
              ${isPreviewable ? `<a class="share-btn share-btn-ghost" href="/api/share/${encodeURIComponent(token)}/preview" target="_blank"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>在线预览</a>` : ""}
            </div>
          </div>
        </div>
      </div>`;
  }

  return { renderAdminSharesSection, renderSharePage };
}
