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
    document.getElementById('statTrash').innerHTML = `
      <span class="stat-trash-count">${data.trash?.count || 0} <span class="text-sm font-semibold text-slate-500">项</span></span>
      <span class="stat-trash-size text-sm font-semibold text-slate-500">${escapeHtml(data.trash?.sizeFormatted || '0 B')}</span>
    `;
    document.getElementById('statLogs').textContent = String(data.logs?.count || 0);
    this.renderStorageWarnings(data);

    const labels = { image: '图片', video: '视频', audio: '音频', text: '文本', archive: '压缩包', exe: '程序', other: '其他' };
    const breakdown = Object.entries(data.breakdown || {});
    const totalCount = breakdown.reduce((sum, [, item]) => sum + Number(item.count || 0), 0) || 1;
    document.getElementById('statsBreakdown').innerHTML = breakdown.map(([kind, item]) => {
      const count = Number(item.count || 0);
      const pct = count > 0 ? Math.max(4, Math.round((count / totalCount) * 100)) : 0;
      return `
        <div class="breakdown-item rounded-xl border border-border bg-background">
          <div class="breakdown-head">
            <span class="breakdown-label">${labels[kind] || kind}</span>
            <strong class="breakdown-value font-mono">${escapeHtml(item.sizeFormatted || '0 B')}</strong>
          </div>
          <div class="breakdown-track">
            <div class="breakdown-bar" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('statsLatest').innerHTML = (data.latest || []).slice(0, 7).map(item => `
      <div class="latest-item rounded-xl border border-border bg-background px-4 py-3">
        <div class="latest-item-name font-mono text-slate-700">${escapeHtml(item.key)}</div>
        <div class="latest-item-meta mt-1 text-xs text-slate-500 flex items-center justify-between gap-3">
          <span>${escapeHtml(item.sizeFormatted || '0 B')}</span>
          <span>${escapeHtml(item.uploaded ? new Date(item.uploaded).toLocaleString('zh-CN', { hour12: false }) : '-')}</span>
        </div>
      </div>
    `).join('') || '<div class="text-slate-500 text-sm">暂无文件</div>';
  },

  renderStorageWarnings(data) {
    const box = document.getElementById('storageWarnings');
    if (!box) return;
    const warnings = [];
    const fileCount = Number(data.files?.count || 0);
    const totalSize = Number(data.files?.totalSize || 0);
    const trashCount = Number(data.trash?.count || 0);
    const trashSize = Number(data.trash?.size || 0);

    if (data.files?.truncated) {
      warnings.push({
        level: 'warning',
        title: '文件统计已达到扫描上限',
        body: '概览最多扫描 20000 个对象，实际文件可能更多。建议分目录管理，或后续引入索引表。'
      });
    }
    if (fileCount >= 15000) {
      warnings.push({
        level: 'info',
        title: '文件数量较多',
        body: `当前已统计 ${fileCount} 个文件，大目录复制、移动、删除时建议分批操作。`
      });
    }
    if (trashCount >= 100 || trashSize > Math.max(totalSize * 0.2, 1024 * 1024 * 1024)) {
      warnings.push({
        level: 'warning',
        title: '回收站占用偏高',
        body: `回收站有 ${trashCount} 项，占用 ${data.trash?.sizeFormatted || '0 B'}，可以设置保留天数并清理过期项目。`
      });
    }
    if (totalSize >= 50 * 1024 * 1024 * 1024) {
      warnings.push({
        level: 'info',
        title: '存储体积较大',
        body: '建议定期检查大文件和回收站，避免长期保留重复上传或临时文件。'
      });
    }

    box.classList.toggle('hidden', warnings.length === 0);
    box.innerHTML = warnings.map(item => `
      <div class="storage-warning storage-warning-${item.level}">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.body)}</span>
      </div>
    `).join('');
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
      return `
        <tr class="admin-log-row hover:bg-slate-50 transition-colors">
          <td data-label="时间" class="admin-log-time px-6 py-4 text-slate-500 font-mono">${escapeHtml(time)}</td>
          <td data-label="动作" class="admin-log-action px-6 py-4 font-bold ${color}">${escapeHtml(l.action)}</td>
          <td data-label="详情" class="admin-log-details px-6 py-4 text-slate-600 font-mono">${escapeHtml(l.details || '')}</td>
          <td data-label="IP" class="admin-log-ip px-6 py-4 text-slate-500 font-mono text-sm text-left">${escapeHtml(l.ip || '')}</td>
        </tr>
      `;
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
      return `<tr class="hover:bg-slate-50 transition-colors"><td class="px-4 py-4 font-mono text-primary">${path}</td><td class="px-4 py-4 text-right"><button class="admin-danger-btn" data-admin-action="remove-hidden" data-args='${escapeHtml(JSON.stringify([i.path]))}'>取消屏蔽</button></td></tr>`;
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
      return `<tr class="hover:bg-slate-50 transition-colors"><td class="px-4 py-4 font-mono text-primary">${path}</td><td class="px-4 py-4">${i.show_name ? '显示' : '隐藏'}</td><td class="px-4 py-4 text-slate-500">${note}</td><td class="px-4 py-4 text-right"><button class="admin-danger-btn" data-admin-action="remove-protected" data-args='${escapeHtml(JSON.stringify([i.path]))}'>删除</button></td></tr>`;
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
