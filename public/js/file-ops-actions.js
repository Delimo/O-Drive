import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { escapeHtml } from './utils.js';
import { getSelectableKeys } from './file-view-model.js';
import { UploadQueue } from './uploader.js';
import { PreviewActions } from './preview-actions.js';
import { describeItem } from './filters.js';

export const FileOpsActions = {
  toggleSelect(key, el, e) {
    e.stopPropagation();
    const selected = !state.selectedPaths.includes(key);
    state.selectedPaths = selected ? [...state.selectedPaths, key] : state.selectedPaths.filter(p => p !== key);
    UI.setItemSelected(key, selected);
    UI.updateBatchUI();
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
    const { res, data } = await api.paste({ ...state.clipboard, targetDir: state.currentPath });
    if (res.ok && data?.success !== false) {
      Message.success('成功');
      state.clipboard = null;
      this.loadFiles();
    } else if (res.ok && data?.completed > 0) {
      Message.error(`已完成 ${data.completed} 项，失败 ${data.failed?.length || 0} 项`);
      state.clipboard = null;
      this.loadFiles();
    } else {
      Message.error(data?.failed?.[0]?.message || data?.message || '失败');
    }
  },

  async batchDelete() {
    if (!confirm(`确认删除选中的 ${state.selectedPaths.length} 项吗？`)) return;
    const { res, data } = await api.batchDelete(state.selectedPaths);
    if (res.ok && data?.success !== false) {
      Message.success('已删除');
      this.loadFiles();
    } else if (res.ok && data?.completed > 0) {
      Message.error(`已删除 ${data.completed} 项，失败 ${data.failed?.length || 0} 项`);
      this.loadFiles();
    } else {
      Message.error(data?.failed?.[0]?.message || data?.message || '失败');
    }
  },

  async handleSearch() {
    const desktopInput = document.getElementById('searchInput');
    const mobileInput = document.getElementById('mobileSearchInput');
    const activeInput = mobileInput && mobileInput.offsetParent ? mobileInput : desktopInput;
    const q = activeInput?.value.trim() || '';
    if (!q) return this.clearSearch();
    state.isSearching = true;
    state.search = { query: q, scope: state.currentPath, nextCursor: '', loadingMore: false };

    const { res, data } = await api.searchFiles(q, state.currentPath);
    if (!res.ok) {
      if (data?.code === 'password_required') return PreviewActions.handlePasswordRequired(data, () => this.handleSearch());
      return;
    }
    state.fileData = { folders: [], files: data?.files || [] };
    state.search.nextCursor = data?.nextCursor || '';
    UI.updateFileList();
    document.getElementById('breadcrumb').innerHTML = `<span class="text-white font-bold tracking-wide">搜索结果: ${escapeHtml(q)}</span>`;
  },

  async loadMoreSearch() {
    if (!state.isSearching || !state.search?.nextCursor || state.search.loadingMore) return;
    state.search.loadingMore = true;
    UI.updateFileList();
    const { res, data } = await api.searchFiles(state.search.query, state.search.scope, state.search.nextCursor);
    state.search.loadingMore = false;
    if (!res.ok) {
      Message.error(data?.message || '加载更多失败');
      UI.updateFileList();
      return;
    }
    state.fileData = {
      folders: [],
      files: [...(state.fileData.files || []), ...(data?.files || [])],
    };
    state.search.nextCursor = data?.nextCursor || '';
    UI.updateFileList();
  },

  clearSearch() {
    state.isSearching = false;
    state.search = { query: '', scope: '/', nextCursor: '', loadingMore: false };
    const desktopInput = document.getElementById('searchInput');
    if (desktopInput) desktopInput.value = '';
    const mobileInput = document.getElementById('mobileSearchInput');
    if (mobileInput) mobileInput.value = '';
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
    UI.renderDetailsPanel(describeItem(data));
  },

  copyPath(path) {
    if (!path) return;
    navigator.clipboard?.writeText(path)
      .then(() => Message.success('已复制路径'))
      .catch(() => Message.error('复制失败'));
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
    const retention = await api.trashRetention();
    const input = document.getElementById('trashRetentionDays');
    if (input && retention.res.ok) input.value = String(retention.data?.days || 0);
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

  async clearTrash() {
    if (!confirm('确定清空回收站吗？此操作不可恢复。')) return;
    const { res, data } = await api.clearTrash();
    if (res.ok) {
      Message.success(`已清空 ${data?.deleted || 0} 项`);
      await this.loadTrash(1);
      this.loadFiles();
    } else {
      Message.error('清空失败');
    }
  },

  async cleanupTrash() {
    const { res, data } = await api.cleanupTrash();
    if (res.ok) {
      Message.success(`已清理 ${data?.deleted || 0} 项`);
      await this.loadTrash(1);
      this.loadFiles();
    } else {
      Message.error('清理失败');
    }
  },

  async saveTrashRetention() {
    const input = document.getElementById('trashRetentionDays');
    const days = Math.max(0, Number(input?.value || 0));
    const { res } = await api.setTrashRetention(days);
    if (res.ok) Message.success(days ? `已设置保留 ${days} 天` : '已关闭自动清理');
    else Message.error('保存失败');
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

  toggleViewMode() {
    state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    localStorage.setItem('viewMode', state.viewMode);
    UI.updateFileList();
    UI.closeMobileActions();
  },

  toggleSortMode() {
    const idx = state.sortModes.indexOf(state.sortBy);
    state.sortBy = state.sortModes[(idx + 1) % state.sortModes.length];
    localStorage.setItem('sortBy', state.sortBy);
    UI.updateFileList();
    UI.closeMobileActions();
  },

  downloadFile(p, force = false) {
    const item = [...(state.fileData.folders || []), ...(state.fileData.files || [])].find(i => i.path === p || i.fullKey === p);
    if (!force && item?.protected && state.userRole !== 'admin') {
      return PreviewActions.handlePasswordRequired({ path: item.fullKey || p }, () => this.downloadFile(p, true));
    }
    window.open(api.download(p), '_blank', 'noopener');
  },

  async uploadFiles(files) {
    if (state.userRole !== 'admin') return;
    const incoming = [...files];
    const existing = new Set((state.fileData.files || []).map(file => file.name));
    const conflicts = incoming.filter(file => existing.has(file.name));
    let conflictMode = 'error';
    if (conflicts.length) {
      const answer = prompt(
        `检测到 ${conflicts.length} 个同名文件。请输入处理方式：overwrite 覆盖，rename 自动重命名，skip 跳过。`,
        'rename',
      );
      conflictMode = String(answer || 'skip').trim().toLowerCase();
      if (!['overwrite', 'rename', 'skip'].includes(conflictMode)) conflictMode = 'skip';
    }
    if (!this.uploadQueue) this.uploadQueue = new UploadQueue({ onComplete: () => this.loadFiles() });
    this.uploadQueue.add(incoming, state.currentPath, { conflictMode });
  },
};
