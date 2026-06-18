export function createSharedRenderers(deps) {
  const {
    icons,
    escapeHtml,
    inferKind,
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
    const isFolder = kind === 'folder';
    const canPreview = kind !== 'folder' && !state.explorer.trashMode;
    const canDownload = kind !== 'folder' && !state.explorer.trashMode;
    const pathValue = selected.fullKey || selected.original_key || selected.path || selected.name || '';

    return `
      <div class="details-panel-shell">
        <div class="details-panel-head">
          <div>
            <h3 class="details-panel-title">${escapeHtml(selected.name || '未命名')}</h3>
            <p class="details-panel-copy">${escapeHtml(pathValue || '/')}</p>
          </div>
        </div>

        <div class="details-panel-grid">
          <div class="details-kv">
            <div class="details-k">类型</div>
            <div class="details-v">${escapeHtml(kind)}</div>
          </div>
          <div class="details-kv">
            <div class="details-k">${state.explorer.trashMode ? '删除时间' : '更新时间'}</div>
            <div class="details-v">${escapeHtml(formatTime(selected.trashedAt || selected.time || 0))}</div>
          </div>
          <div class="details-kv">
            <div class="details-k">大小</div>
            <div class="details-v">${escapeHtml(selected.sizeFormatted || formatBytes(selected.rawSize || 0))}</div>
          </div>
        </div>

        <div class="details-panel-actions">
          ${
            state.explorer.trashMode
              ? `
                <button class="btn" data-action="restore-trash" data-key="${escapeHtml(entryKey(selected))}">恢复</button>
                <button class="btn btn-danger" data-action="delete-trash" data-key="${escapeHtml(entryKey(selected))}">彻底删除</button>
              `
              : `
                ${isFolder ? `<button class="btn" data-action="open-entry" data-key="${escapeHtml(entryKey(selected))}">打开文件夹</button>` : ''}
                ${canPreview ? `<button class="btn" data-action="preview-entry" data-key="${escapeHtml(entryKey(selected))}">预览</button>` : ''}
                ${canDownload ? `<button class="btn" data-action="download-entry" data-key="${escapeHtml(entryKey(selected))}">下载</button>` : ''}
                ${!isFolder && state.app.role === 'admin' ? `<button class="btn" data-action="open-share-modal" data-key="${escapeHtml(entryKey(selected))}">分享</button>` : ''}
                ${state.app.role === 'admin' ? `<button class="btn" data-action="open-rename-modal" data-key="${escapeHtml(entryKey(selected))}">重命名</button>` : ''}
              `
          }
        </div>
      </div>
    `;
  }

  function renderBatchBar(state, selectedEntries) {
    const busy = state.explorer.batchBusy;
    const disabled = busy ? 'disabled' : '';
    return `
      <div class="batch-bar">
        <div class="status-main">
          <span class="status-dot"></span>
          <span>${busy ? '正在处理批量操作，请稍候…' : `已选中 ${selectedEntries.length} 项，可以批量复制、移动或删除。`}</span>
        </div>
        <div class="btn-row">
          <button class="btn" data-action="copy-selected" ${disabled}>复制</button>
          <button class="btn" data-action="move-selected" ${disabled}>移动</button>
          ${state.app.role === 'admin' ? `<button class="btn btn-danger" data-action="delete-selected" ${disabled}>删除</button>` : ''}
          <button class="btn" data-action="clear-selected" ${disabled}>取消选择</button>
        </div>
      </div>
    `;
  }

  function renderTrashBatchBar(state, selectedEntries, trashKeys, busy) {
    const disabled = busy ? 'disabled' : '';
    return `
      <div class="batch-bar">
        <div class="status-main">
          <span class="status-dot"></span>
          <span>${busy ? '正在处理批量操作，请稍候…' : `已选中 ${(trashKeys || state.explorer.trashSelectedKeys).length} 项回收站记录，可以恢复或彻底删除。`}</span>
        </div>
        <div class="btn-row">
          <button class="btn" data-action="restore-selected-trash" ${disabled}>批量恢复</button>
          ${state.app.role === 'admin' ? `<button class="btn btn-danger" data-action="delete-selected-trash" ${disabled}>批量彻底删除</button>` : ''}
          <button class="btn" data-action="clear-selected" ${disabled}>取消选择</button>
        </div>
      </div>
    `;
  }

  const kindOptions = [
    ['all', '全部'],
    ['folder', '文件夹'],
    ['image', '图片'],
    ['video', '视频'],
    ['audio', '音频'],
    ['pdf', 'PDF'],
    ['text', '文本'],
    ['archive', '压缩包'],
    ['file', '其他'],
  ];

  function renderKindOptions(selected, trashMode, popup) {
    if (popup) {
      return kindOptions
        .map(([value, label]) => `
          <button class="filter-popup-item${selected === value ? ' is-active' : ''}" data-action="set-kind-filter" data-value="${value}">
            ${label}
          </button>`)
        .join('');
    }

    const current = kindOptions.find(([v]) => v === selected);
    return current ? current[1] : '全部';
  }

  function renderCrumb(item, index, items) {
    const isLast = index === items.length - 1;
    const isFirst = index === 0;
    const separator = index > 0 ? '<span class="crumb-sep">/</span>' : '';

    if (item.ellipsis) {
      return `${separator}<button class="crumb-btn crumb-ellipsis" data-action="expand-crumbs" title="展开全部路径">...</button>`;
    }

    return `
      ${separator}<button class="crumb-btn ${isLast ? 'crumb-current' : ''}" data-action="crumb" data-path="${escapeHtml(item.path)}">
        ${escapeHtml(item.label)}
      </button>
    `;
  }

  function buildBreadcrumbs(path, expanded = false) {
    const parts = normalizeKey(path).split('/').filter(Boolean);
    const crumbs = [{ label: '根目录', path: '', current: parts.length === 0 }];
    let current = '';

    parts.forEach((part, index) => {
      current = current ? `${current}/${part}` : part;
      crumbs.push({ label: part, path: current, current: index === parts.length - 1 });
    });

    if (expanded || crumbs.length <= 4) return crumbs;

    const first = crumbs[0];
    const parent = crumbs.length > 2 ? crumbs[crumbs.length - 2] : null;
    const last = crumbs[crumbs.length - 1];
    const result = [first, { label: '...', path: '', ellipsis: true }];
    if (parent) result.push(parent);
    result.push(last);
    return result;
  }

  function renderEntryCard(item, state) {
    const key = entryKey(item);
    const picked = state.explorer.selectedKeys.includes(key);
    const kind = item.kind || inferKind(item);
    const isFolder = kind === 'folder';
    const isImage = kind === 'image';
    const path = item.fullKey || item.original_key || item.path || item.name || '';
    const meta = state.explorer.trashMode
      ? [isFolder ? '文件夹' : '文件', formatTime(item.trashedAt || 0)]
      : [
          isFolder ? '文件夹' : (item.sizeFormatted || formatBytes(item.rawSize || 0)),
          item.time ? formatRelative(item.time) : '等待同步',
        ];

    const iconContent = isImage && thumbnailUrl
      ? `<img class="item-thumb" src="${escapeHtml(thumbnailUrl(path, 320, 240))}" alt="" loading="lazy" onerror="this.parentElement.classList.add('item-icon');this.remove();this.parentElement.innerHTML='${iconForKind(kind).replace(/'/g, "\\'")}'">`
      : iconForKind(kind);

    return `
      <article class="item-card item-card-legacy" data-action="open-entry" data-key="${escapeHtml(key)}">
        <button class="item-pick ${picked ? 'is-active' : ''}" data-action="toggle-pick" data-key="${escapeHtml(key)}">
          ${picked ? icons.check : ''}
        </button>
        <div class="item-icon ${iconClass(kind)} ${isImage ? 'item-icon-image' : ''}">${iconContent}</div>
        <div class="item-content">
          <h3 class="item-title">${escapeHtml(item.name || '未命名项目')}</h3>
          <div class="item-meta">
            ${meta.map(text => `<span class="item-chip">${escapeHtml(text)}</span>`).join('')}
          </div>
        </div>
        ${!isFolder ? `
        <div class="item-actions">
          <button class="item-action-btn" data-action="preview" data-key="${escapeHtml(key)}" title="预览">
            ${icons.eye}
          </button>
          <button class="item-action-btn" data-action="download" data-key="${escapeHtml(key)}" title="下载">
            ${icons.download}
          </button>
          <button class="item-action-btn" data-action="info" data-key="${escapeHtml(key)}" title="详细">
            ${icons.info}
          </button>
        </div>
        ` : ''}
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

  return {
    renderInspector,
    renderBatchBar,
    renderTrashBatchBar,
    renderKindOptions,
    renderCrumb,
    buildBreadcrumbs,
    renderEntryCard,
    renderEmptyState,
  };
}
