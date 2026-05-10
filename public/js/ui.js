import { state } from './state.js';
import { api } from './api.js';
import { escapeHtml, Utils } from './utils.js';
import { getOrderedEntries } from './file-view-model.js';

const typeFilters = {
  all: () => true,
  folder: item => !item.sizeFormatted,
  file: item => Boolean(item.sizeFormatted),
  image: item => Utils.getFileKind(item.name) === 'image',
  video: item => Utils.getFileKind(item.name) === 'video',
  audio: item => Utils.getFileKind(item.name) === 'audio',
  text: item => Utils.getFileKind(item.name) === 'text',
  pdf: item => Utils.getFileKind(item.name) === 'pdf',
  archive: item => Utils.getFileKind(item.name) === 'archive',
};

function parseSizeInput(value) {
  if (value === '' || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num * 1024 : null;
}

function matchesFilters(item) {
  const f = state.filters || {};
  const kind = f.kind || 'all';
  if (typeFilters[kind] && !typeFilters[kind](item)) return false;

  const size = item.rawSize || 0;
  const minSize = parseSizeInput(f.minSize);
  const maxSize = parseSizeInput(f.maxSize);
  if (minSize != null && size < minSize) return false;
  if (maxSize != null && size > maxSize) return false;

  const time = item.time || 0;
  if (f.modifiedAfter) {
    const after = new Date(`${f.modifiedAfter}T00:00:00`).getTime();
    if (time < after) return false;
  }
  if (f.modifiedBefore) {
    const before = new Date(`${f.modifiedBefore}T23:59:59`).getTime();
    if (time > before) return false;
  }

  return true;
}

function describeItem(item) {
  const kind = !item.sizeFormatted ? '文件夹' : {
    image: '图片',
    video: '视频',
    audio: '音频',
    text: '文本',
    pdf: 'PDF',
    archive: '压缩包',
  }[Utils.getFileKind(item.name)] || '文件';
  return {
    ...item,
    kind,
  };
}

export const Message = {
  show(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `toast-anim px-5 py-2.5 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 pointer-events-auto ${type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-primary'} text-white my-1`;
    div.innerHTML = `<span>${type === 'success' ? '&#10003;' : '&#9888;&#65039;'}</span> ${escapeHtml(msg)}`;
    container.appendChild(div);
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transition = '0.3s';
      setTimeout(() => div.remove(), 300);
    }, 3000);
  },
  success(msg) {
    this.show(msg, 'success');
  },
  error(msg) {
    this.show(msg, 'error');
  },
};

export const UI = {
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
    this.closeModal('previewModal');
  },

  closeUploadManager() {
    const el = document.getElementById('uploadManager');
    if (el) el.classList.add('hidden');
  },

  openDrawer(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('translate-x-full');
    el.classList.add('translate-x-0');
  },

  closeDrawer(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('translate-x-full');
    el.classList.remove('translate-x-0');
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
    title.textContent = meta.name;
    empty.classList.add('hidden');
    body.innerHTML = `
      <div class="space-y-3 text-sm">
        <div class="detail-row"><span>类型</span><strong>${escapeHtml(meta.kind)}</strong></div>
        <div class="detail-row"><span>路径</span><strong class="break-all">${escapeHtml(meta.path)}</strong></div>
        <div class="detail-row"><span>原始键</span><strong class="break-all">${escapeHtml(meta.fullKey)}</strong></div>
        <div class="detail-row"><span>大小</span><strong>${escapeHtml(meta.sizeFormatted || '文件夹')}</strong></div>
        <div class="detail-row"><span>时间</span><strong>${escapeHtml(Utils.formatDate(meta.time))}</strong></div>
        <div class="detail-row"><span>可预览</span><strong>${meta.sizeFormatted && Utils.isPreviewable(meta.name) ? '是' : '否'}</strong></div>
      </div>
      <div class="mt-5 flex flex-wrap gap-2">
        ${!meta.sizeFormatted ? `<button class="btn btn-primary" onclick="Actions.navigateTo(${escapeHtml(JSON.stringify(meta.path))})">打开文件夹</button>` : ''}
        ${meta.sizeFormatted && Utils.isPreviewable(meta.name) ? `<button class="btn btn-primary" onclick="Actions.openPreview(${escapeHtml(JSON.stringify([meta.path, meta.name]))})">预览</button>` : ''}
        ${meta.sizeFormatted ? `<button class="btn" onclick="Actions.downloadFile(${escapeHtml(JSON.stringify(meta.path))})">下载</button>` : ''}
        <button class="btn" onclick="Actions.copyPath(${escapeHtml(JSON.stringify(meta.path))})">复制路径</button>
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
    if (count) count.textContent = String(rows.length);
    if (page) page.textContent = String(state.trash.currentPage || 1);
    if (total) total.textContent = String(state.trash.totalPages || 1);
    tbody.innerHTML = rows.map(item => `
      <tr class="hover:bg-slate-800/30 transition-colors">
        <td class="px-4 py-3 font-mono text-slate-300">${escapeHtml(item.kind)}</td>
        <td class="px-4 py-3 text-white break-all">${escapeHtml(item.original_key)}</td>
        <td class="px-4 py-3 text-slate-500 font-mono">${escapeHtml(Utils.formatDate(item.trashed_at))}</td>
        <td class="px-4 py-3 text-slate-400 font-mono">${escapeHtml(item.size ? `${(item.size / 1024).toFixed(1)} KB` : '0 KB')}</td>
        <td class="px-4 py-3">
          <div class="flex justify-end gap-2">
            <button class="btn btn-primary h-8 px-3 text-xs" onclick="Actions.restoreTrash(${escapeHtml(JSON.stringify(item.id))})">恢复</button>
            <button class="btn btn-danger-soft h-8 px-3 text-xs" onclick="Actions.purgeTrash(${escapeHtml(JSON.stringify(item.id))})">彻底删除</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  updateAuth() {
    const box = document.getElementById('authButtons');
    if (!box) return;

    if (state.userRole === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'inline-flex';
        if (el.id === 'pasteGroup' && !state.clipboard) el.style.display = 'none';
      });
      box.innerHTML = `<a href="/admin.html" class="btn text-white font-bold">管理</a><button onclick="Actions.logout()" class="btn ml-2 text-white opacity-60">退出</button>`;
    } else {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = 'none';
      });
      box.innerHTML = `<button class="btn btn-primary font-bold" onclick="UI.showModal('loginModal')">登录</button>`;
    }
  },

  renderBreadcrumb() {
    if (state.isSearching) return;
    const box = document.getElementById('breadcrumb');
    if (!box) return;

    const parts = state.currentPath.split('/').filter(Boolean);
    let html = `<button class="breadcrumb-root" onclick="Actions.navigateTo('/')">全部文件</button>`;

    if (parts.length > 2) {
      html += `<span class="opacity-20 mx-1 text-white">/</span><span class="opacity-40 text-white">...</span>`;
      parts.slice(-2).forEach((part, index) => {
        const path = '/' + parts.slice(0, parts.length - 2 + index + 1).join('/') + '/';
        html += `<span class="opacity-20 mx-1 text-white">/</span><button class="hover:text-primary text-white truncate max-w-[120px]" onclick="Actions.navigateTo(${escapeHtml(JSON.stringify(path))})">${escapeHtml(part)}</button>`;
      });
    } else {
      let acc = '';
      parts.forEach(part => {
        acc += '/' + part;
        html += `<span class="opacity-20 mx-1 text-white">/</span><button class="hover:text-primary text-white" onclick="Actions.navigateTo(${escapeHtml(JSON.stringify(acc + '/'))})">${escapeHtml(part)}</button>`;
      });
    }

    box.innerHTML = html;
  },

  updateFileList() {
    const list = document.getElementById('fileList');
    if (!list) return;
    const viewBtn = document.getElementById('viewBtn');
    const sortBtn = document.getElementById('sortBtn');
    if (viewBtn) viewBtn.textContent = state.viewMode === 'grid' ? '网格' : '列表';
    if (sortBtn) sortBtn.textContent = state.sortNames[state.sortBy] || '名称';
    list.innerHTML = '';

    if (state.viewMode === 'list') {
      const header = document.createElement('div');
      header.className = 'list-header grid-row-layout hidden md:grid text-white';
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
        div.innerHTML = `<div class="file-icon opacity-30 text-slate-500 text-4xl mb-3">📁</div><div class="file-name text-white">..</div><div class="file-size text-slate-500">返回上级</div><div class="file-actions"></div>`;
      } else {
        div.className = 'grid-row-layout h-[52px] hover:bg-slate-800/40 border-b border-white/5 cursor-pointer text-slate-500';
        div.innerHTML = `<div class="col-name"><span class="opacity-50 text-xl text-white">📁</span><span class="text-sm font-medium text-slate-400">返回上级 (..)</span></div><div></div><div></div><div></div>`;
      }
      div.ondblclick = () => Actions.navigateTo(parent);
      container.appendChild(div);
    }

    const visibleEntries = getOrderedEntries(state.fileData, state.sortBy).filter(matchesFilters);
    state.visibleKeys = visibleEntries.map(item => item.fullKey);
    visibleEntries.forEach(item => {
      const isFolder = !item.sizeFormatted;
      const isSelected = state.selectedPaths.includes(item.fullKey);
      const el = document.createElement('div');
      el.dataset.key = item.fullKey;
      const previewArgs = escapeHtml(JSON.stringify([item.path, item.name]));
      const downloadArg = escapeHtml(JSON.stringify(item.path));
      const detailArg = escapeHtml(JSON.stringify({
        name: item.name,
        path: item.path,
        fullKey: item.fullKey,
        sizeFormatted: item.sizeFormatted,
        rawSize: item.rawSize,
        time: item.time,
      }));
      const safeName = escapeHtml(item.name);
      const safeSize = escapeHtml(isFolder ? '文件夹' : item.sizeFormatted);
      const safeIcon = escapeHtml(isFolder ? '📁' : Utils.getFileIcon(item.name));
      const thumbUrl = !isFolder && Utils.isImageFile(item.name) ? escapeHtml(api.thumbnailUrl(item.path)) : '';
      const visual = thumbUrl
        ? `<div class="file-thumb-wrap"><img class="file-thumb" src="${thumbUrl}" alt="" loading="lazy" decoding="async" onerror="this.closest('.file-thumb-wrap').outerHTML='<div class=&quot;file-icon select-none&quot;>${safeIcon}</div>'"></div>`
        : `<div class="file-icon select-none">${safeIcon}</div>`;

      if (state.viewMode === 'grid') {
        el.className = `grid-item ${isSelected ? 'selected' : ''}`;
        el.innerHTML = `${visual}<div class="file-name text-white">${safeName}</div><div class="file-size text-slate-500">${safeSize}</div><div class="file-actions">${!isFolder ? `<button class="file-action-btn" onclick="event.stopPropagation();Actions.openPreview(${previewArgs})">预览</button><button class="file-action-btn" onclick="event.stopPropagation();Actions.downloadFile(${downloadArg})">下载</button>` : ''}<button class="file-action-btn" onclick="event.stopPropagation();Actions.openDetails(${detailArg})">详情</button></div>`;
      } else {
        el.className = `grid-row-layout file-item-row ${isSelected ? 'selected' : ''}`;
        el.innerHTML = `<div class="col-name text-white"><span class="text-xl flex-shrink-0 select-none">${safeIcon}</span><span class="text-sm truncate file-name text-slate-200">${safeName}</span></div><div class="col-size hidden md:block text-slate-400 font-mono text-center">${safeSize}</div><div class="col-time hidden md:block text-slate-500 font-mono text-center">${escapeHtml(Utils.formatDate(item.time))}</div><div class="col-acts text-white"><div class="file-actions">${!isFolder ? `<button class="file-action-btn" onclick="event.stopPropagation();Actions.openPreview(${previewArgs})">预览</button><button class="file-action-btn" onclick="event.stopPropagation();Actions.downloadFile(${downloadArg})">下载</button>` : ''}<button class="file-action-btn" onclick="event.stopPropagation();Actions.openDetails(${detailArg})">详情</button></div></div>`;
        if (state.userRole === 'admin') {
          const nameEl = el.querySelector('.file-name');
          nameEl.ondblclick = e => {
            e.stopPropagation();
            Actions.startInlineRename(item, nameEl);
          };
        }
      }

      el.onclick = e => {
        if (state.userRole === 'admin') Actions.toggleSelect(item.fullKey, el, e);
      };
      el.ondblclick = () => {
        if (isFolder) Actions.navigateTo(item.path);
        else if (Utils.isPreviewable(item.name)) Actions.openPreview(item.path, item.name);
      };
      container.appendChild(el);
    });

    list.appendChild(container);
  },

  updateBatchUI() {
    const bt = document.getElementById('batchTools');
    const pg = document.getElementById('pasteGroup');
    const ren = document.getElementById('singleRenameBtn');
    const clr = document.getElementById('clearSelectionBtn');
    const count = document.getElementById('selectedCount');
    if (!bt || !pg) return;

    const hasSelection = state.userRole === 'admin' && state.selectedPaths.length > 0;
    bt.style.display = hasSelection ? 'flex' : 'none';
    if (clr) clr.classList.toggle('hidden', !hasSelection);
    if (count) count.textContent = String(state.selectedPaths.length || 0);
    const hasClipboard = state.userRole === 'admin' && state.clipboard;
    pg.classList.toggle('hidden', !hasClipboard);
    pg.style.display = hasClipboard ? 'flex' : 'none';
    if (ren) ren.classList.toggle('hidden', state.selectedPaths.length !== 1);
    const pb = document.getElementById('pasteBtn');
    if (state.clipboard && pb) pb.textContent = `粘贴 (${state.clipboard.paths.length})`;
  },
};
