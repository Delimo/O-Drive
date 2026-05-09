import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { sanitizeHtml, escapeHtml } from './utils.js';

export const Actions = {
  async init() {
    const { res, data } = await api.getRole();
    state.userRole = res.status === 200 ? data.role : 'guest';
    UI.updateAuth();
    await this.loadFiles();

    const startYear = 2026;
    const currentYear = new Date().getFullYear();
    const yearDisp = document.getElementById('year-display');
    if (yearDisp) yearDisp.textContent = currentYear > startYear ? `${startYear} - ${currentYear}` : String(startYear);
  },

  async loadFiles() {
    if (state.isSearching) return;
    state.selectedPaths = [];
    UI.updateBatchUI();

    const { res, data } = await api.listFiles(state.currentPath);
    if (!res.ok) return;
    state.fileData = data;
    UI.updateFileList();
    UI.renderBreadcrumb();
  },

  async doLogin() {
    const { data } = await api.login(document.getElementById('adminUser').value, document.getElementById('adminPass').value);
    if (data?.success) window.location.reload();
    else document.getElementById('loginError').textContent = '登录失败';
  },

  async logout() {
    await api.logout();
    window.location.reload();
  },

  navigateTo(p) {
    state.currentPath = p.endsWith('/') ? p : `${p}/`;
    state.isSearching = false;
    this.loadFiles();
  },

  toggleSelect(key, el, e) {
    e.stopPropagation();
    state.selectedPaths = state.selectedPaths.includes(key) ? state.selectedPaths.filter(p => p !== key) : [...state.selectedPaths, key];
    UI.updateBatchUI();
    UI.updateFileList();
  },

  toggleSelectAll() {
    const allKeys = [...state.fileData.folders, ...state.fileData.files]
      .filter(i => i.name !== '' && i.name !== '.folder')
      .map(i => i.fullKey);
    state.selectedPaths = state.selectedPaths.length === allKeys.length ? [] : allKeys;
    UI.updateFileList();
    UI.updateBatchUI();
  },

  setClipboard(action) {
    if (state.selectedPaths.length === 0) return;
    state.clipboard = { action, paths: [...state.selectedPaths] };
    state.selectedPaths = [];
    UI.updateBatchUI();
    UI.updateFileList();
    Message.success(`已加入${action === 'move' ? '移动' : '复制'}列表`);
  },

  clearClipboard() {
    if (!state.clipboard) return;
    state.clipboard = null;
    UI.updateBatchUI();
    this.loadFiles();
    Message.show('操作已取消');
  },

  async executePaste() {
    if (!state.clipboard) return;
    Message.show('正在处理...');
    const { res } = await api.paste({ ...state.clipboard, targetDir: state.currentPath });
    if (res.ok) {
      Message.success('成功');
      state.clipboard = null;
      this.loadFiles();
    } else {
      Message.error('失败');
    }
  },

  async batchDelete() {
    if (!confirm(`确认删除选中的 ${state.selectedPaths.length} 项吗？`)) return;
    const { res } = await api.batchDelete(state.selectedPaths);
    if (res.ok) {
      Message.success('已删除');
      this.loadFiles();
    } else {
      Message.error('失败');
    }
  },

  async handleSearch() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return this.clearSearch();
    state.isSearching = true;

    const { res, data } = await api.searchFiles(q, state.currentPath);
    if (!res.ok) return;
    state.fileData = { folders: [], files: data?.files || [] };
    UI.updateFileList();
    document.getElementById('breadcrumb').innerHTML = `<span class="text-white font-bold tracking-wide">搜索结果: ${escapeHtml(q)}</span>`;
  },

  clearSearch() {
    state.isSearching = false;
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    this.loadFiles();
  },

  startRenameSelected() {
    const key = state.selectedPaths[0];
    const item = [...state.fileData.folders, ...state.fileData.files].find(i => i.fullKey === key);
    const nameEl = Array.from(document.querySelectorAll('.file-name')).find(el => el.closest('[data-key]')?.dataset?.key === key);
    if (item && nameEl) this.startInlineRename(item, nameEl);
  },

  async startInlineRename(item, el) {
    const oldName = item.name;
    const input = document.createElement('input');
    input.className = 'rename-input relative z-50 text-white';
    input.value = oldName;
    ['mousedown', 'mouseup', 'click', 'dblclick'].forEach(evt => input.addEventListener(evt, e => e.stopPropagation()));
    el.replaceWith(input);
    input.focus();

    const save = async () => {
      const newName = input.value.trim();
      if (newName && newName !== oldName) {
        const { res } = await api.renameFile(item.fullKey, newName);
        if (res.ok) Message.success('已完成');
        else Message.error('失败');
      }
      this.loadFiles();
    };

    input.onblur = save;
    input.onkeypress = ev => {
      if (ev.key === 'Enter') input.blur();
    };
  },

  async submitMkdir() {
    const n = document.getElementById('folderNameInput').value.trim();
    if (!n) return;
    await api.mkdir(state.currentPath, n);
    document.getElementById('folderNameInput').value = '';
    UI.closeModal('mkdirModal');
    this.loadFiles();
    Message.success('已创建');
  },

  async openPreview(path, name) {
    state.currentPreviewPath = path;
    state.isEditing = false;
    const content = document.getElementById('previewContent');
    const title = document.getElementById('previewTitle');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    editBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');
    title.textContent = '加载中...';
    UI.showModal('previewModal');

    try {
      const res = await api.preview(path);
      const ext = name.split('.').pop().toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        content.innerHTML = `<img src="${escapeHtml(`/api/preview${path}`)}" class="media-content" id="previewImg">`;
        const img = document.getElementById('previewImg');
        img.ondblclick = () => {
          if (!document.fullscreenElement) img.requestFullscreen();
          else document.exitFullscreen();
        };
      } else if (['mp4', 'webm'].includes(ext)) {
        content.innerHTML = `<video src="${escapeHtml(`/api/preview${path}`)}" class="media-content" controls autoplay></video>`;
      } else if (['mp3', 'wav'].includes(ext)) {
        content.innerHTML = `<div class="flex items-center justify-center h-full p-20 text-white"><audio src="${escapeHtml(`/api/preview${path}`)}" controls autoplay class="w-full max-w-xl"></audio></div>`;
      } else if (ext === 'pdf') {
        content.innerHTML = `<iframe src="${escapeHtml(`/api/preview${path}`)}" class="w-full h-full border-none"></iframe>`;
      } else {
        const text = await res.text();
        if (state.userRole === 'admin') editBtn.classList.remove('hidden');
        if (ext === 'md') content.innerHTML = `<div class="markdown-body p-8 md:p-12 text-left text-slate-200 font-sans">${sanitizeHtml(marked.parse(text))}</div>`;
        else content.innerHTML = `<pre id="textContent" class="p-8 md:p-12 font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-300 text-left">${escapeHtml(text)}</pre>`;
      }
      title.textContent = name;
    } catch (e) {
      content.innerHTML = `<div class="p-12 text-red-500 text-center">无法预览内容</div>`;
    }
  },

  toggleEditMode() {
    const pre = document.getElementById('textContent') || document.querySelector('.markdown-body');
    if (!pre) return;
    const textarea = document.createElement('textarea');
    textarea.className = 'w-full h-full bg-[#020617] text-slate-300 p-8 font-mono text-sm outline-none resize-none';
    textarea.id = 'editArea';
    textarea.value = pre.innerText || pre.textContent;
    document.getElementById('previewContent').innerHTML = '';
    document.getElementById('previewContent').appendChild(textarea);
    document.getElementById('editBtn').classList.add('hidden');
    document.getElementById('saveBtn').classList.remove('hidden');
  },

  async saveTextContent() {
    const { res } = await api.saveText(state.currentPreviewPath, document.getElementById('editArea').value);
    if (res.ok) {
      Message.success('已保存');
      UI.closePreview();
      this.loadFiles();
    } else {
      Message.error('失败');
    }
  },

  toggleViewMode() {
    state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    localStorage.setItem('viewMode', state.viewMode);
    UI.updateFileList();
  },

  toggleSortMode() {
    const idx = state.sortModes.indexOf(state.sortBy);
    state.sortBy = state.sortModes[(idx + 1) % state.sortModes.length];
    localStorage.setItem('sortBy', state.sortBy);
    UI.updateFileList();
  },

  downloadFile(p) {
    window.open(api.download(p), '_blank', 'noopener');
  },

  async uploadFiles(files) {
    if (state.userRole !== 'admin') return;
    const manager = document.getElementById('uploadManager');
    const list = document.getElementById('uploadList');
    manager.classList.replace('hidden', 'flex');

    for (const f of files) {
      state.activeUploads++;
      const item = document.createElement('div');
      item.className = 'p-4 border-b border-border bg-slate-900/20';
      item.innerHTML = `<div class="flex justify-between text-[11px] mb-2 truncate text-slate-300"><span class="font-bold text-white">${escapeHtml(f.name)}</span><span class="pct text-primary font-mono">0%</span></div><div class="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="progress-fill h-full bg-primary w-0 transition-all duration-300"></div></div>`;
      list.prepend(item);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files/' + state.currentPath.replace(/^\/|\/$/g, ''), true);
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          item.querySelector('.progress-fill').style.width = `${pct}%`;
          item.querySelector('.pct').textContent = `${pct}%`;
        }
      };
      xhr.onload = () => {
        if (xhr.status === 200) {
          item.querySelector('.pct').textContent = '完成';
          item.querySelector('.progress-fill').className = 'h-full bg-emerald-500 w-full';
          this.loadFiles();
        } else {
          item.querySelector('.pct').textContent = '失败';
        }
        state.activeUploads--;
        if (state.activeUploads === 0) setTimeout(() => manager.classList.replace('flex', 'hidden'), 3000);
      };

      const fd = new FormData();
      fd.append('file', f);
      xhr.send(fd);
    }
  },
};
