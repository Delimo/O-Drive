import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { sanitizeHtml, escapeHtml } from './utils.js';
import { getSelectableKeys } from './file-view-model.js';
import { UploadQueue } from './uploader.js';

const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const videoExts = ['mp4', 'webm'];
const audioExts = ['mp3', 'wav', 'ogg', 'flac'];
const textExts = ['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log', 'yml', 'yaml'];

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTextPreviewShell(text) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const shell = document.createElement('div');
  shell.className = 'preview-text-shell preview-text-viewer';
  shell.dataset.rawText = source;
  shell.innerHTML = `
    <div class="preview-text-toolbar">
      <label class="preview-text-search-wrap">
        <span>搜索</span>
        <input type="search" class="preview-text-search" placeholder="在文本中查找">
      </label>
      <div class="preview-text-toolbar-actions">
        <button type="button" class="btn preview-text-toggle">换行</button>
        <button type="button" class="btn preview-text-copy">复制</button>
      </div>
    </div>
    <div class="preview-text-body"></div>
  `;

  const body = shell.querySelector('.preview-text-body');
  const search = shell.querySelector('.preview-text-search');
  const toggle = shell.querySelector('.preview-text-toggle');
  const copy = shell.querySelector('.preview-text-copy');
  let wrap = true;

  const render = () => {
    const query = search.value.trim();
    const matcher = query ? new RegExp(escapeRegExp(query), 'gi') : null;
    body.classList.toggle('is-nowrap', !wrap);
    body.innerHTML = lines.map((line, index) => {
      let safe = escapeHtml(line);
      if (matcher) {
        safe = safe.replace(matcher, match => `<mark class="preview-hit">${escapeHtml(match)}</mark>`);
      }
      if (!safe) safe = '&nbsp;';
      return `
        <div class="preview-line">
          <span class="preview-line-no">${index + 1}</span>
          <span class="preview-line-text">${safe}</span>
        </div>
      `;
    }).join('');
  };

  search.addEventListener('input', render);
  toggle.addEventListener('click', () => {
    wrap = !wrap;
    toggle.textContent = wrap ? '换行' : '不换行';
    render();
  });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(source);
      Message.success('已复制文本内容');
    } catch (_) {
      Message.error('复制失败');
    }
  });

  render();
  return shell;
}

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
    state.detailsItem = null;
    UI.renderDetailsPanel(null);
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
    const allKeys = state.visibleKeys || getSelectableKeys(state.fileData);
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


  clearSelection() {
    state.selectedPaths = [];
    UI.updateBatchUI();
    UI.updateFileList();
  },

  openDetails(item) {
    if (!item) return;
    const data = typeof item === 'string'
      ? [...state.fileData.folders, ...state.fileData.files].find(i => i.fullKey === item)
      : item;
    if (!data) return;
    state.detailsItem = data;
    UI.renderDetailsPanel(data);
  },

  copyPath(path) {
    if (!path) return;
    navigator.clipboard?.writeText(path).then(() => Message.success('已复制路径')).catch(() => Message.error('复制失败'));
  },

  openFilters() {
    const f = state.filters || {};
    document.getElementById('filterKind').value = f.kind || 'all';
    document.getElementById('filterMinSize').value = f.minSize || '';
    document.getElementById('filterMaxSize').value = f.maxSize || '';
    document.getElementById('filterAfter').value = f.modifiedAfter || '';
    document.getElementById('filterBefore').value = f.modifiedBefore || '';
    UI.showModal('filterModal');
  },

  applyFilters() {
    state.filters = {
      kind: document.getElementById('filterKind').value,
      minSize: document.getElementById('filterMinSize').value.trim(),
      maxSize: document.getElementById('filterMaxSize').value.trim(),
      modifiedAfter: document.getElementById('filterAfter').value,
      modifiedBefore: document.getElementById('filterBefore').value,
    };
    UI.closeModal('filterModal');
    UI.updateFileList();
  },

  resetFilters() {
    state.filters = { kind: 'all', minSize: '', maxSize: '', modifiedAfter: '', modifiedBefore: '' };
    UI.closeModal('filterModal');
    UI.updateFileList();
  },

  async openTrash() {
    await this.loadTrash();
    UI.showModal('trashModal');
  },

  async loadTrash(page = state.trash.currentPage || 1) {
    const { res, data } = await api.trashList(page, 20);
    if (!res.ok) return;
    state.trash.items = data.items || [];
    state.trash.currentPage = data.currentPage || page;
    state.trash.totalPages = data.totalPages || 1;
    UI.renderTrashList();
  },

  async trashPage(delta) {
    const next = Math.min(Math.max(1, (state.trash.currentPage || 1) + delta), state.trash.totalPages || 1);
    if (next === state.trash.currentPage) return;
    await this.loadTrash(next);
  },

  async restoreTrash(id) {
    const { res } = await api.restoreTrash(id);
    if (res.ok) {
      Message.success('已恢复');
      await this.loadTrash();
      this.loadFiles();
    } else {
      Message.error('恢复失败');
    }
  },

  async purgeTrash(id) {
    if (!confirm('确定彻底删除这条回收站记录吗？')) return;
    const { res } = await api.deleteTrash(id);
    if (res.ok) {
      Message.success('已删除');
      await this.loadTrash();
      this.loadFiles();
    } else {
      Message.error('删除失败');
    }
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
    if (Array.isArray(path)) {
      [path, name] = path;
    } else if (path && typeof path === 'object') {
      name = path.name || path.fullName || name;
      path = path.path || path.fullKey || path.key || '';
    }
    if (!name && typeof path === 'string') {
      name = path.split('/').pop() || '';
    }
    if (!path || !name) {
      Message.error('无法预览');
      return;
    }
    state.currentPreviewPath = path;
    state.currentPreviewText = '';
    state.isEditing = false;
    const content = document.getElementById('previewContent');
    const title = document.getElementById('previewTitle');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const url = api.previewUrl(path);
    const ext = name.split('.').pop().toLowerCase();

    editBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');
    title.textContent = '加载中...';
    content.className = 'flex-1 overflow-hidden bg-white';
    content.innerHTML = '<div class="p-12 text-slate-400 text-center">正在加载预览...</div>';
    UI.showModal('previewModal');

    try {
      if (imageExts.includes(ext)) {
        content.innerHTML = `<div class="preview-media-shell"><img src="${escapeHtml(url)}" class="preview-media" id="previewImg" alt=""></div>`;
        const img = document.getElementById('previewImg');
        img.ondblclick = () => {
          if (!document.fullscreenElement) img.requestFullscreen();
          else document.exitFullscreen();
        };
      } else if (videoExts.includes(ext)) {
        content.innerHTML = `<div class="preview-media-shell"><video src="${escapeHtml(url)}" class="preview-media" controls autoplay playsinline></video></div>`;
      } else if (audioExts.includes(ext)) {
        content.innerHTML = `<div class="preview-audio-shell"><audio src="${escapeHtml(url)}" controls autoplay class="w-full max-w-xl"></audio></div>`;
      } else if (ext === 'pdf') {
        content.innerHTML = `<iframe src="${escapeHtml(url)}" class="preview-frame" title="${escapeHtml(name)}"></iframe>`;
      } else if (textExts.includes(ext)) {
        const res = await api.preview(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        state.currentPreviewText = text;
        if (state.userRole === 'admin') editBtn.classList.remove('hidden');
        if (ext === 'md') content.innerHTML = `<div class="preview-text-shell markdown-body">${sanitizeHtml(marked.parse(text))}</div>`;
        else {
          content.innerHTML = '';
          content.appendChild(buildTextPreviewShell(text));
        }
      } else {
        content.innerHTML = '<div class="p-12 text-slate-400 text-center">该文件类型暂不支持在线预览</div>';
      }
      title.textContent = name;
    } catch (e) {
      content.innerHTML = `<div class="p-12 text-red-400 text-center">无法预览内容${e?.message ? `：${escapeHtml(e.message)}` : ''}</div>`;
    }
  },

  toggleEditMode() {
    const pre = document.getElementById('textContent') || document.querySelector('.markdown-body');
    const rawText = state.currentPreviewText || pre?.innerText || pre?.textContent || '';
    if (!pre && !rawText) return;
    const textarea = document.createElement('textarea');
    textarea.className = 'preview-edit-area';
    textarea.id = 'editArea';
    textarea.value = rawText;
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
    if (!this.uploadQueue) this.uploadQueue = new UploadQueue({ onComplete: () => this.loadFiles() });
    this.uploadQueue.add(files, state.currentPath);
  },
};
