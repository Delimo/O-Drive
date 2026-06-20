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
  } = deps;

  function renderHomePage(state) {
    const explorer = state.explorer;
    const entries = currentEntries(state);
    const selectedEntries = selectedEntriesFromState(state);

    return `
      <div class="toolbar-card flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
        <div class="tools-left">
          <div class="crumbs">
            ${breadcrumbsMarkup(explorer.path, explorer.expandedCrumbs)}
          </div>
        </div>
        <div class="tools-right flex items-center gap-2">
          ${state.app.role === 'admin' ? `
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="upload">上传</button>
          <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" data-action="open-folder-modal">新建</button>
          ` : ''}
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
            state.app.role === 'admin'
              ? `
                <button class="px-4 py-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors ${explorer.trashMode ? 'bg-slate-100 border-slate-300' : ''}" data-action="toggle-trash">${explorer.trashMode ? '退出回收站' : '回收站'}</button>
                ${explorer.trashMode ? '<button class="px-4 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors" data-action="confirm-clear-trash">清空回收站</button>' : ''}
              `
              : ''
          }
        </div>
        <input class="sr-only" id="upload-input" type="file" multiple>
        <input class="sr-only" id="folder-upload-input" type="file" multiple webkitdirectory directory>
      </div>

      <div class="explorer-card flex-1 min-h-0 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm overflow-y-auto flex flex-col" id="explorerCard">
        ${renderExplorerContent(state, entries, selectedEntries)}
      </div>
    `;
  }

  function breadcrumbsMarkup(path, expanded) {
    return `<div class="crumbs-bar">${buildBreadcrumbs(path, expanded).map(renderCrumb).join('')}</div>`;
  }

  function renderFilterPanel(explorer) {
    if (!explorer.showFilters) return '';
    const kindOptions = ['all', 'image', 'video', 'audio', 'pdf', 'text', 'archive', 'file'];
    return `
      <div class="filter-panel">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:12px;color:var(--muted);">类型</label>
          <select class="inline-input" data-role="filter-kind" style="padding:4px 8px;font-size:13px;">
            ${kindOptions.map(k => `<option value="${k}" ${explorer.filterKind === k ? 'selected' : ''}>${k === 'all' ? '全部' : k}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:12px;color:var(--muted);">最小大小 (KB)</label>
          <input class="inline-input" type="number" min="0" data-role="filter-min-size" value="${escapeHtml(explorer.filterMinSize)}" style="padding:4px 8px;font-size:13px;width:100px;">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:12px;color:var(--muted);">最大大小 (KB)</label>
          <input class="inline-input" type="number" min="0" data-role="filter-max-size" value="${escapeHtml(explorer.filterMaxSize)}" style="padding:4px 8px;font-size:13px;width:100px;">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:12px;color:var(--muted);">修改日期从</label>
          <input class="inline-input" type="date" data-role="filter-date-from" value="${escapeHtml(explorer.filterDateFrom)}" style="padding:4px 8px;font-size:13px;">
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="font-size:12px;color:var(--muted);">到</label>
          <input class="inline-input" type="date" data-role="filter-date-to" value="${escapeHtml(explorer.filterDateTo)}" style="padding:4px 8px;font-size:13px;">
        </div>
        <button class="btn toolbar-btn" data-action="clear-search-filters" type="button" style="font-size:13px;padding:4px 12px;">清除筛选</button>
      </div>
    `;
  }

  function renderLoadMore(explorer) {
    if (!explorer.hasMore || explorer.loading) return '';
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
                  : `找到 ${entries.length} 个匹配“${escapeHtml(explorer.query)}”的结果${explorer.filter !== 'all' || explorer.filterKind !== 'all' ? `（已应用筛选）` : ''}`
              }</span>
              <button class="btn toolbar-btn" data-action="toggle-search-filters" type="button" style="font-size:12px;padding:2px 8px;margin-left:8px;">${explorer.showFilters ? '收起筛选' : '筛选'}</button>
            </div>
            ${renderFilterPanel(explorer)}
          `
          : ''
      }
      ${renderExplorerBanner(state, selectedEntries)}
      ${renderExplorerBody(state, entries)}
      ${explorer.query ? renderLoadMore(explorer) : ''}
    `;
  }

  function renderExplorerBanner(state, selectedEntries) {
    const explorer = state.explorer;

    if (explorer.trashMode) {
      if (explorer.trashSelectedKeys.length) {
        return renderTrashBatchBar(state, selectedEntries, explorer.trashSelectedKeys, explorer.trashBatchBusy);
      }
    } else if (explorer.selectedKeys.length) {
      return renderBatchBar(state, selectedEntries);
    }

    if (explorer.clipboard?.paths?.length) {
      return `
        <div class="batch-bar">
          <div class="status-main">
            <span class="status-dot"></span>
            <span>剪贴板中有 ${explorer.clipboard.paths.length} 项，准备${explorer.clipboard.action === 'move' ? '移动' : '复制'}到当前文件夹。</span>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" data-action="paste-clipboard">粘贴到这里</button>
            <button class="btn" data-action="clear-clipboard">清空剪贴板</button>
          </div>
        </div>
      `;
    }

    return '';
  }

  function renderExplorerBody(state, entries) {
    const explorer = state.explorer;

    if (explorer.loading) {
      return renderEmptyState('正在载入', '文件列表正在同步，请稍候。', '<span></span>');
    }

    if (explorer.error) {
      if (explorer.error === 'Unauthorized') {
        return renderEmptyState('访客访问未开启', '当前站点未开放访客浏览，请联系管理员或登录后查看。', icons.lock);
      }
      return renderEmptyState('加载失败', explorer.error, '<span></span>');
    }

    const parentPath = explorer.path ? explorer.path.split('/').slice(0, -1).join('/') : '';
    const showBackButton = explorer.path && !explorer.trashMode;

    if (entries.length) {
      return `
        ${showBackButton ? `
        <article class="item-card item-card-back" data-action="crumb" data-path="${escapeHtml(parentPath)}">
          <div class="item-icon file">
            <span style="display:grid;place-items:center;width:100%;height:100%">${icons.arrowLeft}</span>
          </div>
          <div class="item-content">
            <h3 class="item-title">返回上一层</h3>
          </div>
        </article>
        ` : ''}
        <div class="file-grid ${explorer.view === 'list' ? 'is-list' : ''}">
          ${entries.map(item => renderEntryCard(item, state)).join('')}
        </div>
      `;
    }

    return renderEmptyState(
      explorer.query ? '没有搜索结果' : explorer.trashMode ? '回收站为空' : '这个文件夹还是空的',
      explorer.query
        ? '试试换一个关键词，或者回到文件夹里继续找。'
        : explorer.trashMode
          ? '当前没有已删除项目。'
          : '可以直接上传文件，或者先新建一个文件夹。',
      '<span></span>',
    );
  }

  return {
    renderHomePage,
  };
}
