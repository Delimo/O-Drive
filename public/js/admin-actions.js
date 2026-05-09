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
      btnLogs.className = 'px-5 py-2 rounded-lg text-sm font-bold transition-all bg-primary text-white shadow-lg';
      btnPriv.className = 'px-5 py-2 rounded-lg text-sm font-bold transition-all text-slate-400 hover:text-white';
      this.loadLogs();
    } else {
      btnPriv.className = 'px-5 py-2 rounded-lg text-sm font-bold transition-all bg-primary text-white shadow-lg';
      btnLogs.className = 'px-5 py-2 rounded-lg text-sm font-bold transition-all text-slate-400 hover:text-white';
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
      return `<tr class="hover:bg-slate-800/30 transition-colors"><td class="px-6 py-4 text-slate-500 font-mono">${escapeHtml(time)}</td><td class="px-6 py-4 font-bold ${color}">${escapeHtml(l.action)}</td><td class="px-6 py-4 text-slate-300 font-mono break-all">${escapeHtml(l.details || '')}</td><td class="px-6 py-4 text-slate-500 font-mono text-sm text-left">${escapeHtml(l.ip || '')}</td></tr>`;
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
      return `<tr class="hover:bg-slate-800/30 transition-colors"><td class="px-4 py-4 font-mono text-primary text-white">${path}</td><td class="px-4 py-4 text-right"><button class="px-3 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded hover:bg-red-500 hover:text-white text-xs transition-all font-bold text-white" onclick="AdminActions.removeHidden(${escapeHtml(JSON.stringify(i.path))})">取消屏蔽</button></td></tr>`;
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
