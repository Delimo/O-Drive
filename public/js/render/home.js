export function createHomeRenderers(deps) {
  const {
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
    const breadcrumbs = buildBreadcrumbs(explorer.path);

    return `
      <section class="toolbar glass-card toolbar-legacy">
        <div class="toolbar-left">
          <div class="crumbs crumbs-legacy">
            ${breadcrumbs.map(renderCrumb).join('')}
          </div>
        </div>
        <div class="toolbar-right toolbar-actions-legacy">
          <button class="btn toolbar-btn" data-action="upload">上传</button>
          <button class="btn toolbar-btn" data-action="open-folder-modal">新建文件夹</button>
          <button class="btn toolbar-btn" data-action="cycle-sort">${humanSort(explorer.sort)}</button>
          <button class="btn toolbar-btn" data-action="toggle-view">${humanView(explorer.view)}</button>
          <select id="kind-filter" class="inline-select toolbar-select" data-role="kind-filter" aria-label="文件类型筛选">
            ${renderKindOptions(explorer.filter, explorer.trashMode)}
          </select>
          ${
            state.app.role === 'admin'
              ? `
                <button class="btn toolbar-btn ${explorer.trashMode ? 'toolbar-btn-active' : ''}" data-action="toggle-trash">${explorer.trashMode ? '退出回收站' : '回收站'}</button>
                ${explorer.trashMode ? '<button class="btn toolbar-btn btn-danger" data-action="clear-trash">清空回收站</button>' : ''}
              `
              : ''
          }
        </div>
        <input class="sr-only" id="upload-input" type="file" multiple>
        <input class="sr-only" id="folder-upload-input" type="file" multiple webkitdirectory directory>
      </section>

      <section class="surface surface-legacy">
        <article class="explorer glass-card explorer-legacy">
          <div class="panel-body">
            ${
              explorer.query && !explorer.trashMode
                ? `
                  <div class="result-hint">
                    <span class="status-dot"></span>
                    <span>${
                      explorer.searching
                        ? `正在搜索“${escapeHtml(explorer.query)}”…`
                        : `找到 ${entries.length} 个匹配“${escapeHtml(explorer.query)}”的结果${explorer.filter !== 'all' ? `（已按类型筛选）` : ''}`
                    }</span>
                  </div>
                `
                : ''
            }
            ${
              explorer.selectedKeys.length
                ? explorer.trashMode
                  ? renderTrashBatchBar(state, selectedEntries)
                  : renderBatchBar(state, selectedEntries)
                : explorer.clipboard?.paths?.length
                  ? `
                    <div class="batch-bar">
                      <div class="status-main">
                        <span class="status-dot"></span>
                        <span>剪贴板中有 ${explorer.clipboard.paths.length} 项，准备${explorer.clipboard.action === 'move' ? '移动' : '复制'}到当前目录。</span>
                      </div>
                      <div class="btn-row">
                        <button class="btn btn-primary" data-action="paste-clipboard">粘贴到这里</button>
                        <button class="btn" data-action="clear-clipboard">清空剪贴板</button>
                      </div>
                    </div>
                  `
                  : ''
            }

            ${
              explorer.loading
                ? renderEmptyState('正在载入', '文件列表正在同步，请稍候。', '<span></span>')
                : explorer.error
                  ? renderEmptyState('加载失败', explorer.error, '<span></span>')
                  : entries.length
                    ? `
                      <div class="file-grid ${explorer.view === 'list' ? 'is-list' : ''}">
                        ${entries.map(item => renderEntryCard(item, state)).join('')}
                      </div>
                    `
                    : renderEmptyState(
                         explorer.query ? '没有搜索结果' : explorer.trashMode ? '回收站为空' : '这个文件夹还是空的',
                        explorer.query
                          ? '试试换一个关键词，或者回到目录里继续找。'
                          : explorer.trashMode
                            ? '当前没有已删除项目。'
                            : '可以直接上传文件，或者先新建一个文件夹。',
                        '<span></span>',
                      )
            }
          </div>
        </article>
      </section>
    `;
  }

  return {
    renderHomePage,
  };
}
