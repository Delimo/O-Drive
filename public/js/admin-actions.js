import { adminState } from './admin-state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';

export const AdminActions = {
  switchTab(id) {
    ['overview', 'logs', 'privacy', 'protected'].forEach(tab => {
      document.getElementById(`${tab}-tab`)?.classList.toggle('hidden', id !== tab);
      document.getElementById(`btn-${tab}`)?.classList.toggle('is-active', id === tab);
    });
    adminState.activeTab = id;

    if (id === 'overview') return this.loadStats();
    if (id === 'logs') return this.loadLogs();
    if (id === 'privacy') return this.loadHidden();
    return this.loadProtected();
  },

  async loadStats() {
    const { res, data } = await api.adminStats();
    if (res.status !== 200) return window.location.href = '/';
    document.getElementById('statFileCount').textContent = String(data.files?.count || 0);
    document.getElementById('statTotalSize').textContent = data.files?.totalSizeFormatted || '0 B';
    document.getElementById('statTrash').textContent = `${data.trash?.count || 0} 项 · ${data.trash?.sizeFormatted || '0 B'}`;
    document.getElementById('statLogs').textContent = String(data.logs?.count || 0);

    const labels = { image: '图片', video: '视频', audio: '音频', text: '文本', archive: '压缩包', other: '其他' };
    document.getElementById('statsBreakdown').innerHTML = Object.entries(data.breakdown || {}).map(([kind, item]) => `
      <div class="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
        <span>${labels[kind] || kind}</span>
        <strong class="font-mono">${item.count || 0} · ${escapeHtml(item.sizeFormatted || '0 B')}</strong>
      </div>
    `).join('');

    document.getElementById('statsLatest').innerHTML = (data.latest || []).map(item => `
      <div class="rounded-lg border border-border bg-background px-3 py-2">
        <div class="font-mono break-all text-slate-700">${escapeHtml(item.key)}</div>
        <div class="mt-1 text-xs text-slate-500">${escapeHtml(item.sizeFormatted || '0 B')} · ${escapeHtml(item.uploaded ? new Date(item.uploaded).toLocaleString('zh-CN', { hour12: false }) : '-')}</div>
      </div>
    `).join('') || '<div class="text-slate-500 text-sm">暂无文件</div>';
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
