export function createSharedRenderers(deps) {
  const {
    icons,
    escapeHtml,
    inferKind,
    canPreview,
    formatTime,
    formatRelative,
    formatBytes,
    entryKey,
    iconForKind,
    iconClass,
    normalizeKey,
    thumbnailUrl,
  } = deps;

  function renderInspector(selected, state) {
    if (!selected) {
      return `
        <div class="details-panel-empty">
          <h3 class="details-panel-title">文件详细</h3>
          <p class="details-panel-copy">点击文件或文件夹后，这里会显示路径、时间、大小和快捷操作。</p>
        </div>
      `;
    }

    const kind = selected.kind || inferKind(selected);
    const isFolder = kind === "folder";
    const previewable =
      !isFolder && !state.explorer.trashMode && canPreview(selected);
    const canDownload = kind !== "folder" && !state.explorer.trashMode;
    const pathValue =
      selected.fullKey ||
      selected.original_key ||
      selected.path ||
      selected.name ||
      "";
    const key = entryKey(selected);
    const kindLabelMap = {
      folder: "文件夹",
      image: "图片",
      video: "视频",
      audio: "音频",
      pdf: "PDF",
      text: "文本",
      archive: "压缩包",
      file: "文件",
    };
    const kindLabel = kindLabelMap[kind] || "文件";
    const sizeText = isFolder
      ? "文件夹"
      : selected.sizeFormatted || formatBytes(selected.rawSize || 0);
    const timeValue = selected.trashedAt || selected.time || 0;
    const timeLabel = state.explorer.trashMode ? "删除时间" : "更新时间";
    const timeText = formatTime(timeValue);
    const relativeText = timeValue ? formatRelative(timeValue) : "";
    const iconContent =
      kind === "image" && thumbnailUrl
        ? `<img class="details-summary-thumb" src="${escapeHtml(thumbnailUrl(pathValue, 320, 240))}" alt="${escapeHtml(selected.name || "")}" loading="lazy" onerror="this.onerror=null;this.src='/icons/file-type-${kind}.svg'">`
        : iconForKind(kind, selected.name);
    const primaryActions = state.explorer.trashMode
      ? `
        <button class="btn btn-primary details-action-btn" data-action="restore-trash" data-key="${escapeHtml(key)}">
          <span class="icon">${icons.restore}</span>恢复
        </button>
        <button class="btn btn-danger details-action-btn" data-action="delete-trash" data-key="${escapeHtml(key)}">
          <span class="icon">${icons.trash}</span>彻底删除
        </button>
      `
      : `
        ${isFolder ? `<button class="btn btn-primary details-action-btn" data-action="open-entry" data-key="${escapeHtml(key)}"><span class="icon">${icons.folder}</span>打开文件夹</button>` : ""}
        ${previewable ? `<button class="btn btn-primary details-action-btn" data-action="preview-entry" data-key="${escapeHtml(key)}"><span class="icon">${icons.eye}</span>预览</button>` : ""}
        ${canDownload ? `<button class="btn details-action-btn" data-action="download-entry" data-key="${escapeHtml(key)}"><span class="icon">${icons.download}</span>下载</button>` : ""}
      `;
    const manageActions =
      !state.explorer.trashMode && state.app.role === "admin"
        ? `
          <div class="details-action-row details-action-row-secondary">
            <button class="btn btn-small" data-action="open-share-modal" data-key="${escapeHtml(key)}">
              <span class="icon">${icons.share}</span>分享
            </button>
            <button class="btn btn-small" data-action="open-rename-modal" data-key="${escapeHtml(key)}">
              <span class="icon">${icons.edit}</span>重命名
            </button>
          </div>
        `
        : "";

    return `
      <div class="details-panel-shell">
        <section class="details-summary">
          <div class="details-summary-icon ${iconClass(kind)} ${kind === "image" ? "details-summary-image" : ""}">
            ${iconContent}
          </div>
          <div class="details-summary-main">
            <h3 class="details-panel-title" title="${escapeHtml(selected.name || "未命名")}">${escapeHtml(selected.name || "未命名")}</h3>
            <p class="details-panel-copy" title="${escapeHtml(pathValue || "/")}">${escapeHtml(pathValue || "/")}</p>
            <div class="details-chip-row">
              <span class="details-chip">${escapeHtml(kindLabel)}</span>
              <span class="details-chip">${escapeHtml(sizeText)}</span>
              ${previewable ? `<span class="details-chip details-chip-accent">可预览</span>` : ""}
              ${state.explorer.trashMode ? `<span class="details-chip details-chip-danger">回收站</span>` : ""}
            </div>
          </div>
        </section>

        <section class="details-section">
          <div class="details-section-title">属性</div>
          <div class="details-list">
            <div class="details-row">
              <div class="details-row-label">类型</div>
              <div class="details-row-value">${escapeHtml(kindLabel)}</div>
            </div>
            <div class="details-row">
              <div class="details-row-label">大小</div>
              <div class="details-row-value">${escapeHtml(sizeText)}</div>
            </div>
            <div class="details-row">
              <div class="details-row-label">${timeLabel}</div>
              <div class="details-row-value">
                <span>${escapeHtml(timeText)}</span>
                ${relativeText ? `<span class="details-row-note">${escapeHtml(relativeText)}</span>` : ""}
              </div>
            </div>
            <div class="details-row details-row-path">
              <div class="details-row-label">路径</div>
              <div class="details-row-value details-path-value" title="${escapeHtml(pathValue || "/")}">${escapeHtml(pathValue || "/")}</div>
            </div>
          </div>
        </section>

        <section class="details-panel-actions">
          <div class="details-section-title">操作</div>
          <div class="details-action-row">
            ${primaryActions}
          </div>
          ${manageActions}
        </section>
      </div>
    `;
  }

  function renderBatchBar(state, selectedEntries) {
    const busy = state.explorer.batchBusy;
    const disabled = busy ? "disabled" : "";
    const singleKey =
      selectedEntries.length === 1 ? selectedEntries[0]?.fullKey || "" : "";
    return `
      <div class="batch-bar">
        <div class="status-main">
          <span class="status-dot"></span>
          <span>${busy ? "正在处理批量操作，请稍候…" : `已选中 ${selectedEntries.length} 项，可以批量复制、移动或删除。`}</span>
        </div>
        <div class="btn-row">
          ${singleKey ? `<button class="btn" data-action="open-rename-modal" data-key="${escapeHtml(singleKey)}" ${disabled}>重命名</button>` : ""}
          ${selectedEntries.length > 1 ? `<button class="btn" data-action="zip-download" ${disabled}>批量下载</button>` : ""}
          <button class="btn" data-action="copy-selected" ${disabled}>复制</button>
          <button class="btn" data-action="move-selected" ${disabled}>移动</button>
          ${state.app.role === "admin" ? `<button class="btn btn-danger" data-action="delete-selected" ${disabled}>删除</button>` : ""}
          <button class="btn" data-action="clear-selected" ${disabled}>取消选择</button>
        </div>
      </div>
    `;
  }

  function renderTrashBatchBar(state, selectedEntries, trashKeys, busy) {
    const disabled = busy ? "disabled" : "";
    return `
      <div class="batch-bar">
        <div class="status-main">
          <span class="status-dot"></span>
          <span>${busy ? "正在处理批量操作，请稍候…" : `已选中 ${(trashKeys || state.explorer.trashSelectedKeys).length} 项回收站记录，可以恢复或彻底删除。`}</span>
        </div>
        <div class="btn-row">
          <button class="btn" data-action="restore-selected-trash" ${disabled}>批量恢复</button>
          ${state.app.role === "admin" ? `<button class="btn btn-danger" data-action="delete-selected-trash" ${disabled}>批量彻底删除</button>` : ""}
          <button class="btn" data-action="clear-selected" ${disabled}>取消选择</button>
        </div>
      </div>
    `;
  }

  const kindOptions = [
    ["all", "全部"],
    ["folder", "文件夹"],
    ["image", "图片"],
    ["video", "视频"],
    ["audio", "音频"],
    ["pdf", "PDF"],
    ["text", "文本"],
    ["archive", "压缩包"],
    ["file", "其他"],
  ];

  function renderKindOptions(selected, trashMode, popup) {
    if (popup) {
      return kindOptions
        .map(
          ([value, label]) => `
          <button class="filter-popup-item${selected === value ? " is-active" : ""}" data-action="set-kind-filter" data-value="${value}">
            ${label}
          </button>`,
        )
        .join("");
    }

    const current = kindOptions.find(([v]) => v === selected);
    return current ? current[1] : "全部";
  }

  function renderCrumb(item, index, items) {
    const isLast = index === items.length - 1;
    const isFirst = index === 0;
    const separator = index > 0 ? '<span class="crumb-sep">/</span>' : "";

    if (item.ellipsis) {
      return `${separator}<button class="crumb-btn crumb-ellipsis" data-action="expand-crumbs" title="展开全部路径">...</button>`;
    }

    return `
      ${separator}<button class="crumb-btn ${isLast ? "crumb-current" : ""}" data-action="crumb" data-path="${escapeHtml(item.path)}">
        ${escapeHtml(item.label)}
      </button>
    `;
  }

  function buildBreadcrumbs(path, expanded = false) {
    const parts = normalizeKey(path).split("/").filter(Boolean);
    const crumbs = [{ label: "根目录", path: "", current: parts.length === 0 }];
    let current = "";

    parts.forEach((part, index) => {
      current = current ? `${current}/${part}` : part;
      crumbs.push({
        label: part,
        path: current,
        current: index === parts.length - 1,
      });
    });

    if (expanded || crumbs.length <= 4) return crumbs;

    const first = crumbs[0];
    const parent = crumbs.length > 2 ? crumbs[crumbs.length - 2] : null;
    const last = crumbs[crumbs.length - 1];
    const result = [first, { label: "...", path: "", ellipsis: true }];
    if (parent) result.push(parent);
    result.push(last);
    return result;
  }

  function renderEntryCard(item, state, selectedSet) {
    const key = entryKey(item);
    const picked = selectedSet.has(key);
    const kind = item.kind || inferKind(item);
    const isFolder = kind === "folder";
    const isImage = kind === "image";
    const isList = state.explorer.view === "list";
    const path =
      item.fullKey || item.original_key || item.path || item.name || "";
    const meta = state.explorer.trashMode
      ? [isFolder ? "文件夹" : "文件", formatTime(item.trashedAt || 0)]
      : [
          isFolder
            ? "文件夹"
            : item.sizeFormatted || formatBytes(item.rawSize || 0),
          isFolder ? "" : formatTime(item.time),
        ].filter(Boolean);

    const sizeText = isFolder
      ? "文件夹"
      : item.sizeFormatted || formatBytes(item.rawSize || 0);
    const timeText = formatTime(item.time);
    const searchHit = item.searchHit;
    const searchHitText = searchHit
      ? `${searchHit.label || "命中"}：${searchHit.value || item.fullKey || item.name || ""}`
      : "";
    const searchFilterText = searchHit?.filters?.length
      ? `筛选：${searchHit.filters.join("、")}`
      : "";

    const iconContent =
      isImage && thumbnailUrl
        ? `<img class="item-thumb" src="${escapeHtml(thumbnailUrl(path, 320, 240))}" alt="${escapeHtml(item.name || "")}" loading="lazy" onerror="this.onerror=null;this.src='/icons/file-type-${kind}.svg'">`
        : iconForKind(kind, item.name);

    return `
      <article class="item-card item-card-legacy" data-action="open-entry" data-key="${escapeHtml(key)}">
        <button class="item-pick ${picked ? "is-active" : ""}" data-action="toggle-pick" data-key="${escapeHtml(key)}">
          ${picked ? icons.check : ""}
        </button>
        <div class="item-icon ${iconClass(kind)} ${isImage ? "item-icon-image" : ""}">
          ${iconContent}
        </div>
        <div class="item-content">
          <h3 class="item-title">${escapeHtml(item.name || "未命名项目")}</h3>
          ${
            !isList
              ? `<div class="item-meta">
            ${meta.map((text) => `<span class="item-chip">${escapeHtml(text)}</span>`).join("")}
            ${searchHitText ? `<span class="item-hit" title="${escapeHtml(searchHitText)}">${escapeHtml(searchHitText)}</span>` : ""}
            ${searchFilterText ? `<span class="item-hit item-hit-muted" title="${escapeHtml(searchFilterText)}">${escapeHtml(searchFilterText)}</span>` : ""}
          </div>`
              : ""
          }
        </div>
        ${
          isList
            ? `
        <span class="item-list-size">${escapeHtml(sizeText)}</span>
        <span class="item-list-time">${escapeHtml(timeText)}</span>
        ${searchHitText ? `<span class="item-list-hit" title="${escapeHtml(searchHitText)}">${escapeHtml(searchHitText)}</span>` : ""}
        `
            : ""
        }
        <div class="item-actions">
          ${!isFolder && canPreview(item) ? `<button class="item-action-btn" data-action="preview" data-key="${escapeHtml(key)}" title="预览">${icons.eye}</button>` : ""}
          ${
            !isFolder
              ? `<button class="item-action-btn" data-action="download" data-key="${escapeHtml(key)}" title="下载">
            ${icons.download}
          </button>`
              : ""
          }
          ${
            !isFolder
              ? `<button class="item-action-btn" data-action="info" data-key="${escapeHtml(key)}" title="详细">
            ${icons.info}
          </button>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderEmptyState(title, copy, icon) {
    return `
      <div class="empty-state">
        <div>
          <div class="empty-orb">${icon}</div>
          <h3 class="empty-title">${escapeHtml(title)}</h3>
          <p class="empty-copy">${escapeHtml(copy)}</p>
        </div>
      </div>
    `;
  }

  function renderEmptyStateCompact(title, copy, icon) {
    return `
      <div class="empty-state-compact">
        <div>
          ${icon ? `<div class="empty-orb">${icon}</div>` : ""}
          <h3 class="empty-title">${escapeHtml(title)}</h3>
          <p class="empty-copy">${escapeHtml(copy)}</p>
        </div>
      </div>
    `;
  }

  return {
    renderInspector,
    renderBatchBar,
    renderTrashBatchBar,
    renderKindOptions,
    renderCrumb,
    buildBreadcrumbs,
    renderEntryCard,
    renderEmptyState,
    renderEmptyStateCompact,
  };
}
