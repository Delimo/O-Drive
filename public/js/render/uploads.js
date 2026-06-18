export function createUploadsRenderer(deps) {
  const {
    icons,
    escapeHtml,
  } = deps;

  function statusLabel(item) {
    if (item.status === 'success') return '已完成';
    if (item.status === 'error') return item.error || '上传失败';
    if (item.status === 'uploading') return `${item.progress || 0}%`;
    return '排队中';
  }

  function renderUploadsPanel(state) {
    const items = state.uploads.items;
    if (!items.length) return '';

    const active = items.filter(i => i.status === 'pending' || i.status === 'uploading').length;
    const done = items.filter(i => i.status === 'success').length;
    const failed = items.filter(i => i.status === 'error').length;

    const title = active
      ? `正在上传 ${active} 个文件`
      : failed
        ? `上传完成：成功 ${done} 个，失败 ${failed} 个`
        : `上传完成：${done} 个文件`;

    return `
      <div class="upload-panel glass-card">
        <div class="upload-panel-head">
          <span class="upload-panel-title">${escapeHtml(title)}</span>
          <div class="upload-panel-tools">
            ${active ? '' : `<button class="upload-panel-btn" data-action="clear-finished-uploads" type="button">清除已完成</button>`}
            <button class="upload-panel-close" data-action="dismiss-uploads" type="button" aria-label="关闭上传面板">×</button>
          </div>
        </div>
        <div class="upload-panel-body">
          ${items.map(item => `
            <div class="upload-row" data-status="${escapeHtml(item.status)}">
              <div class="upload-row-icon">${item.status === 'error' ? icons.lock : item.status === 'success' ? icons.check : icons.file}</div>
              <div class="upload-row-main">
                <div class="upload-row-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                <div class="upload-row-track">
                  <div class="upload-row-bar" style="width:${item.status === 'success' ? 100 : item.progress || 0}%"></div>
                </div>
              </div>
              <div class="upload-row-status">${escapeHtml(statusLabel(item))}</div>
              ${item.status === 'error' || item.status === 'success'
                ? `<button class="upload-row-remove" data-action="dismiss-upload" data-key="${escapeHtml(item.id)}" type="button" aria-label="移除">×</button>`
                : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  return {
    renderUploadsPanel,
  };
}
