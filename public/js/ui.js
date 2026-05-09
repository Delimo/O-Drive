import { state } from './state.js';
import { escapeHtml, Utils } from './utils.js';

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

    const folders = [...(state.fileData.folders || [])].filter(f => f.name && f.name.trim() !== '').sort((a, b) => a.name.localeCompare(b.name));
    const files = [...(state.fileData.files || [])].filter(f => f.name && f.name.trim() !== '').sort((a, b) => state.sortBy === 'time' ? (b.time - a.time) : state.sortBy === 'size' ? (b.rawSize - a.rawSize) : a.name.localeCompare(b.name));

    [...folders, ...files].forEach(item => {
      const isFolder = !item.sizeFormatted;
      const isSelected = state.selectedPaths.includes(item.fullKey);
      const el = document.createElement('div');
      el.dataset.key = item.fullKey;
      const previewArgs = escapeHtml(JSON.stringify([item.path, item.name]));
      const downloadArg = escapeHtml(JSON.stringify(item.path));
      const safeName = escapeHtml(item.name);
      const safeSize = escapeHtml(isFolder ? '文件夹' : item.sizeFormatted);

      if (state.viewMode === 'grid') {
        el.className = `grid-item ${isSelected ? 'selected' : ''}`;
        el.innerHTML = `<div class="file-icon select-none">${isFolder ? '📁' : Utils.getFileIcon(item.name)}</div><div class="file-name text-white">${safeName}</div><div class="file-size text-slate-500">${safeSize}</div><div class="file-actions">${!isFolder ? `<button class="file-action-btn" onclick="event.stopPropagation();Actions.openPreview(${previewArgs})">预览</button><button class="file-action-btn" onclick="event.stopPropagation();Actions.downloadFile(${downloadArg})">下载</button>` : ''}</div>`;
      } else {
        el.className = `grid-row-layout file-item-row ${isSelected ? 'selected' : ''}`;
        el.innerHTML = `<div class="col-name text-white"><span class="text-xl flex-shrink-0 select-none">${isFolder ? '📁' : Utils.getFileIcon(item.name)}</span><span class="text-sm truncate file-name text-slate-200">${safeName}</span></div><div class="col-size hidden md:block text-slate-400 font-mono text-center">${safeSize}</div><div class="col-time hidden md:block text-slate-500 font-mono text-center">${escapeHtml(Utils.formatDate(item.time))}</div><div class="col-acts text-white">${!isFolder ? `<div class="file-actions"><button class="file-action-btn" onclick="event.stopPropagation();Actions.openPreview(${previewArgs})">预览</button><button class="file-action-btn" onclick="event.stopPropagation();Actions.downloadFile(${downloadArg})">下载</button></div>` : ''}</div>`;
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
    if (!bt || !pg) return;

    const hasSelection = state.userRole === 'admin' && state.selectedPaths.length > 0;
    bt.style.display = hasSelection ? 'flex' : 'none';
    const hasClipboard = state.userRole === 'admin' && state.clipboard;
    pg.classList.toggle('hidden', !hasClipboard);
    pg.style.display = hasClipboard ? 'flex' : 'none';
    if (ren) ren.classList.toggle('hidden', state.selectedPaths.length !== 1);
    const pb = document.getElementById('pasteBtn');
    if (state.clipboard && pb) pb.textContent = `粘贴 (${state.clipboard.paths.length})`;
  },
};
