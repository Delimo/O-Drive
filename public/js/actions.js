import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { PreviewActions } from './preview-actions.js';
import { FileOpsActions } from './file-ops-actions.js';

export const Actions = {
  async init() {
    const { res, data } = await api.getRole();
    state.userRole = res.status === 200 ? data.role : 'guest';
    UI.updateAuth();
    if (res.status === 401) {
      UI.renderLockedState();
    } else {
      await this.loadFiles();
    }

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
    if (!res.ok) {
      if (data?.code === 'password_required') return this.handlePasswordRequired(data, () => this.loadFiles());
      const message = data?.message || '文件列表加载失败';
      state.fileData = { folders: [], files: [] };
      UI.renderFileListStatus({
        title: '文件列表加载失败',
        message: `${message}。请检查网络或稍后重试。`,
        tone: 'error',
        actionLabel: '重试',
        action: 'reload-files',
      });
      Message.error(message);
      return;
    }
    state.fileData = data;
    UI.updateFileList();
    UI.renderBreadcrumb();
  },

  async doLogin() {
    const { res, data } = await api.login(document.getElementById('adminUser').value, document.getElementById('adminPass').value);
    if (data?.success) window.location.reload();
    else document.getElementById('loginError').textContent = res.status === 429 ? '尝试次数过多，请稍后再试' : '登录失败，请检查用户名、密码和部署环境变量';
  },

  async logout() {
    await api.logout();
    window.location.reload();
  },

  navigateTo(p) {
    const wasSearching = state.isSearching;
    state.currentPath = p.endsWith('/') ? p : `${p}/`;
    state.isSearching = false;
    if (wasSearching) {
      state.search = { query: '', scope: '/', nextCursor: '', loadingMore: false };
      const desktopInput = document.getElementById('searchInput');
      if (desktopInput) desktopInput.value = '';
      const mobileInput = document.getElementById('mobileSearchInput');
      if (mobileInput) mobileInput.value = '';
    }
    this.loadFiles();
  },
};

Object.assign(Actions, PreviewActions, FileOpsActions);
