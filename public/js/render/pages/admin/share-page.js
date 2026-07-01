export function createSharePageRenderer({ safeText, escapeHtml, formatTime, formatBytes }) {
  const icons = {
    cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    preview: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    arrow: '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    audio: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
    text: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  };

  const svg = (name, size = 20, stroke = 2) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;

  function renderBrand() {
    return `
      <div class="share-brand">
        ${svg("cloud")}
        <span>O-Drive</span>
      </div>
    `;
  }

  function renderStatus(className, label, withDot = false) {
    return `
      <span class="share-status-tag ${className}">
        ${withDot ? '<span class="share-status-dot"></span>' : ""}
        ${escapeHtml(label)}
      </span>
    `;
  }

  function renderMetaChip(label) {
    return label ? `<span class="share-meta-chip">${escapeHtml(label)}</span>` : "";
  }

  function renderDetailRow(label, value, tone = "") {
    return `
      <div class="share-detail-row${tone ? ` share-detail-${tone}` : ""}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "-")}</strong>
      </div>
    `;
  }

  function renderPermission(label, enabled) {
    return `
      <span class="share-permission${enabled ? " is-enabled" : " is-muted"}">
        <span class="share-permission-dot"></span>
        ${escapeHtml(label)}
      </span>
    `;
  }

  function getShareFacts(item, entriesCount = null) {
    const expiresText = item.expiresAt ? formatTime(Math.floor(item.expiresAt / 1000)) : "长期有效";
    const downloadsText = item.maxDownloads > 0 ? `${item.downloadCount} / ${item.maxDownloads}` : "不限次数";
    const sizeText = entriesCount != null ? `${entriesCount} 项` : item.size ? formatBytes(item.size) : "";
    const chips = [
      renderMetaChip(sizeText),
      renderMetaChip(item.expiresAt ? `有效期至 ${expiresText}` : "长期有效"),
    ].join("");

    return { expiresText, downloadsText, sizeText, chips };
  }

  function getPreviewKind(item) {
    const kind = item.contentType || "";
    if (kind.startsWith("image/")) return { key: "image", label: "图片文件", previewable: true };
    if (kind.startsWith("video/")) return { key: "video", label: "视频文件", previewable: true };
    if (kind.startsWith("audio/")) return { key: "audio", label: "音频文件", previewable: true };
    if (kind === "application/pdf") return { key: "pdf", label: "PDF 文件", previewable: true };
    if (kind.startsWith("text/")) return { key: "text", label: "文本文件", previewable: true };
    return { key: "file", label: "文件", previewable: false };
  }

  function renderAccessPanel(item, typeLabel, facts) {
    return `
      <aside class="share-access-panel">
        <div class="share-access-head">
          <span>访问状态</span>
          <strong>可访问</strong>
        </div>
        <div class="share-detail-list">
          ${renderDetailRow("资源类型", typeLabel)}
          ${renderDetailRow("有效期", facts.expiresText)}
          ${renderDetailRow("下载次数", facts.downloadsText)}
        </div>
        <div class="share-permission-strip">
          ${renderPermission("允许下载", item.allowDownload)}
          ${renderPermission("允许预览", item.allowPreview)}
        </div>
      </aside>
    `;
  }

  function renderLoading() {
    return `
      <div class="share-page">
        <div class="share-shell share-shell-state">
          <div class="share-top">
            ${renderBrand()}
            ${renderStatus("share-status-loading", "载入中")}
          </div>
          <div class="share-mid share-mid-state">
            <div class="share-preview-placeholder">
              ${svg("clock", 48, 1.5)}
            </div>
            <h1 class="share-file-name">正在获取分享信息</h1>
            <p class="share-file-desc">请稍候</p>
          </div>
          <div class="share-bottom"></div>
        </div>
      </div>`;
  }

  function renderPassword(error, password) {
    return `
      <div class="share-page">
        <div class="share-shell share-shell-state share-shell-locked">
          <div class="share-top">
            ${renderBrand()}
            ${renderStatus("share-status-locked", "需要密码")}
          </div>
          <div class="share-mid share-mid-state">
            <div class="share-preview-placeholder share-preview-locked">
              ${svg("lock", 48, 1.5)}
            </div>
            <h1 class="share-file-name">此分享需要密码</h1>
            <p class="share-file-desc">${escapeHtml(error || "输入访问密码后继续查看。")}</p>
          </div>
          <div class="share-bottom">
            <form class="share-unlock-form" data-form="share-unlock">
              <input class="share-unlock-input" name="share-password" type="password" placeholder="输入访问密码" value="${escapeHtml(password || "")}" required>
              <button class="share-unlock-btn" type="submit">
                ${svg("arrow", 16)}
                解锁
              </button>
            </form>
          </div>
        </div>
      </div>`;
  }

  function renderError(error, isAdmin) {
    const normalizedError = String(error || "");
    const isExpired = /expired|过期|失效/i.test(normalizedError);
    const errorTitle = isExpired ? "分享链接已过期" : "此分享暂时无法访问";
    const errorReason = isExpired ? "链接已超过有效期" : normalizedError;
    const errorDesc = isExpired
      ? "此分享已超过有效期，无法继续访问。你可以联系分享者重新生成链接。"
      : "当前链接无法打开。你可以复制链接发给分享者确认，或返回 O-Drive。";

    return `
      <div class="share-page">
        <div class="share-shell share-shell-file share-shell-error">
          <div class="share-top">
            ${renderBrand()}
            ${renderStatus("share-status-error", isExpired ? "链接已过期" : "无法访问")}
          </div>

          <div class="share-mid share-mid-resource">
            <section class="share-resource-main">
              <div class="share-preview-icon share-preview-expired">
                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M7 3.75h6.2l3.8 3.8v12.7H7a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z"/>
                  <path d="M13 4v4h4"/>
                  <circle cx="15.75" cy="15.75" r="3.25"/>
                  <path d="M15.75 14v1.85l1.25.75"/>
                </svg>
              </div>
              <div class="share-resource-copy">
                <span class="share-kicker share-kicker-danger">${isExpired ? "分享已失效" : "访问受限"}</span>
                <h1 class="share-file-name">${escapeHtml(errorTitle)}</h1>
                <p class="share-file-desc">${escapeHtml(errorDesc)}</p>
              </div>
            </section>
            <aside class="share-access-panel share-access-danger">
              <div class="share-access-head">
                <span>访问状态</span>
                <strong>${isExpired ? "已过期" : "无法访问"}</strong>
              </div>
              <div class="share-detail-list">
                ${renderDetailRow("资源类型", "分享链接")}
                ${renderDetailRow("原因", errorReason)}
                ${renderDetailRow("处理建议", isExpired ? "联系分享者重新生成" : "确认链接状态")}
              </div>
            </aside>
          </div>

          <div class="share-bottom">
            <div class="share-actions">
              <a class="share-btn share-btn-primary" href="/">返回 O-Drive</a>
              <button class="share-btn share-btn-ghost" type="button" data-action="copy-current-url">复制链接</button>
              ${isAdmin ? `<a class="share-btn share-btn-ghost share-btn-soft" href="/admin.html">进入管理后台</a>` : ""}
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderEmpty() {
    return `
      <div class="share-page">
        <div class="share-shell share-shell-state">
          <div class="share-top">
            ${renderBrand()}
          </div>
          <div class="share-mid share-mid-state">
            <div class="share-preview-placeholder">
              ${svg("link", 48, 1.5)}
            </div>
            <h2 class="share-file-name">暂无分享内容</h2>
            <p class="share-file-desc">分享信息不可用。</p>
          </div>
          <div class="share-bottom"></div>
        </div>
      </div>`;
  }

  function renderSharePage(state) {
    const { share } = state;
    const { loading, error, item, directory, requiresPassword, password } = share;
    const isAdmin = state.app?.role === "admin";

    if (loading) return renderLoading();
    if (requiresPassword) return renderPassword(error, password);
    if (error) return renderError(error, isAdmin);
    if (!item) return renderEmpty();

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
      const facts = getShareFacts(item, entriesCount);
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
            <span class="share-dir-icon share-dir-icon-folder">${svg("folder", 18)}</span>
            <span class="share-dir-name">${safeText(folder.name, "未命名文件夹")}</span>
            <span class="share-dir-meta">文件夹</span>
          </a>
        `;
      };
      const renderFileRow = (file) => {
        const path = relativeEntryPath(file);
        return `
          <div class="share-dir-row">
            <span class="share-dir-icon">${svg("file", 18)}</span>
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
              ${renderBrand()}
              ${renderStatus("share-status-active", "有效分享", true)}
            </div>

            <div class="share-mid share-mid-folder">
              <div class="share-folder-head">
                <div class="share-preview-icon share-preview-folder">
                  ${svg("folder", 48, 1.5)}
                </div>
                <div class="share-resource-copy">
                  <span class="share-kicker">共享文件夹</span>
                  <h1 class="share-file-name">${safeText(item.name, "未命名文件夹")}</h1>
                  <div class="share-file-meta">${facts.chips}</div>
                </div>
              </div>
              <div class="share-folder-access">
                ${renderDetailRow("有效期", facts.expiresText)}
                ${renderDetailRow("下载次数", facts.downloadsText)}
                <div class="share-permission-strip">
                  ${renderPermission("允许下载", item.allowDownload)}
                  ${renderPermission("允许预览", item.allowPreview)}
                </div>
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
                ${item.allowDownload ? `<a class="share-btn share-btn-primary" href="${escapeHtml(shareActionUrl("download", currentSharePath))}" target="_blank">${svg("download", 16)}下载当前目录</a>` : ""}
                <button class="share-btn share-btn-ghost" type="button" data-action="copy-current-url">复制链接</button>
              </div>
            </div>
          </div>
        </div>`;
    }

    const preview = getPreviewKind(item);
    const isPreviewable = item.allowPreview && preview.previewable;
    const isDownloadable = item.allowDownload;
    const facts = getShareFacts(item);

    return `
      <div class="share-page">
        <div class="share-shell share-shell-file">
          <div class="share-top">
            ${renderBrand()}
            ${renderStatus("share-status-active", "有效分享", true)}
          </div>

          <div class="share-mid share-mid-resource">
            <section class="share-resource-main">
              <div class="share-preview-icon share-preview-${preview.key}">
                ${svg(preview.key, 52, 1.5)}
              </div>
              <div class="share-resource-copy">
                <span class="share-kicker">${escapeHtml(preview.label)}</span>
                <h1 class="share-file-name">${safeText(item.name, "未命名文件")}</h1>
                <div class="share-file-meta">${facts.chips}</div>
              </div>
            </section>
            ${renderAccessPanel(item, preview.label, facts)}
          </div>

          <div class="share-bottom">
            <div class="share-actions">
              ${isDownloadable ? `<a class="share-btn share-btn-primary" href="/api/share/${encodeURIComponent(token)}/download" target="_blank">${svg("download", 16)}下载文件</a>` : ""}
              ${isPreviewable ? `<a class="share-btn share-btn-ghost" href="/api/share/${encodeURIComponent(token)}/preview" target="_blank">${svg("preview", 16)}在线预览</a>` : ""}
              <button class="share-btn share-btn-ghost" type="button" data-action="copy-current-url">复制链接</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  return { renderSharePage };
}
