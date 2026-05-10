import { adminState } from './admin-state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';

export const AdminActions = {
  switchTab(id) {
    document.getElementById('logs-tab').classList.toggle('hidden', id !== 'logs');
    document.getElementById('privacy-tab').classList.toggle('hidden', id !== 'privacy');
    const btnLogs = document.getElementById('btn-logs');
    const btnPriv = document.getElementById('btn-privacy');
    adminState.activeTab = id;

    if (id === 'logs') {
      btnLogs.className = 'admin-tab-btn is-active';
      btnPriv.className = 'admin-tab-btn';
      this.loadLogs();
    } else {
      btnPriv.className = 'admin-tab-btn is-active';
      btnLogs.className = 'admin-tab-btn';
      this.loadHidden();
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
      return `<tr class="hover:bg-slate-50 transition-colors"><td class="px-4 py-4 font-mono text-primary">${path}</td><td class="px-4 py-4 text-right"><button class="px-3 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-full hover:bg-rose-500 hover:text-white text-xs transition-all font-bold" onclick="AdminActions.removeHidden(${escapeHtml(JSON.stringify(i.path))})">取消屏蔽</button></td></tr>`;
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
};
