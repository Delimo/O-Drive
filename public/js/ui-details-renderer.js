import { state } from './state.js';
import { escapeHtml, Utils } from './utils.js';
import { actionArgs, clearElement } from './dom-helpers.js';
import { describeItem } from './filters.js';

export function renderDetailsPanel(ui, item) {
  const panel = document.getElementById('detailsPanel');
  const body = document.getElementById('detailsBody');
  const title = document.getElementById('detailsTitle');
  const empty = document.getElementById('detailsEmpty');
  if (!panel || !body || !title || !empty) return;

  if (!item) {
    title.textContent = '文件详情';
    clearElement(body);
    empty.classList.remove('hidden');
    ui.closeDrawer('detailsPanel');
    return;
  }

  const meta = describeItem(item);
  const adminDirectLinkButton = state.userRole === 'admin' && meta.sizeFormatted
    ? `<button class="btn" data-action="copy-direct-link" data-args='${actionArgs([meta.path])}'>复制直链</button>`
    : '';
  const adminShareButton = state.userRole === 'admin' && meta.sizeFormatted
    ? `<button class="btn" data-action="create-share" data-args='${actionArgs([meta.path])}'>创建分享</button>`
    : '';
  title.textContent = meta.name;
  empty.classList.add('hidden');
  body.innerHTML = `
    <div class="details-actions">
      ${!meta.sizeFormatted ? `<button class="btn btn-primary" data-action="navigate" data-args='${actionArgs([meta.path])}'>打开文件夹</button>` : ''}
      ${meta.sizeFormatted && Utils.isPreviewable(meta.name) ? `<button class="btn btn-primary" data-action="open-preview" data-args='${actionArgs([meta.path, meta.name, meta.protected ? true : false])}'>预览</button>` : ''}
      ${meta.sizeFormatted ? `<button class="btn" data-action="download-file" data-args='${actionArgs([meta.path])}'>下载</button>` : ''}
      ${adminDirectLinkButton}
      ${adminShareButton}
    </div>
    <div class="space-y-3 text-sm">
      <div class="detail-row"><span>类型</span><strong>${escapeHtml(meta.kind)}</strong></div>
      <div class="detail-row"><span>路径</span><strong class="break-all">${escapeHtml(meta.path)}</strong></div>
      <div class="detail-row"><span>大小</span><strong>${escapeHtml(meta.sizeFormatted || '文件夹')}</strong></div>
      <div class="detail-row"><span>时间</span><strong>${escapeHtml(Utils.formatDate(meta.time))}</strong></div>
      <div class="detail-row"><span>可预览</span><strong>${meta.sizeFormatted && Utils.isPreviewable(meta.name) ? '是' : '否'}</strong></div>
      <div class="detail-row"><span>访问密码</span><strong>${meta.protected ? '需要' : '不需要'}</strong></div>
    </div>
  `;
  ui.openDrawer('detailsPanel');
}
