export function createHomeRenderers(deps) {
  const {
    escapeHtml,
    currentEntries,
    getSelectedEntry,
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
    formatBytes,
  } = deps;

  function renderHomePage(state) {
    const explorer = state.explorer;
    const entries = currentEntries(state);
    const selected = getSelectedEntry(state);
    const selectedEntries = selectedEntriesFromState(state);
    const breadcrumbs = buildBreadcrumbs(explorer.path);
    const totalCount = entries.length;
    const totalSize = entries.reduce((sum, item) => sum + Number(item.rawSize || 0), 0);

    let subtitle = '文件会按当前目录、筛选和排序方式显示在下方内容框内。';
    if (explorer.trashMode) {
      subtitle = '这里集中显示已删除项目，方便恢复或彻底清理。';
    } else if (explorer.query) {
      subtitle = `正在当前目录中搜索 “${escapeHtml(explorer.query)}” 的结果。`;
    }

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
              ? `<button class="btn toolbar-btn ${explorer.trashMode ? 'toolbar-btn-active' : ''}" data-action="toggle-trash">${explorer.trashMode ? '退出回收站' : '回收站'}</button>`
              : ''
          }
        </div>
        <input class="sr-only" id="upload-input" type="file" multiple>
        <input class="sr-only" id="folder-upload-input" type="file" multiple webkitdirectory directory>
      </section>

      <section class="surface surface-legacy">
        <article class="explorer glass-card explorer-legacy">
          <div class="panel-header">
            <div>
              <h2 class="panel-title">${explorer.trashMode ? '回收站' : '文件列表'}</h2>
              <p class="panel-copy">${subtitle}</p>
            </div>
            <span class="toolbar-tag">${totalCount} 项</span>
          </div>

          <div class="panel-body">
            <div class="hero-strip">
              <div class="mini-stat">
                <div class="mini-stat-label">当前位置</div>
                <div class="mini-stat-value">${escapeHtml(explorer.path || '根目录')}</div>
                <div class="mini-stat-meta">${explorer.trashMode ? '回收站视图' : '点击面包屑可返回上级目录'}</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">当前容量</div>
                <div class="mini-stat-value">${formatBytes(totalSize)}</div>
                <div class="mini-stat-meta">${explorer.query ? '基于当前搜索结果统计' : '仅统计当前显示项目'}</div>
              </div>
              <div class="mini-stat">
                <div class="mini-stat-label">显示方式</div>
                <div class="mini-stat-value">${escapeHtml(humanView(explorer.view))}</div>
                <div class="mini-stat-meta">${escapeHtml(humanSort(explorer.sort))} · ${escapeHtml(explorer.filter === 'all' ? '全部类型' : explorer.filter)}</div>
              </div>
            </div>

            <div class="status-bar">
              <div class="status-main">
                <span class="status-dot"></span>
                <span>${explorer.loading ? '正在同步目录内容...' : explorer.error ? escapeHtml(explorer.error) : selected ? `已选中：${escapeHtml(selected.name || '未命名项目')}` : '点击文件或文件夹可在右侧打开详细信息。'}</span>
              </div>
              <div class="status-main">
                <span>${state.app.role === 'admin' ? '支持上传、新建、重命名与分享' : '当前为访客视图'}</span>
              </div>
            </div>

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
                        explorer.query ? '没有搜索结果' : explorer.trashMode ? '回收站为空' : '这个目录还是空的',
                        explorer.query
                          ? '试试换一个关键词，或者回到目录浏览继续查找。'
                          : explorer.trashMode
                            ? '当前没有已删除项目。'
                            : '可以直接上传文件，或先新建一个文件夹。',
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
