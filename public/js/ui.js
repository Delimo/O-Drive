import { state } from './state.js';
import { api } from './api.js';
import { escapeHtml, Utils } from './utils.js';
import { getOrderedEntries } from './file-view-model.js';
import { describeItem, matchesFilters } from './filters.js';
import { Message } from './message.js';

export { Message };

export const UI = {
  renderAuthButtons() {
    const html = state.userRole === 'admin'
      ? `<a href="/admin.html" class="btn text-slate-900 font-bold">管理</a><button class="btn ml-2 text-slate-900 opacity-60" data-action="logout">退出</button>`
      : `<button class="btn btn-primary font-bold" data-action="show-modal" data-args='["loginModal"]'>登录</button>`;

    const desktop = document.getElementById('authButtons');
    if (desktop) desktop.innerHTML = html;

    const mobile = document.getElementById('authButtonsMobile');
    if (mobile) mobile.innerHTML = html;

    document.querySelectorAll('.admin-only').forEach(el => {
      el.hidden = state.userRole !== 'admin';
    });
  },

  showModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      el.classList.add('flex');
    }
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('flex');
      el.classList.add('hidden');
    }
  },

  closePreview() {
    const content = document.getElementById('previewContent');
    if (content) content.innerHTML = '';
    state.currentPreviewText = '';
    this.closeModal('previewModal');
  },

  closeUploadManager() {
    const el = document.getElementById('uploadManager');
    if (el) el.classList.add('hidden');
  },

  toggleMobileActions() {
    const sheet = document.getElementById('mobileActionSheet');
    const backdrop = document.getElementById('mobileActionBackdrop');
    const open = sheet?.classList.contains('is-open');
    sheet?.classList.toggle('is-open', !open);
    backdrop?.classList.toggle('is-open', !open);
  },

  closeMobileActions() {
    document.getElementById('mobileActionSheet')?.classList.remove('is-open');
    document.getElementById('mobileActionBackdrop')?.classList.remove('is-open');
  },

  toggleUploadMenu(wrap) {
    if (!wrap) return;
    const menu = wrap.querySelector('.upload-menu');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    this.closeUploadMenu();
    menu.classList.toggle('hidden', !willOpen);
  },

  closeUploadMenu() {
    document.querySelectorAll('.upload-menu').forEach(menu => {
      menu.classList.add('hidden');
    });
  },

  openDrawer(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('translate-x-full');
    el.classList.add('translate-x-0');
    if (id === 'detailsPanel') {
      const backdrop = document.getElementById('detailsBackdrop');
      if (backdrop) backdrop.classList.remove('hidden');
    }
  },

  closeDrawer(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('translate-x-full');
    el.classList.remove('translate-x-0');
    if (id === 'detailsPanel') {
      const backdrop = document.getElementById('detailsBackdrop');
      if (backdrop) backdrop.classList.add('hidden');
    }
  },

  renderDetailsPanel(item) {
    const panel = document.getElementById('detailsPanel');
    const body = document.getElementById('detailsBody');
    const title = document.getElementById('detailsTitle');
    const empty = document.getElementById('detailsEmpty');
    if (!panel || !body || !title || !empty) return;

    if (!item) {
      title.textContent = '文件详情';
      body.innerHTML = '';
      empty.classList.remove('hidden');
      this.closeDrawer('detailsPanel');
      return;
    }

    const meta = describeItem(item);
    const adminDirectLinkButton = state.userRole === 'admin' && meta.sizeFormatted
      ? `<button class="btn" data-action="copy-direct-link" data-args='${escapeHtml(JSON.stringify([meta.path]))}'>复制直链</button>`
      : '';
    title.textContent = meta.name;
    empty.classList.add('hidden');
    body.innerHTML = `
      <div class="details-actions">
        ${!meta.sizeFormatted ? `<button class="btn btn-primary" data-action="navigate" data-args='${escapeHtml(JSON.stringify([meta.path]))}'>打开文件夹</button>` : ''}
        ${meta.sizeFormatted && Utils.isPreviewable(meta.name) ? `<button class="btn btn-primary" data-action="open-preview" data-args='${escapeHtml(JSON.stringify([meta.path, meta.name, meta.protected ? true : false]))}'>预览</button>` : ''}
        ${meta.sizeFormatted ? `<button class="btn" data-action="download-file" data-args='${escapeHtml(JSON.stringify([meta.path]))}'>下载</button>` : ''}
        ${adminDirectLinkButton}
        <button class="btn" data-action="copy-path" data-args='${escapeHtml(JSON.stringify([meta.path]))}'>复制路径</button>
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
    this.openDrawer('detailsPanel');
  },

  renderTrashList() {
    const tbody = document.getElementById('trashTbody');
    const count = document.getElementById('trashCount');
    const page = document.getElementById('trashPage');
    const total = document.getElementById('trashTotal');
    if (!tbody) return;
    const rows = state.trash.items || [];
    if (count) count.textContent = String(state.trash.total ?? rows.length);
    if (page) page.textContent = String(state.trash.currentPage || 1);
    if (total) total.textContent = String(state.trash.totalPages || 1);
    tbody.innerHTML = rows.map(item => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3 font-mono text-slate-600">${escapeHtml(item.kind)}</td>
        <td class="px-4 py-3 text-slate-900 break-all">${escapeHtml(item.original_key)}</td>
        <td class="px-4 py-3 text-slate-500 font-mono">${escapeHtml(Utils.formatDate(item.trashed_at))}</td>
        <td class="px-4 py-3 text-slate-500 font-mono">${escapeHtml(item.size ? `${(item.size / 1024).toFixed(1)} KB` : '0 KB')}</td>
        <td class="px-4 py-3">
          <div class="flex justify-end gap-2">
            <button class="btn btn-primary h-8 px-3 text-xs" data-action="restore-trash" data-args='${escapeHtml(JSON.stringify([item.id]))}'>恢复</button>
            <button class="btn btn-danger-soft h-8 px-3 text-xs" data-action="purge-trash" data-args='${escapeHtml(JSON.stringify([item.id]))}'>彻底删除</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  updateAuth() {
    this.renderAuthButtons();
  },

  renderBreadcrumb() {
    if (state.isSearching) return;
    const parts = state.currentPath.split('/').filter(Boolean);
    let html = `<button class="breadcrumb-root" data-action="navigate" data-args='["/"]'>根目录</button>`;

    if (parts.length > 2) {
      html += `<span class="opacity-20 mx-1 text-slate-900">/</span><span class="opacity-40 text-slate-900">...</span>`;
      parts.slice(-2).forEach((part, index) => {
        const path = '/' + parts.slice(0, parts.length - 2 + index + 1).join('/') + '/';
        html += `<span class="opacity-20 mx-1 text-slate-900">/</span><button class="hover:text-primary text-slate-900 truncate max-w-[120px]" data-action="navigate" data-args='${escapeHtml(JSON.stringify([path]))}'>${escapeHtml(part)}</button>`;
      });
    } else {
      let acc = '';
      parts.forEach(part => {
        acc += '/' + part;
        html += `<span class="opacity-20 mx-1 text-slate-900">/</span><button class="hover:text-primary text-slate-900" data-action="navigate" data-args='${escapeHtml(JSON.stringify([acc + '/']))}'>${escapeHtml(part)}</button>`;
      });
    }

    const desktop = document.getElementById('breadcrumb');
    if (desktop) desktop.innerHTML = html;
    const mobile = document.getElementById('mobileBreadcrumb');
    if (mobile) mobile.innerHTML = html;
  },

  renderSearchBreadcrumb(query) {
    const html = `
      <button class="breadcrumb-root" data-action="navigate" data-args='["/"]'>根目录</button>
      <span class="opacity-20 mx-1 text-slate-900">/</span>
      <span class="search-breadcrumb-label">搜索结果: ${escapeHtml(query)}</span>
    `;
    const desktop = document.getElementById('breadcrumb');
    if (desktop) desktop.innerHTML = html;
    const mobile = document.getElementById('mobileBreadcrumb');
    if (mobile) mobile.innerHTML = html;
  },

  updateFileList() {
    const list = document.getElementById('fileList');
    if (!list) return;
    const viewBtn = document.getElementById('viewBtn');
    const sortBtn = document.getElementById('sortBtn');
    const mobileViewBtn = document.getElementById('mobileViewBtn');
    const mobileQuickViewBtn = document.getElementById('mobileQuickViewBtn');
    const mobileSortBtn = document.getElementById('mobileSortBtn');
    if (viewBtn) viewBtn.textContent = state.viewMode === 'grid' ? '网格' : '列表';
    if (sortBtn) sortBtn.textContent = state.sortNames[state.sortBy] || '名称';
    if (mobileViewBtn) mobileViewBtn.textContent = state.viewMode === 'grid' ? '网格' : '列表';
    if (mobileQuickViewBtn) mobileQuickViewBtn.textContent = state.viewMode === 'grid' ? '网格' : '列表';
    if (mobileSortBtn) mobileSortBtn.textContent = state.sortNames[state.sortBy] || '名称';
    list.innerHTML = '';

    if (state.viewMode === 'list') {
      const header = document.createElement('div');
      header.className = 'list-header grid-row-layout text-slate-900';
      header.innerHTML = `<div>名称</div><div class="text-center">大小</div><div class="text-center">修改时间</div><div class="text-center">操作</div>`;
      list.appendChild(header);
    }

    const container = document.createElement('div');
    container.className = state.viewMode === 'grid' ? 'grid-layout' : 'list-layout';

    if (state.currentPath !== '/' && !state.isSearching) {
      const parent = Utils.getParentPath(state.currentPath);
      const div = document.createElement('div');
      if (state.viewMode === 'grid') {
        div.className = 'grid-item';
        div.innerHTML = `<div class="file-icon opacity-40 text-slate-500 mb-3">${Utils.getParentIcon()}</div><div class="file-name text-slate-900">..</div><div class="file-size text-slate-500">返回上级</div><div class="file-actions"></div>`;
      } else {
        div.className = 'grid-row-layout file-item-row parent-row h-[52px] hover:bg-slate-50 border-b border-border cursor-pointer text-slate-500';
        div.innerHTML = `<div class="col-name text-slate-900"><span class="file-row-icon opacity-50 flex-shrink-0 select-none">${Utils.getParentIcon()}</span><span class="text-sm font-medium text-slate-500 whitespace-nowrap">返回上级 (..)</span></div><div class="col-size text-slate-500 font-mono text-center">-</div><div class="col-time text-slate-500 font-mono text-center">-</div><div class="col-acts"></div>`;
      }
      div.onclick = () => Actions.navigateTo(parent);
      container.appendChild(div);
    }

    const visibleEntries = getOrderedEntries(state.fileData, state.sortBy).filter(item => matchesFilters(item, state.filters));
    state.visibleKeys = visibleEntries.map(item => item.fullKey);
    visibleEntries.forEach(item => {
      const isFolder = !item.sizeFormatted;
      const isSelected = state.selectedPaths.includes(item.fullKey);
      const el = document.createElement('div');
      el.dataset.key = item.fullKey;
      const previewArgs = escapeHtml(JSON.stringify([item.path, item.name, Boolean(item.protected)]));
      const downloadArg = escapeHtml(JSON.stringify([item.path]));
      const detailArg = escapeHtml(JSON.stringify([{
        name: item.name,
        path: item.path,
        fullKey: item.fullKey,
        sizeFormatted: item.sizeFormatted,
        rawSize: item.rawSize,
        time: item.time,
        protected: Boolean(item.protected),
      }]));
      const safeName = escapeHtml(item.name);
      const protectedBadge = item.protected ? '<span class="protected-badge">受保护</span>' : '';
      const safeSize = escapeHtml(isFolder ? '文件夹' : item.sizeFormatted);
      const safeIcon = isFolder ? Utils.getFolderIcon() : Utils.getFileIcon(item.name);
      const thumbUrl = !isFolder && Utils.isImageFile(item.name) ? escapeHtml(api.thumbnailUrl(item.path)) : '';
      const selectControl = state.userRole === 'admin'
        ? `<button class="file-select-btn ${isSelected ? 'is-selected' : ''}" aria-label="${isSelected ? '取消选择' : '选择'} ${safeName}" data-action="toggle-select" data-args='${escapeHtml(JSON.stringify([item.fullKey]))}'>${isSelected ? '✓' : ''}</button>`
        : '';
      const visual = thumbUrl
        ? `<div class="file-thumb-wrap"><img class="file-thumb" src="${thumbUrl}" alt="" loading="lazy" decoding="async"></div>`
        : `<div class="file-icon select-none">${safeIcon}</div>`;

      if (state.viewMode === 'grid') {
        el.className = `grid-item ${isSelected ? 'selected' : ''}`;
        el.innerHTML = `${selectControl}${visual}<div class="file-name text-slate-900">${safeName}</div>${protectedBadge}<div class="file-size text-slate-500">${safeSize}</div><div class="file-actions">${!isFolder ? `<button class="file-action-btn" data-action="open-preview" data-args='${previewArgs}'>预览</button><button class="file-action-btn" data-action="download-file" data-args='${downloadArg}'>下载</button>` : ''}<button class="file-action-btn" data-action="open-details" data-args='${detailArg}'>详情</button></div>`;
      } else {
        el.className = `grid-row-layout file-item-row ${isSelected ? 'selected' : ''}`;
        el.innerHTML = `<div class="col-name text-slate-900">${selectControl}<span class="text-xl flex-shrink-0 select-none">${safeIcon}</span><span class="text-sm truncate file-name text-slate-700">${safeName}</span>${protectedBadge}</div><div class="col-size text-slate-500 font-mono text-center">${safeSize}</div><div class="col-time text-slate-500 font-mono text-center">${escapeHtml(Utils.formatDate(item.time))}</div><div class="col-acts text-slate-900"><div class="file-actions">${!isFolder ? `<button class="file-action-btn" data-action="open-preview" data-args='${previewArgs}'>预览</button><button class="file-action-btn" data-action="download-file" data-args='${downloadArg}'>下载</button>` : ''}<button class="file-action-btn" data-action="open-details" data-args='${detailArg}'>详情</button></div></div>`;
      }

      const thumb = el.querySelector('.file-thumb');
      if (thumb) {
        thumb.addEventListener('error', () => {
          const wrap = thumb.closest('.file-thumb-wrap');
          if (wrap) wrap.outerHTML = `<div class="file-icon select-none">${safeIcon}</div>`;
        });
      }

      el.addEventListener('click', event => {
        if (event.target.closest('[data-action]')) return;
        if (el.dataset.suppressClick === '1') {
          delete el.dataset.suppressClick;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (isFolder) {
          if (item.protected && state.userRole !== 'admin') {
            Actions.handlePasswordRequired({ path: item.path }, () => Actions.navigateTo(item.path));
            return;
          }
          Actions.navigateTo(item.path);
          return;
        }
        if (Utils.isPreviewable(item.name)) Actions.openPreview(item.path, item.name, Boolean(item.protected));
      });
      if (state.userRole === 'admin') {
        let longPressTimer = null;
        let longPressFired = false;
        el.addEventListener('touchstart', event => {
          if (event.target.closest('[data-action]')) return;
          longPressFired = false;
          longPressTimer = setTimeout(() => {
            longPressFired = true;
            el.dataset.suppressClick = '1';
            Actions.toggleSelect(item.fullKey, el, event);
          }, 450);
        }, { passive: true });
        ['touchend', 'touchcancel', 'touchmove'].forEach(type => {
          el.addEventListener(type, event => {
            clearTimeout(longPressTimer);
            if (longPressFired) {
              event.preventDefault();
              event.stopPropagation();
            }
          });
        });
      }
      container.appendChild(el);
    });

    list.appendChild(container);
    if (state.isSearching && state.search?.nextCursor) {
      const more = document.createElement('div');
      more.className = 'flex justify-center py-4';
      more.innerHTML = `<button class="btn btn-primary" data-action="load-more-search" ${state.search.loadingMore ? 'disabled' : ''}>${state.search.loadingMore ? '加载中...' : '加载更多'}</button>`;
      list.appendChild(more);
    }
  },

  updateBatchUI() {
    const bt = document.getElementById('batchTools');
    const pg = document.getElementById('pasteGroup');
    const ren = document.getElementById('singleRenameBtn');
    const clr = document.getElementById('clearSelectionBtn');
    const count = document.getElementById('selectedCount');
    const mobileBatch = document.getElementById('mobileBatchGroup');
    const mobileClipboard = document.getElementById('mobileClipboardGroup');
    const mobileRename = document.getElementById('mobileRenameBtn');
    const mobilePaste = document.getElementById('mobilePasteBtn');
    const mobileSelectionBar = document.getElementById('mobileSelectionBar');
    const mobileSelectedCount = document.getElementById('mobileSelectedCount');
    if (!bt || !pg) return;

    const hasSelection = state.userRole === 'admin' && state.selectedPaths.length > 0;
    bt.classList.toggle('is-visible', hasSelection);
    bt.hidden = !hasSelection;
    if (clr) clr.classList.toggle('hidden', !hasSelection);
    if (count) count.textContent = String(state.selectedPaths.length || 0);
    if (mobileBatch) mobileBatch.classList.toggle('is-visible', hasSelection);
    if (mobileBatch) mobileBatch.hidden = !hasSelection;
    if (mobileSelectionBar) mobileSelectionBar.classList.toggle('is-visible', hasSelection);
    if (mobileSelectedCount) mobileSelectedCount.textContent = String(state.selectedPaths.length || 0);
    if (mobileRename) {
      mobileRename.classList.toggle('is-visible', state.selectedPaths.length === 1);
      mobileRename.hidden = state.selectedPaths.length !== 1 || state.userRole !== 'admin';
    }
    const hasClipboard = state.userRole === 'admin' && state.clipboard;
    pg.classList.toggle('hidden', !hasClipboard);
    pg.classList.toggle('is-visible', hasClipboard);
    pg.hidden = !hasClipboard;
    if (ren) ren.classList.toggle('hidden', state.selectedPaths.length !== 1);
    const pb = document.getElementById('pasteBtn');
    if (state.clipboard && pb) pb.textContent = `粘贴 (${state.clipboard.paths.length})`;
    if (mobileClipboard) {
      mobileClipboard.classList.toggle('is-visible', hasClipboard);
      mobileClipboard.hidden = !hasClipboard;
    }
    if (mobilePaste && state.clipboard) mobilePaste.textContent = `粘贴 (${state.clipboard.paths.length})`;
  },

  setItemSelected(key, selected) {
    const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (!el) return;
    el.classList.toggle('selected', selected);
    const btn = el.querySelector('.file-select-btn');
    if (btn) {
      btn.classList.toggle('is-selected', selected);
      btn.textContent = selected ? '✓' : '';
      const name = el.querySelector('.file-name')?.textContent || key;
      btn.setAttribute('aria-label', `${selected ? '取消选择' : '选择'} ${name}`);
    }
  },
};
