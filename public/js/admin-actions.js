import { adminState } from './admin-state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';

export const AdminActions = {
  switchTab(id) {
    document.getElementById('logs-tab').classList.toggle('hidden', id !== 'logs');
    document.getElementById('privacy-tab').classList.toggle('hidden', id !== 'privacy');
    document.getElementById('protected-tab').classList.toggle('hidden', id !== 'protected');
    const btnLogs = document.getElementById('btn-logs');
    const btnPriv = document.getElementById('btn-privacy');
    const btnProtected = document.getElementById('btn-protected');
    adminState.activeTab = id;

    if (id === 'logs') {
      btnLogs.className = 'admin-tab-btn is-active';
      btnPriv.className = 'admin-tab-btn';
      btnProtected.className = 'admin-tab-btn';
      this.loadLogs();
    } else if (id === 'privacy') {
      btnPriv.className = 'admin-tab-btn is-active';
      btnLogs.className = 'admin-tab-btn';
      btnProtected.className = 'admin-tab-btn';
      this.loadHidden();
    } else {
      btnProtected.className = 'admin-tab-btn is-active';
      btnLogs.className = 'admin-tab-btn';
      btnPriv.className = 'admin-tab-btn';
      this.loadProtected();
    }
  },

  async loadLogs() {
    const { res, data } = await api.adminLogs(adminState.currentPage, 20);
    if (res.status !== 200) return window.location.href = '/';
    adminState.totalPages = data.totalPages || 1;
    document.getElementById('totalPages').textContent = adminState.totalPages;
    document.getElementById('currentPage').textContent = adminState.currentPage;
    document.getElementById('logTbody').innerHTML = (data.logs || []).map(l => {
      const time = new Date(l.timestamp).toLocaleString('zh-CN', { hour12: false });
      const color = l.action === 'DELETE' ? 'text-red-400' : l.action === 'UPLOAD' ? 'text-emerald-400' : 'text-primary';
      return `<tr class="hover:bg-slate-50 transition-colors"><td class="px-6 py-4 text-slate-500 font-mono">${escapeHtml(time)}</td><td class="px-6 py-4 font-bold ${color}">${escapeHtml(l.action)}</td><td class="px-6 py-4 text-slate-600 font-mono break-all">${escapeHtml(l.details || '')}</td><td class="px-6 py-4 text-slate-500 font-mono text-sm text-left">${escapeHtml(l.ip || '')}</td></tr>`;
    }).join('');
  },

  changePage(dir) {
    const next = adminState.currentPage + dir;
    if (next >= 1 && next <= adminState.totalPages) {
      adminState.currentPage = next;
      this.loadLogs();
    }
  },

  async loadHidden() {
    const { data } = await api.hiddenPaths();
    document.getElementById('hiddenTbody').innerHTML = (data?.list || []).map(i => {
      const path = escapeHtml(i.path);
      return `<tr class="hover:bg-slate-50 transition-colors"><td class="px-4 py-4 font-mono text-primary">${path}</td><td class="px-4 py-4 text-right"><button class="px-3 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-full hover:bg-rose-500 hover:text-white text-xs transition-all font-bold" data-admin-action="remove-hidden" data-args='${escapeHtml(JSON.stringify([i.path]))}'>取消屏蔽</button></td></tr>`;
    }).join('');
  },

  async addHidden() {
    const path = document.getElementById('hideInput').value.trim();
    if (!path) return;
    await api.addHiddenPath(path);
    document.getElementById('hideInput').value = '';
    this.loadHidden();
  },

  async removeHidden(p) {
    if (confirm('取消隐藏这条路径？')) {
      await api.removeHiddenPath(p);
      this.loadHidden();
    }
  },

  async loadProtected() {
    const { data } = await api.protectedPaths();
    document.getElementById('protectedTbody').innerHTML = (data?.list || []).map(i => {
      const path = escapeHtml(i.path);
      const note = escapeHtml(i.note || '');
      return `<tr class="hover:bg-slate-50 transition-colors"><td class="px-4 py-4 font-mono text-primary">${path}</td><td class="px-4 py-4">${i.show_name ? '显示' : '隐藏'}</td><td class="px-4 py-4 text-slate-500">${note}</td><td class="px-4 py-4 text-right"><button class="px-3 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-full hover:bg-rose-500 hover:text-white text-xs transition-all font-bold" data-admin-action="remove-protected" data-args='${escapeHtml(JSON.stringify([i.path]))}'>删除</button></td></tr>`;
    }).join('');
  },

  async addProtected() {
    const path = document.getElementById('protectedPathInput').value.trim();
    const password = document.getElementById('protectedPasswordInput').value;
    const note = document.getElementById('protectedNoteInput').value.trim();
    const showName = document.getElementById('protectedShowNameInput').checked;
    if (!path || !password) return;
    await api.addProtectedPath({ path, password, note, showName });
    document.getElementById('protectedPathInput').value = '';
    document.getElementById('protectedPasswordInput').value = '';
    document.getElementById('protectedNoteInput').value = '';
    document.getElementById('protectedShowNameInput').checked = true;
    this.loadProtected();
  },

  async removeProtected(p) {
    if (confirm('删除这条访问密码规则？')) {
      await api.removeProtectedPath(p);
      this.loadProtected();
    }
  },
};
