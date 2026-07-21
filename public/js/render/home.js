export function createHomeRenderers(deps) {
  const {
    icons,
    currentEntries,
    selectedEntriesFromState,
    buildBreadcrumbs,
    humanSort,
    humanView,
    renderKindOptions,
    renderCrumb,
    renderEntryCard,
    renderBatchBar,
    renderTrashBatchBar,
    renderEmptyState,
    escapeHtml,
    inferKind,
    canPreview,
    formatTime,
    entryKey,
    iconForKind,
    iconClass,
    thumbnailUrl,
  } = deps;

  function renderHomePage(state) {
    const explorer = state.explorer;
    const entries = currentEntries(state);
    const selectedEntries = selectedEntriesFromState(state);
    const isAdmin = state.app.role === "admin";
    const canBrowse = isAdmin || state.app.guestMode;

    return `
      <div class="toolbar-card mb-4 flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
        <div class="tools-left">
          ${canBrowse ? `
          <nav aria-label="面包屑导航">
            <div class="crumbs">
              ${breadcrumbsMarkup(explorer.path, explorer.expandedCrumbs)}
            </div>
          </nav>
          ` : `
          <nav aria-label="面包屑导航" style="visibility:hidden">
            <div class="crumbs">
              ${breadcrumbsMarkup(explorer.path, explorer.expandedCrumbs)}
            </div>
          </nav>
          `}
        </div>
        ${canBrowse ? `
        <div class="tools-right flex items-center gap-2">
          ${isAdmin ? `
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="upload">上传</button>
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="open-folder-modal">新建</button>
          ` : ''}
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="cycle-sort">${humanSort(explorer.sort)}</button>
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="toggle-view">${humanView(explorer.view)}</button>
          <div class="relative inline-block">
            <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors filter-popup-trigger" data-action="toggle-filter-popup" aria-label="文件类型筛选">
              ${renderKindOptions(explorer.filter, explorer.trashMode)}
            </button>
            <div class="filter-popup notif-hidden" data-role="kind-filter-popup">
              ${renderKindOptions(explorer.filter, explorer.trashMode, true)}
            </div>
          </div>
          ${isAdmin ? `
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors ${explorer.trashMode ? "bg-slate-100 border-slate-300" : ""}" data-action="toggle-trash">${explorer.trashMode ? "退出回收站" : "回收站"}</button>
          ${explorer.trashMode ? '<button class="px-4 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors" data-action="confirm-clear-trash">清空回收站</button>' : ""}
          ` : ''}
        </div>
        ` : `
        <div class="tools-right flex items-center gap-2" style="visibility:hidden">
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">${humanSort(explorer.sort)}</button>
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">${humanView(explorer.view)}</button>
          <div class="relative inline-block">
            <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors filter-popup-trigger">
              ${renderKindOptions(explorer.filter, explorer.trashMode)}
            </button>
          </div>
        </div>
        `}
        <input class="sr-only" id="upload-input" type="file" multiple aria-label="选择文件上传">
        <input class="sr-only" id="folder-upload-input" type="file" multiple webkitdirectory directory aria-label="选择文件夹上传">
      </div>

      <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col" id="explorerCard">
        ${renderExplorerContent(state, entries, selectedEntries)}
        <div class="flex-shrink-0 h-6"></div>
      </div>
    `;
  }

  function breadcrumbsMarkup(path, expanded) {
    return `<div class="crumbs-bar">${buildBreadcrumbs(path, expanded).map(renderCrumb).join("")}</div>`;
  }

  function renderCustomSelect({ id, value, options, actionChange, dataKey, className = "" }) {
    const selected = options.find((option) => option.value === value) || options[0];
    return `
      <div class="cselect ${className}" data-cselect="${escapeHtml(id)}"
           data-action-change="${escapeHtml(actionChange || "")}"
           data-key="${escapeHtml(dataKey || "")}"
           data-value="${escapeHtml(selected?.value || "")}">
        <button class="cselect-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${escapeHtml(id)}-listbox">
          <span class="cselect-value">${escapeHtml(selected?.label || "")}</span>
          <svg class="cselect-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div class="cselect-dropdown" id="${escapeHtml(id)}-listbox" role="listbox">
          ${options.map((option) => `
            <div class="cselect-option ${option.value === selected?.value ? "cselect-active" : ""}" data-value="${escapeHtml(option.value)}" role="option" aria-selected="${option.value === selected?.value}" tabindex="-1">
              ${escapeHtml(option.label)}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderFilterPanel(explorer) {
    if (!explorer.showFilters) return "";
    const kindOptions = [
      "all",
      "image",
      "video",
      "audio",
      "pdf",
      "text",
      "archive",
      "file",
    ];
    return `
      <div class="filter-panel">
        <div class="filter-field">
          <label class="filter-label">类型</label>
          ${renderCustomSelect({
            id: "home-filter-kind",
            value: explorer.filterKind,
            actionChange: "set-filter-kind",
            className: "filter-input home-filter-select",
            options: kindOptions.map((kind) => ({
              value: kind,
              label: kind === "all" ? "全部" : kind,
            })),
          })}
        </div>
        <div class="filter-field">
          <label class="filter-label">最小大小 (KB)</label>
          <input class="inline-input filter-input" type="number" min="0" data-role="filter-min-size" value="${escapeHtml(explorer.filterMinSize)}" style="width:100px;">
        </div>
        <div class="filter-field">
          <label class="filter-label">最大大小 (KB)</label>
          <input class="inline-input filter-input" type="number" min="0" data-role="filter-max-size" value="${escapeHtml(explorer.filterMaxSize)}" style="width:100px;">
        </div>
        <div class="filter-field">
          <label class="filter-label">修改日期从</label>
          <input class="inline-input filter-input" type="date" data-role="filter-date-from" value="${escapeHtml(explorer.filterDateFrom)}">
        </div>
        <div class="filter-field">
          <label class="filter-label">到</label>
          <input class="inline-input filter-input" type="date" data-role="filter-date-to" value="${escapeHtml(explorer.filterDateTo)}">
        </div>
        <button class="btn toolbar-btn" data-action="clear-search-filters" type="button" style="font-size:13px;padding:4px 12px;">清除筛选</button>
      </div>
    `;
  }

  function renderLoadMore(explorer) {
    if (!explorer.hasMore || explorer.loading) return "";
    const label = explorer.searchScanLimitReached
      ? "继续扫描更多结果"
      : "加载更多结果";
    return `
      <div style="text-align:center;padding:16px;">
        <button class="btn toolbar-btn" data-action="load-more-search" type="button">${escapeHtml(label)}</button>
      </div>
    `;
  }

  function renderSearchProgress(explorer) {
    if (!explorer.query || explorer.searching) return "";
    const scanned = Number(explorer.searchScanned || 0);
    if (!scanned && !explorer.searchScanLimitReached) return "";
    const text = explorer.searchScanLimitReached
      ? `已扫描 ${scanned} 项，仍有更多目录可继续加载`
      : `已扫描 ${scanned} 项`;
    return `<span class="search-progress-note">${escapeHtml(text)}</span>`;
  }

  function renderExplorerContent(state, entries, selectedEntries) {
    const explorer = state.explorer;

    return `
      ${
        explorer.query && !explorer.trashMode
          ? `
            <div class="result-hint">
              <span class="status-dot"></span>
              <span>${
                explorer.searching
                  ? `正在搜索“${escapeHtml(explorer.query)}”…`
                  : `找到 ${entries.length} 个匹配“${escapeHtml(explorer.query)}”的结果${explorer.filter !== "all" || explorer.filterKind !== "all" ? `（已应用筛选）` : ""}`
              }</span>
              ${renderSearchProgress(explorer)}
              <button class="btn toolbar-btn" data-action="toggle-search-filters" type="button" style="font-size:12px;padding:2px 8px;margin-left:8px;">${explorer.showFilters ? "收起筛选" : "筛选"}</button>
            </div>
            ${renderFilterPanel(explorer)}
          `
          : ""
      }
      ${renderExplorerBanner(state, selectedEntries)}
      ${renderExplorerBody(state, entries)}
      ${explorer.query ? renderLoadMore(explorer) : ""}
    `;
  }

  function renderExplorerBanner(state, selectedEntries) {
    const explorer = state.explorer;

    if (explorer.trashMode) {
      if (explorer.trashSelectedKeys.length) {
        return renderTrashBatchBar(
          state,
          selectedEntries,
          explorer.trashSelectedKeys,
          explorer.trashBatchBusy,
        );
      }
    } else if (explorer.selectedKeys.length) {
      return renderBatchBar(state, selectedEntries);
    }

    if (explorer.clipboard?.paths?.length) {
      return `
        <div class="batch-bar">
          <div class="status-main">
            <span class="status-dot"></span>
            <span>剪贴板中有 ${explorer.clipboard.paths.length} 项，准备${explorer.clipboard.action === "move" ? "移动" : "复制"}到当前文件夹。</span>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" data-action="paste-clipboard">粘贴到这里</button>
            <button class="btn" data-action="clear-clipboard">清空剪贴板</button>
          </div>
        </div>
      `;
    }

    return "";
  }

  function renderBackCard(parentPath) {
    const parentLabel = parentPath
      ? parentPath.split("/").filter(Boolean).pop() || "上级目录"
      : "根目录";

    return `
      <article class="item-card item-card-legacy item-card-back" data-action="crumb" data-path="${escapeHtml(parentPath)}" aria-label="返回上一层">
        <div class="item-icon file item-back-icon">
          ${icons.arrowLeft}
        </div>
        <div class="item-content">
          <h3 class="item-title">返回上一层</h3>
          <div class="item-meta">
            <span class="item-chip">上级目录</span>
            <span class="item-chip">${escapeHtml(parentLabel)}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderExplorerBody(state, entries) {
    const explorer = state.explorer;

    if (explorer.loading) {
      return renderEmptyState(
        "正在载入",
        "文件列表正在同步，请稍候。",
        "<span></span>",
      );
    }

    if (explorer.error) {
      if (explorer.error === "Unauthorized") {
        return renderEmptyState(
          "访客访问未开启",
          "当前站点未开放访客浏览，请联系管理员或登录后查看。",
          icons.lock,
        );
      }
      return renderEmptyState("加载失败", explorer.error, "<span></span>");
    }

    const parentPath = explorer.path
      ? explorer.path.split("/").slice(0, -1).join("/")
      : "";
    const showBackButton = explorer.path && !explorer.trashMode;

    if (entries.length) {
      const isList = explorer.view === "list";
      const selectedSet = new Set(explorer.selectedKeys || []);
      const displayLimit = Number(explorer.displayLimit || 0);
      const hiddenCount =
        displayLimit > 0 && entries.length > displayLimit
          ? entries.length - displayLimit
          : 0;
      const visibleEntries = hiddenCount ? entries.slice(0, displayLimit) : entries;
      const showMoreHtml = hiddenCount
        ? `
          <div style="text-align:center;padding:16px;">
            <button class="btn toolbar-btn" data-action="show-more-entries" type="button">显示更多（剩余 ${hiddenCount} 项）</button>
          </div>
        `
        : "";

      if (isList) {
        return renderListTable(state, visibleEntries, showBackButton, parentPath, selectedSet) + showMoreHtml;
      }

      return `
        <div class="file-grid">
          ${
            showBackButton
              ? renderBackCard(parentPath)
              : ""
          }
          ${visibleEntries.map((item) => renderEntryCard(item, state, selectedSet)).join("")}
        </div>
        ${showMoreHtml}
      `;
    }

    const emptyTitle = explorer.query
      ? "没有搜索结果"
      : explorer.trashMode
        ? "回收站为空"
        : "这个文件夹还是空的";
    const emptyCopy = explorer.query
      ? "试试换一个关键词，或者回到文件夹里继续找。"
      : explorer.trashMode
        ? "当前没有已删除项目。"
        : "可以直接上传文件，或者先新建一个文件夹。";

    if (showBackButton) {
      return `
        <div class="file-grid">
          ${renderBackCard(parentPath)}
        </div>
        ${renderEmptyState(emptyTitle, emptyCopy, "<span></span>")}
      `;
    }

    return renderEmptyState(emptyTitle, emptyCopy, "<span></span>");
  }

  function renderListTable(state, entries, showBackButton, parentPath, selectedSet) {
    const explorer = state.explorer;
    const sortField = explorer.sortField || "name";
    const sortDir = explorer.sortDir || "asc";

    const getSortIcon = (field) => {
      if (sortField !== field) return '<span class="sort-icon">↕</span>';
      return sortDir === "asc"
        ? '<span class="sort-icon">↑</span>'
        : '<span class="sort-icon">↓</span>';
    };

    const getSortClass = (field) => (sortField === field ? "sort-active" : "");

    return `
      <div class="list-table-wrap">
        <table class="list-table">
          <thead>
            <tr>
              <th class="col-checkbox">
                <div class="th-inner">
                  <button class="list-checkbox" data-action="toggle-all-pick" title="全选">
                    ${icons.check}
                  </button>
                </div>
              </th>
              <th class="col-name">
                <div class="th-inner">名称</div>
              </th>
              <th class="col-size col-sortable ${getSortClass("size")}" data-action="sort-list" data-field="size">
                <div class="th-inner">
                  大小
                  ${getSortIcon("size")}
                </div>
              </th>
              <th class="col-time col-sortable ${getSortClass("time")}" data-action="sort-list" data-field="time">
                <div class="th-inner">
                  修改时间
                  ${getSortIcon("time")}
                </div>
              </th>
              <th class="col-ops">
                <div class="th-inner">操作</div>
              </th>
            </tr>
          </thead>
          <tbody>
            ${
              showBackButton
                ? `
            <tr class="row-back">
              <td colspan="5">
                <button class="list-back-btn" data-action="crumb" data-path="${escapeHtml(parentPath)}">
                  ${icons.arrowLeft}
                  <span>返回上一层</span>
                </button>
              </td>
            </tr>
            `
                : ""
            }
            ${entries.map((item) => renderListRow(item, state, selectedSet)).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderListRow(item, state, selectedSet) {
    const key = entryKey(item);
    const picked = selectedSet.has(key);
    const kind = item.kind || inferKind(item);
    const isFolder = kind === "folder";
    const isImage = kind === "image";
    const path =
      item.fullKey || item.original_key || item.path || item.name || "";

    const sizeText = isFolder
      ? item.sizeFormatted || "—"
      : item.sizeFormatted || formatBytes(item.rawSize || 0);

    const timeText = item.time ? formatTime(item.time) : "—";

    const fileName = item.name || "未命名";
    const displayName =
      fileName.length > 40 ? fileName.substring(0, 37) + "..." : fileName;

    const iconContent =
      isImage && thumbnailUrl
        ? `<img class="item-thumb" src="${escapeHtml(thumbnailUrl(path, 320, 240))}" data-fallback-src="/icons/file-type-${kind}.svg" alt="${escapeHtml(item.name || "")}" loading="lazy">`
        : iconForKind(kind, item.name);

    return `
      <tr class="${picked ? "is-selected" : ""}" data-key="${escapeHtml(key)}">
        <td class="col-checkbox">
          <button class="list-checkbox ${picked ? "is-checked" : ""}" data-action="toggle-pick" data-key="${escapeHtml(key)}">
            ${picked ? icons.check : ""}
          </button>
        </td>
        <td class="col-name">
          <div class="list-name-cell" data-action="open-entry" data-key="${escapeHtml(key)}">
            <div class="cell-icon ${iconClass(kind)} ${isImage ? "item-icon-image" : ""}">
              ${iconContent}
            </div>
            <div class="cell-name">
              <span class="cell-name-text" data-tooltip="${escapeHtml(fileName)}">${escapeHtml(displayName)}</span>
              ${isFolder ? '<span class="cell-name-sub">文件夹</span>' : ""}
            </div>
          </div>
        </td>
        <td class="col-size">
          <span class="list-cell-text ${isFolder ? "list-cell-placeholder" : ""}">${escapeHtml(sizeText)}</span>
        </td>
        <td class="col-time">
          <span class="list-cell-text">${escapeHtml(timeText)}</span>
        </td>
        <td class="col-ops">
          <div class="list-ops-cell">
            ${!isFolder && canPreview(item) ? `<button class="list-ops-btn" data-action="preview" data-key="${escapeHtml(key)}" title="预览">${icons.eye}</button>` : ""}
            ${!isFolder ? `<button class="list-ops-btn" data-action="download" data-key="${escapeHtml(key)}" title="下载">${icons.download}</button>` : ""}
            <button class="list-ops-btn" data-action="info" data-key="${escapeHtml(key)}" title="详细">${icons.info}</button>
          </div>
        </td>
      </tr>
    `;
  }

  return {
    renderHomePage,
  };
}
