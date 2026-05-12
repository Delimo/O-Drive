import { adminState } from './admin-state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';

const LOG_PAGE_SIZE = 8;

function describeLogAction(action = '') {
  const normalized = String(action || '').toUpperCase();
  const labels = {
    UPLOAD: '上传完成',
    UPLOAD_START: '上传开始',
    UPLOAD_ABORT: '上传取消',
    DELETE: '删除',
    RENAME: '重命名',
    MOVE: '移动',
    COPY: '复制',
    MKDIR: '新建文件夹',
    PASTE: '粘贴',
    PROTECT: '设置密码',
    UNPROTECT: '删除密码',
    HIDE: '隐藏路径',
    UNHIDE: '取消隐藏',
    MAINTENANCE: '维护操作',
  };
  return labels[normalized] || normalized.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()) || '未知操作';
}

function logActionClass(action = '') {
  const normalized = String(action || '').toUpperCase();
  if (normalized.includes('DELETE') || normalized.includes('ABORT') || normalized.includes('PURGE') || normalized.includes('CLEAR')) return 'is-delete';
  if (normalized.includes('UPLOAD') || normalized.includes('CREATE') || normalized.includes('MKDIR')) return 'is-upload';
  return 'is-default';
}

export const AdminActions = {
  switchTab(id) {
    ['overview', 'health', 'logs', 'privacy', 'protected', 'maintenance'].forEach(tab => {
      document.getElementById(`${tab}-tab`)?.classList.toggle('hidden', id !== tab);
      document.getElementById(`btn-${tab}`)?.classList.toggle('is-active', id === tab);
    });
    adminState.activeTab = id;

    if (id === 'overview') return this.loadStats();
    if (id === 'health') return this.loadHealth();
    if (id === 'logs') return this.loadLogs();
    if (id === 'privacy') return this.loadHidden();
    if (id === 'maintenance') return this.loadMaintenance();
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

  healthItem(label, ok, detail = '') {
    return `
      <div class="health-item ${ok ? 'is-ok' : 'is-bad'}">
        <div>
          <strong>${escapeHtml(label)}</strong>
          ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
        </div>
        <em>${ok ? '正常' : '需处理'}</em>
      </div>
    `;
  },

  async loadHealth() {
    const grid = document.getElementById('healthGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="text-sm text-slate-500">正在检查...</div>';
    const { res, data } = await api.adminHealth();
    if (!res.ok) {
      grid.innerHTML = '<div class="text-sm text-rose-600 font-bold">环境检查失败，请重新登录或稍后再试。</div>';
      return;
    }

    const tableList = Array.isArray(data.db?.tables) && data.db.tables.length
      ? `已存在表：${data.db.tables.join(', ')}`
      : '核心表会在功能首次使用时自动创建';

    grid.innerHTML = [
      this.healthItem('D1 数据库绑定 DB', Boolean(data.db?.ok), data.db?.message || tableList),
      this.healthItem('R2 存储绑定 R2_BUCKET', Boolean(data.r2?.ok), data.r2?.message || '文件读写使用该 Bucket'),
      this.healthItem('管理员用户名', Boolean(data.env?.adminUsername), '环境变量 ADMIN_USERNAME'),
      this.healthItem('管理员密码', Boolean(data.env?.adminPassword), '环境变量 ADMIN_PASSWORD'),
      this.healthItem(
        '访客访问',
        true,
        data.env?.guestEnabled ? 'ALLOW_GUEST=true，访客可浏览' : '默认关闭；只有 ALLOW_GUEST=true 才开启'
      ),
    ].join('');
  },

  maintenanceItem(label, value, detail = '') {
    return `
      <div class="health-item is-ok">
        <div>
          <strong>${escapeHtml(label)}</strong>
          ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
        </div>
        <em>${escapeHtml(String(value))}</em>
      </div>
    `;
  },

  async loadMaintenance() {
    const grid = document.getElementById('maintenanceGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="text-sm text-slate-500">正在加载...</div>';
    const { res, data } = await api.maintenance();
    if (!res.ok) {
      grid.innerHTML = '<div class="text-sm text-rose-600 font-bold">维护信息加载失败。</div>';
      return;
    }
    grid.innerHTML = [
      this.maintenanceItem('文件索引记录', data.indexCount || 0, '搜索和统计优先使用该索引'),
      this.maintenanceItem('访问失败记录', data.accessAttemptCount || 0, '受保护路径密码错误计数'),
      this.maintenanceItem('回收站记录', data.trashCount || 0, '仍会占用 R2 空间'),
      this.maintenanceItem('操作日志', data.logsCount || 0, '管理员操作记录'),
      this.maintenanceItem('缩略图缓存', data.thumbnailsPresent ? '存在' : '无', '.thumbs/ 系统前缀'),
    ].join('');
  },

  async runMaintenanceAction(action) {
    const label = document.getElementById('maintenanceResult');
    if (label) label.textContent = '正在执行...';
    const { res, data } = await api.maintenanceAction(action);
    if (!res.ok || data?.success === false) {
      if (label) label.textContent = data?.message || '维护操作失败';
      return;
    }
    const summary = data.synced != null
      ? `已同步 ${data.synced} 个文件${data.truncated ? '，仍达到扫描上限' : ''}`
      : `已清理 ${data.deleted || 0} 项${data.truncated ? '，仍达到扫描上限' : ''}`;
    if (label) label.textContent = summary;
    await this.loadMaintenance();
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
    const { res, data } = await api.adminLogs(adminState.currentPage, LOG_PAGE_SIZE);
    if (res.status !== 200) return window.location.href = '/';
    adminState.totalPages = data.totalPages || 1;
    document.getElementById('totalPages').textContent = adminState.totalPages;
    document.getElementById('currentPage').textContent = adminState.currentPage;
    document.getElementById('logTbody').innerHTML = (data.logs || []).map(l => {
      const time = new Date(l.timestamp).toLocaleString('zh-CN', { hour12: false });
      const actionClass = logActionClass(l.action);
      const actionLabel = describeLogAction(l.action);
      return `
        <tr class="admin-log-row hover:bg-slate-50 transition-colors">
          <td data-label="时间" class="admin-log-time px-5 py-4 text-slate-500 font-mono">${escapeHtml(time)}</td>
          <td data-label="动作" class="admin-log-action px-5 py-4 font-bold"><span class="admin-action-badge ${actionClass}" title="${escapeHtml(l.action || '')}">${escapeHtml(actionLabel)}</span></td>
          <td data-label="详情" class="admin-log-details px-5 py-4 text-slate-600 font-mono">${escapeHtml(l.details || '')}</td>
          <td data-label="IP" class="admin-log-ip px-5 py-4 text-slate-500 font-mono text-sm text-left">${escapeHtml(l.ip || '')}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4"><div class="admin-empty-state">暂无操作日志</div></td></tr>';
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
      return `<tr class="admin-hidden-row hover:bg-slate-50 transition-colors"><td data-label="路径" class="px-5 py-4 font-mono text-primary break-all">${path}</td><td data-label="操作" class="px-5 py-4 text-right"><button class="admin-danger-btn" data-admin-action="remove-hidden" data-args='${escapeHtml(JSON.stringify([i.path]))}'>取消屏蔽</button></td></tr>`;
    }).join('') || '<tr><td colspan="2"><div class="admin-empty-state">暂无隐藏路径</div></td></tr>';
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
      const note = escapeHtml(i.note || '-');
      const visibility = i.show_name
        ? '<span class="admin-status-badge is-visible">显示</span>'
        : '<span class="admin-status-badge is-hidden">隐藏</span>';
      return `<tr class="admin-protected-row hover:bg-slate-50 transition-colors"><td data-label="路径" class="px-5 py-4 font-mono text-primary break-all">${path}</td><td data-label="名称可见" class="px-5 py-4">${visibility}</td><td data-label="备注" class="px-5 py-4 text-slate-500 break-all">${note}</td><td data-label="操作" class="px-5 py-4 text-right"><button class="admin-danger-btn" data-admin-action="remove-protected" data-args='${escapeHtml(JSON.stringify([i.path]))}'>删除</button></td></tr>`;
    }).join('') || '<tr><td colspan="4"><div class="admin-empty-state">暂无访问密码规则</div></td></tr>';
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
