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

    return `
      <div class="toolbar-card mb-4 flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
        <div class="tools-left">
          <nav aria-label="面包屑导航">
            <div class="crumbs">
              ${breadcrumbsMarkup(explorer.path, explorer.expandedCrumbs)}
            </div>
          </nav>
        </div>
        <div class="tools-right flex items-center gap-2">
          ${
            state.app.role === "admin"
              ? `
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="upload">上传</button>
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="open-folder-modal">新建</button>
          `
              : ""
          }
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="cycle-sort">${humanSort(explorer.sort)}</button>
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="toggle-view">${humanView(explorer.view)}</button>
          <div class="relative inline-block">
            <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors filter-popup-trigger" data-action="toggle-filter-popup" aria-label="文件类型筛选">
              ${renderKindOptions(explorer.filter, explorer.trashMode)}
            </button>
            <div class="filter-popup" data-role="kind-filter-popup" style="display:none">
              ${renderKindOptions(explorer.filter, explorer.trashMode, true)}
            </div>
          </div>
          ${
            state.app.role === "admin"
              ? `
                <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors ${explorer.trashMode ? "bg-slate-100 border-slate-300" : ""}" data-action="toggle-trash">${explorer.trashMode ? "退出回收站" : "回收站"}</button>
                ${explorer.trashMode ? '<button class="px-4 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors" data-action="confirm-clear-trash">清空回收站</button>' : ""}
              `
              : ""
          }
        </div>
        <input class="sr-only" id="upload-input" type="file" multiple aria-label="选择文件上传">
        <input class="sr-only" id="folder-upload-input" type="file" multiple webkitdirectory directory aria-label="选择文件夹上传">
      </div>

      <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col" id="explorerCard">
        ${renderExplorerContent(state, entries, selectedEntries)}
      </div>
    `;
  }

  function breadcrumbsMarkup(path, expanded) {
    return `<div class="crumbs-bar">${buildBreadcrumbs(path, expanded).map(renderCrumb).join("")}</div>`;
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
          <select class="inline-input filter-input" data-role="filter-kind">
            ${kindOptions.map((k) => `<option value="${k}" ${explorer.filterKind === k ? "selected" : ""}>${k === "all" ? "全部" : k}</option>`).join("")}
          </select>
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
    return `
      <div style="text-align:center;padding:16px;">
        <button class="btn toolbar-btn" data-action="load-more-search" type="button">加载更多结果</button>
      </div>
    `;
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

      if (isList) {
        return renderListTable(state, entries, showBackButton, parentPath);
      }

      return `
        <div class="file-grid">
          ${
            showBackButton
              ? `
          <article class="item-card item-card-back" data-action="crumb" data-path="${escapeHtml(parentPath)}">
            <div class="item-icon file">
              <span style="display:grid;place-items:center;width:100%;height:100%">${icons.arrowLeft}</span>
            </div>
            <div class="item-content">
              <h3 class="item-title">返回上一层</h3>
            </div>
          </article>
          `
              : ""
          }
          ${entries.map((item) => renderEntryCard(item, state)).join("")}
        </div>
      `;
    }

    return renderEmptyState(
      explorer.query
        ? "没有搜索结果"
        : explorer.trashMode
          ? "回收站为空"
          : "这个文件夹还是空的",
      explorer.query
        ? "试试换一个关键词，或者回到文件夹里继续找。"
        : explorer.trashMode
          ? "当前没有已删除项目。"
          : "可以直接上传文件，或者先新建一个文件夹。",
      "<span></span>",
    );
  }

  function renderListTable(state, entries, showBackButton, parentPath) {
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
            ${entries.map((item) => renderListRow(item, state)).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderListRow(item, state) {
    const key = entryKey(item);
    const picked = state.explorer.selectedKeys.includes(key);
    const kind = item.kind || inferKind(item);
    const isFolder = kind === "folder";
    const isImage = kind === "image";
    const path =
      item.fullKey || item.original_key || item.path || item.name || "";

    const sizeText = isFolder
      ? item.sizeFormatted || "—"
      : item.sizeFormatted || formatBytes(item.rawSize || 0);

    const timeText = item.time ? formatListTime(item.time) : "—";

    const fileName = item.name || "未命名";
    const displayName =
      fileName.length > 40 ? fileName.substring(0, 37) + "..." : fileName;

    const iconContent =
      isImage && thumbnailUrl
        ? `<img class="item-thumb" src="${escapeHtml(thumbnailUrl(path, 320, 240))}" alt="${escapeHtml(item.name || "")}" loading="lazy" onerror="this.onerror=null;this.src='/icons/file-type-${kind}.svg'">`
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

  function formatListTime(timestamp) {
    if (!timestamp) return "—";
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  return {
    renderHomePage,
  };
}
