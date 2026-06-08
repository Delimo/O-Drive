import { adminState } from './admin-state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { describeLogAction, logActionClass } from './admin-log-utils.js';
import { createAdminShareActions } from './admin-share-actions.js';
import {
  WEBHOOK_EVENT_KEYS,
  headersToText,
  normalizeWebhookItems,
  parseHeadersText,
  selectedWebhookEvents,
  setWebhookEvents,
  webhookEventsLabel,
} from './admin-webhook-utils.js';

const LOG_PAGE_SIZE = 10;
export const ADMIN_TABS = ['overview', 'health', 'logs', 'access', 'quota', 'shares', 'webhooks', 'tasks'];

export function getInitialAdminTab() {
  const tab = (window.location.hash || '').replace(/^#/, '');
  if (tab === 'privacy' || tab === 'protected') return 'access';
  return ADMIN_TABS.includes(tab) ? tab : 'overview';
}

function adminConfirm(title, body = '') {
  if (typeof window.showConfirm === 'function') return window.showConfirm(title, body);
  return Promise.resolve(confirm([title, body].filter(Boolean).join('\n\n')));
}

function setMaintenanceResult(text = '') {
  ['healthMaintenanceResult', 'logMaintenanceResult'].forEach(id => {
    const label = document.getElementById(id);
    if (!label) return;
    label.textContent = text;
    label.classList.toggle('hidden', !text);
  });
}

function setWebhookForm(item = {}) {
  const values = {
    webhookUrlInput: item.url || '',
    webhookMethodInput: item.method || 'POST',
    webhookContentTypeInput: item.contentType || 'application/json',
    webhookHeadersInput: headersToText(item.headers),
    webhookBodyInput: item.body || '',
    webhookMsgTypeInput: item.msgtype || 'json',
    webhookNameInput: item.name || '',
  };
  Object.entries(values).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value;
  });
  setWebhookEvents(item.events);
}

function setWebhookResult(text = '', tone = 'muted') {
  const result = document.getElementById('webhookResult');
  if (!result) return;
  result.textContent = text;
  result.classList.toggle('hidden', !text);
  result.classList.toggle('is-error', tone === 'error');
  result.classList.toggle('is-muted', tone === 'muted');
}

function setWebhookListCount(count = 0) {
  const label = document.getElementById('webhookListCount');
  if (label) label.textContent = `${count} 个`;
}

function setLogPaginationState() {
  const prev = document.getElementById('logPrevButton');
  const next = document.getElementById('logNextButton');
  if (prev) prev.disabled = adminState.currentPage <= 1;
  if (next) next.disabled = adminState.currentPage >= adminState.totalPages;
}

function setWebhookFormMode(item = null) {
  const editing = adminState.webhookEditingIndex >= 0;
  const hint = document.getElementById('webhookFormHint');
  const button = document.getElementById('webhookSaveButton');
  if (button) button.textContent = editing ? '更新' : '保存';
  if (hint) {
    const label = item?.name || item?.url || (editing ? `Webhook #${adminState.webhookEditingIndex + 1}` : '');
    hint.textContent = editing ? `正在编辑：${label}` : '';
    hint.classList.toggle('hidden', !editing);
  }
  document.querySelectorAll('.webhook-row').forEach((row, index) => {
    row.classList.toggle('is-editing', editing && index === adminState.webhookEditingIndex);
  });
}

function setWebhookRowStatus(index, text = '', tone = 'muted') {
  const status = document.querySelector(`[data-webhook-status="${index}"]`);
  if (!status) {
    setWebhookResult(text, tone);
    return;
  }
  document.querySelectorAll('.webhook-row-status').forEach(item => {
    if (item === status) return;
    item.textContent = '';
    item.classList.remove('is-visible', 'is-error', 'is-muted', 'is-success');
  });
  status.textContent = text;
  status.classList.toggle('is-visible', Boolean(text));
  status.classList.toggle('is-error', tone === 'error');
  status.classList.toggle('is-muted', tone === 'muted');
  status.classList.toggle('is-success', tone === 'success');
}

function readWebhookForm() {
  const events = selectedWebhookEvents();
  const endpoint = {
    id: `${Date.now()}`,
    name: (document.getElementById('webhookNameInput')?.value || '').trim(),
    msgtype: document.getElementById('webhookMsgTypeInput')?.value || 'json',
    url: (document.getElementById('webhookUrlInput')?.value || '').trim(),
    method: (document.getElementById('webhookMethodInput')?.value || 'POST').toUpperCase(),
    contentType: (document.getElementById('webhookContentTypeInput')?.value || 'application/json').trim(),
    headers: parseHeadersText(document.getElementById('webhookHeadersInput')?.value || ''),
    body: document.getElementById('webhookBodyInput')?.value || '',
    events: events.length === WEBHOOK_EVENT_KEYS.length ? [] : events,
    enabled: true,
  };
  return endpoint;
}

function adminTime(value) {
  const num = Number(value || 0);
  return num ? new Date(num).toLocaleString('zh-CN', { hour12: false }) : '-';
}

function statusLabel(status = '') {
  const map = {
    completed: '已完成',
    partial: '部分完成',
    failed: '失败',
    running: '运行中',
    queued: '排队中',
  };
  return map[status] || status || '-';
}

function statusClass(status = '') {
  if (['completed', 'success', 'ok'].includes(status)) return 'is-ok';
  if (['failed', 'error', 'partial'].includes(status)) return 'is-bad';
  if (['running', 'queued'].includes(status)) return 'is-running';
  return '';
}

function summarizeD1Tables(tables = []) {
  if (!Array.isArray(tables) || !tables.length) {
    return '所需表会在功能首次使用时自动创建';
  }
  const coreTables = ['settings', 'logs', 'file_index', 'trash', 'share_links', 'path_passwords', 'webhook_deliveries'];
  const readyCount = coreTables.filter(name => tables.includes(name)).length;
  return `已存在 ${tables.length} 张表，核心表 ${readyCount}/${coreTables.length} 已就绪`;
}

export const AdminActions = {
  switchTab(id, options = {}) {
    const tabId = ADMIN_TABS.includes(id) ? id : 'overview';
    ADMIN_TABS.forEach(tab => {
      document.getElementById(`${tab}-tab`)?.classList.toggle('hidden', tabId !== tab);
      const button = document.getElementById(`btn-${tab}`);
      button?.classList.toggle('is-active', tabId === tab);
      button?.setAttribute('aria-selected', tabId === tab ? 'true' : 'false');
    });
    adminState.activeTab = tabId;
    document.body.dataset.adminTab = tabId;
    if (options.persist !== false && window.location.hash !== `#${tabId}`) {
      history.replaceState(null, '', `#${tabId}`);
    }

    if (tabId === 'overview') return this.loadStats();
    if (tabId === 'health') return Promise.all([this.loadHealth(), this.loadMaintenance()]);
    if (tabId === 'logs') return this.loadLogs();
    if (tabId === 'access') return this.loadAccessRules();
    if (tabId === 'quota') return this.loadQuota();
    if (tabId === 'shares') return this.loadShares();
    if (tabId === 'webhooks') return Promise.all([this.loadWebhooks(), this.loadWebhookDeliveries()]);
    if (tabId === 'tasks') return this.loadTasks();
    return this.loadStats();
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
    this.renderOverviewAttention(data.attention || []);

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

  renderOverviewAttention(items = []) {
    const box = document.getElementById('overviewAttention');
    if (!box) return;
    const rows = Array.isArray(items) && items.length ? items : [{
      level: 'ok',
      title: '暂无需要处理的事项',
      body: '索引、日志和清理策略处于正常范围。',
      tab: 'health',
    }];
    box.innerHTML = rows.map(item => `
      <button class="attention-item is-${escapeHtml(item.level || 'info')}" data-admin-action="switch-tab" data-args='${escapeHtml(JSON.stringify([item.tab || 'health']))}'>
        <span class="attention-dot"></span>
        <span>
          <strong>${escapeHtml(item.title || '待关注事项')}</strong>
          <small>${escapeHtml(item.body || '')}</small>
        </span>
      </button>
    `).join('');
  },

  renderIndexStatus(index = {}) {
    const panel = document.getElementById('indexStatusPanel');
    if (!panel) return;
    const latest = index.latestUpdatedAt
      ? new Date(index.latestUpdatedAt).toLocaleString('zh-CN', { hour12: false })
      : '尚未更新';
    const fresh = Boolean(index.fresh);
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div class="index-status-main">
        <span class="index-status-badge ${fresh ? 'is-ok' : 'is-warning'}">${fresh ? '索引正常' : '需要关注'}</span>
        <div>
          <strong>${escapeHtml(index.recommendation || (fresh ? '索引可用' : '建议重建索引'))}</strong>
          <p>索引记录 ${escapeHtml(String(index.count || 0))} 个文件，占用 ${escapeHtml(index.totalSizeFormatted || '0 B')}，最后更新：${escapeHtml(latest)}</p>
        </div>
      </div>
      <div class="index-status-actions">
        <span>${index.sampleTruncated ? 'R2 抽样已达上限' : `R2 抽样 ${escapeHtml(String(index.sampleCount || 0))} 个可见文件`}</span>
        <button class="btn h-8 px-3" data-admin-action="maintenance-action" data-args='["rebuild-index"]'>重建索引</button>
      </div>
    `;
  },

  healthItem(label, ok, detail = '') {
    return `
      <div class="health-item ${ok ? 'is-ok' : 'is-bad'}">
        <div>
          <strong>${escapeHtml(label)}</strong>
          ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
        </div>
        <em>${ok ? '正常' : '异常'}</em>
      </div>
    `;
  },

  adminCredentialsHealthItem(usernameOk, passwordOk, guestEnabled, tokenSecret = {}) {
    const tokenSecretOk = Boolean(tokenSecret.configured && tokenSecret.recommended);
    const rows = [
      ['管理员用户名', usernameOk, '环境变量 ADMIN_USERNAME'],
      ['管理员密码', passwordOk, '环境变量 ADMIN_PASSWORD'],
      ['签名密钥', tokenSecretOk, tokenSecret.configured ? 'TOKEN_SECRET 已配置' : '建议配置 TOKEN_SECRET，当前回退到 ADMIN_PASSWORD'],
      ['访客访问', true, guestEnabled ? 'ALLOW_GUEST=true，访客可浏览' : '默认关闭；只有 ALLOW_GUEST=true 才开启'],
    ];

    return rows.map(([label, ok, detail]) => this.healthItem(label, ok, detail)).join('');
  },

  async loadHealth() {
    const grid = document.getElementById('healthGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="text-sm text-slate-500">正在检查...</div>';
    const { res, data } = await api.adminHealth();
    if (!res.ok) {
      grid.innerHTML = '<div class="text-sm text-rose-600 font-bold">环境检查失败，请重新登录后再试。</div>';
      return;
    }

    const tableList = summarizeD1Tables(data.db?.tables);

    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    const warningsHtml = warnings.length
      ? `
        <div class="health-item health-item-wide is-bad">
          <div>
            <strong>系统提醒</strong>
            <span>${escapeHtml(warnings.map(item => `${item.source}: ${item.message}`).join('；'))}</span>
          </div>
          <em>${warnings.length} 条</em>
        </div>
      `
      : '';

    grid.innerHTML = [
      this.healthItem('D1 数据库绑定 D1', Boolean(data.db?.ok), data.db?.message || tableList),
      this.healthItem('R2 存储绑定 R2', Boolean(data.r2?.ok), data.r2?.message || '文件读写使用该 Bucket'),
      this.adminCredentialsHealthItem(Boolean(data.env?.adminUsername), Boolean(data.env?.adminPassword), Boolean(data.env?.guestEnabled), data.env?.tokenSecret || {}),
      warningsHtml,
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
    const grids = ['healthMaintenanceGrid']
      .map(id => document.getElementById(id))
      .filter(Boolean);
    if (!grids.length) return;
    grids.forEach(grid => {
      grid.innerHTML = '<div class="text-sm text-slate-500">正在检查...</div>';
    });
    const { res, data } = await api.maintenance();
    if (!res.ok) {
      grids.forEach(grid => {
        grid.innerHTML = '<div class="text-sm text-rose-600 font-bold">维护信息加载失败。</div>';
      });
      return;
    }
    const latestIndexUpdate = data.indexLatestUpdatedAt
      ? new Date(data.indexLatestUpdatedAt).toLocaleString('zh-CN', { hour12: false })
      : '尚未更新';
    const indexDetail = data.r2SampleTruncated
      ? `索引占用 ${data.indexTotalSizeFormatted || '0 B'}，R2 抽样已达上限`
      : `R2 当前抽样 ${data.r2SampleCount || 0} 个可见文件`;
    const html = [
      this.maintenanceItem('文件索引记录', data.indexCount || 0, indexDetail),
      this.maintenanceItem('索引最后更新', latestIndexUpdate, data.indexFresh ? '索引与当前抽样一致' : '建议重建文件索引'),
      this.maintenanceItem('访问失败记录', data.accessAttemptCount || 0, '受保护路径的密码错误记录'),
      this.maintenanceItem('回收站记录', data.trashCount || 0, '可回收站占用 R2 空间'),
      this.maintenanceItem('操作日志', data.logsCount || 0, '管理员操作记录'),
      this.maintenanceItem('缩略图缓存', data.thumbnailsPresent ? '有' : '无', '.thumbs/ 系统前缀'),
    ].join('');
    grids.forEach(grid => { grid.innerHTML = html; });
  },

  async runMaintenanceAction(action) {
    const names = {
      'rebuild-index': ['重建文件索引？', '重建会重新扫描 R2 文件并刷新统计索引。'],
      'cleanup-access-attempts': ['清理访问失败记录？', '这会移除受保护路径的密码错误计数。'],
      'cleanup-thumbnails': ['清理缩略图缓存？', '缩略图会在后续预览时重新生成。'],
      'cleanup-logs': ['清理旧操作日志？', '将保留最近 2000 条和最近 90 天内的操作日志。'],
    };
    const confirmText = names[action];
    if (confirmText && !(await adminConfirm(confirmText[0], confirmText[1]))) return;
    setMaintenanceResult('正在执行...');
    const { res, data } = await api.maintenanceAction(action);
    if (!res.ok || data?.success === false) {
      setMaintenanceResult(data?.message || '维护操作失败');
      return;
    }
    const summary = data.synced != null
      ? `已同步 ${data.synced} 个文件${data.truncated ? '（已达扫描上限）' : ''}`
      : `已清理 ${data.deleted || 0} 项${data.truncated ? '（已达扫描上限）' : ''}`;
    setMaintenanceResult(summary);
    await this.loadMaintenance();
    if (adminState.activeTab === 'overview') await this.loadStats();
    if (adminState.activeTab === 'logs') await this.loadLogs();
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
        body: '当前最多扫描 20000 个文件，实际文件数可能更多。建议分目录管理，避免单次操作耗时过长。'
      });
    }
    if (fileCount >= 15000) {
      warnings.push({
        level: 'info',
        title: '文件数量较多',
        body: `当前已统计 ${fileCount} 个文件，跨目录复制、移动、删除时可能耗时较长。`
      });
    }
    if (trashCount >= 100 || trashSize > Math.max(totalSize * 0.2, 1024 * 1024 * 1024)) {
      warnings.push({
        level: 'warning',
        title: '回收站占用偏大',
        body: `回收站有 ${trashCount} 项，占用 ${data.trash?.sizeFormatted || '0 B'}，建议及时清理或设置自动清理以释放空间。`
      });
    }
    if (totalSize >= 50 * 1024 * 1024 * 1024) {
      warnings.push({
        level: 'info',
        title: '存储容量较大',
        body: '建议定期检查文件和回收站，避免长期保存重复上传的临时文件。'
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
    const filters = adminState.logFilters || {};
    const inputMap = {
      logFilterQuery: filters.q || '',
      logFilterAction: filters.action || '',
      logFilterIp: filters.ip || '',
      logFilterFrom: filters.from || '',
      logFilterTo: filters.to || '',
    };
    Object.entries(inputMap).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input && input.value !== value) input.value = value;
    });
    const { res, data } = await api.adminLogs(adminState.currentPage, LOG_PAGE_SIZE, adminState.logFilters || {});
    if (res.status !== 200) return window.location.href = '/';
    adminState.totalPages = data.totalPages || 1;
    document.getElementById('totalPages').textContent = adminState.totalPages;
    document.getElementById('currentPage').textContent = adminState.currentPage;
    setLogPaginationState();
    const rows = data.logs || [];
    const html = rows.map(l => {
      const time = new Date(l.timestamp).toLocaleString('zh-CN', { hour12: false });
      const actionClass = logActionClass(l.action);
      const actionLabel = describeLogAction(l.action);
      return `
        <div class="log-card">
          <div class="log-card-time">${escapeHtml(time)}</div>
          <div class="log-card-main">
            <span class="admin-action-badge ${actionClass}" title="${escapeHtml(l.action || '')}">${escapeHtml(actionLabel)}</span>
            <strong>${escapeHtml(l.details || '无详情')}</strong>
          </div>
          <div class="log-card-ip">${escapeHtml(l.ip || '-')}</div>
        </div>
      `;
    }).join('') || '<div class="log-empty">暂无操作日志</div>';
    const list = document.getElementById('logList');
    if (list) list.innerHTML = html;
    const tbody = document.getElementById('logTbody');
    if (tbody) tbody.innerHTML = rows.map(l => `
      <tr>
        <td>${escapeHtml(new Date(l.timestamp).toLocaleString('zh-CN', { hour12: false }))}</td>
        <td>${escapeHtml(describeLogAction(l.action))}</td>
        <td>${escapeHtml(l.details || '')}</td>
        <td>${escapeHtml(l.ip || '')}</td>
      </tr>
    `).join('');
  },

  changePage(dir) {
    const next = adminState.currentPage + dir;
    if (next >= 1 && next <= adminState.totalPages) {
      adminState.currentPage = next;
      this.loadLogs();
    }
  },

  applyLogFilters() {
    adminState.logFilters = {
      q: document.getElementById('logFilterQuery')?.value.trim() || '',
      action: document.getElementById('logFilterAction')?.value.trim().toUpperCase() || '',
      ip: document.getElementById('logFilterIp')?.value.trim() || '',
      from: document.getElementById('logFilterFrom')?.value || '',
      to: document.getElementById('logFilterTo')?.value || '',
    };
    adminState.currentPage = 1;
    return this.loadLogs();
  },

  resetLogFilters() {
    adminState.logFilters = { q: '', action: '', ip: '', from: '', to: '' };
    ['logFilterQuery', 'logFilterAction', 'logFilterIp', 'logFilterFrom', 'logFilterTo'].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });
    adminState.currentPage = 1;
    return this.loadLogs();
  },

  async loadAccessRules() {
    const list = document.getElementById('accessRuleList') || document.getElementById('accessTbody');
    const count = document.getElementById('accessRuleCount');
    const hiddenCount = document.getElementById('accessHiddenCount');
    const protectedCount = document.getElementById('accessProtectedCount');
    const privateCount = document.getElementById('accessPrivateCount');
    if (!list) return;
    list.innerHTML = '<div class="access-empty">正在加载...</div>';
    if (count) count.textContent = '0 条规则';
    [hiddenCount, protectedCount, privateCount].forEach(el => {
      if (el) el.textContent = '0';
    });
    const [hiddenRes, protectedRes] = await Promise.all([api.hiddenPaths(), api.protectedPaths()]);
    const hiddenList = hiddenRes.data?.list || [];
    const protectedList = protectedRes.data?.list || [];
    const byPath = new Map();
    hiddenList.forEach(item => {
      const row = byPath.get(item.path) || { path: item.path };
      row.hidden = true;
      byPath.set(item.path, row);
    });
    protectedList.forEach(item => {
      const row = byPath.get(item.path) || { path: item.path };
      row.protected = true;
      row.note = item.note || '';
      row.showName = Boolean(item.show_name);
      byPath.set(item.path, row);
    });
    const rows = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
    if (count) count.textContent = `${rows.length} 条规则`;
    if (hiddenCount) hiddenCount.textContent = String(rows.filter(item => item.hidden).length);
    if (protectedCount) protectedCount.textContent = String(rows.filter(item => item.protected).length);
    if (privateCount) privateCount.textContent = String(rows.filter(item => item.hidden && item.protected).length);
    list.innerHTML = rows.map(item => {
      const path = escapeHtml(item.path);
      const hiddenBadge = item.hidden
        ? '<span class="admin-status-badge is-hidden">已隐藏</span>'
        : '<span class="admin-status-badge is-visible">可见</span>';
      const protectedBadge = item.protected
        ? '<span class="admin-status-badge is-visible">需要密码</span>'
        : '<span class="admin-status-badge is-hidden">不需要</span>';
      const nameVisible = item.protected
        ? (item.showName ? '<span class="access-rule-note">名称可见</span>' : '<span class="access-rule-note">名称隐藏</span>')
        : '';
      const actions = [
        item.hidden ? `<button class="admin-danger-btn" data-admin-action="remove-hidden" data-args='${escapeHtml(JSON.stringify([item.path]))}'>取消隐藏</button>` : '',
        item.protected ? `<button class="admin-danger-btn" data-admin-action="remove-protected" data-args='${escapeHtml(JSON.stringify([item.path]))}'>删除密码</button>` : '',
      ].filter(Boolean).join('');
      return `
        <div class="access-rule-card">
          <div class="access-rule-main">
            <strong>${path}</strong>
            <span>${escapeHtml(item.note || '无备注')}</span>
          </div>
          <div class="access-rule-states">
            ${hiddenBadge}
            ${protectedBadge}
            ${nameVisible}
          </div>
          <div class="access-rule-actions">${actions || '<span class="access-rule-note">无可用操作</span>'}</div>
        </div>
      `;
    }).join('') || '<div class="access-empty">暂无访问控制规则</div>';
  },

  setAccessPreset(mode = '') {
    const hide = document.getElementById('accessHideInput');
    const showName = document.getElementById('protectedShowNameInput');
    const password = document.getElementById('protectedPasswordInput');
    const path = document.getElementById('protectedPathInput');
    if (hide) hide.checked = mode === 'hide' || mode === 'private';
    if (showName) showName.checked = mode !== 'private';
    if (mode === 'hide') {
      if (password) password.value = '';
      path?.focus();
      return;
    }
    password?.focus();
  },

  async saveAccessRule() {
    const path = document.getElementById('protectedPathInput')?.value.trim();
    const password = document.getElementById('protectedPasswordInput')?.value || '';
    const note = document.getElementById('protectedNoteInput')?.value.trim() || '';
    const showName = Boolean(document.getElementById('protectedShowNameInput')?.checked);
    const hide = Boolean(document.getElementById('accessHideInput')?.checked);
    if (!path) return;
    if (hide) await api.addHiddenPath(path);
    if (password) await api.addProtectedPath({ path, password, note, showName });
    document.getElementById('protectedPathInput').value = '';
    document.getElementById('protectedPasswordInput').value = '';
    document.getElementById('protectedNoteInput').value = '';
    document.getElementById('protectedShowNameInput').checked = true;
    document.getElementById('accessHideInput').checked = false;
    await this.loadAccessRules();
  },

  async removeHidden(p) {
    if (await adminConfirm('取消隐藏路径？', `路径 ${p} 将恢复可见。`)) {
      await api.removeHiddenPath(p);
      this.loadAccessRules();
    }
  },

  async removeProtected(p) {
    if (await adminConfirm('删除访问密码？', `路径 ${p} 将允许所有人访问。`)) {
      await api.removeProtectedPath(p);
      this.loadAccessRules();
    }
  },

  async loadQuota() {
    const info = document.getElementById('quotaInfo');
    const result = document.getElementById('quotaResult');
    if (result) result.textContent = '';
    if (!info) return;
    info.innerHTML = '<div class="quota-empty">正在加载...</div>';
    const { res, data } = await api.adminQuota();
    if (!res.ok) {
      info.innerHTML = '<div class="quota-empty is-error">加载配额信息失败。</div>';
      return;
    }
    const quotaLabel = data.quota > 0 ? data.quotaFormatted : '无限制';
    const usedPercent = data.quota > 0 ? Math.round((data.used / data.quota) * 100) : 0;
    const remainingLabel = data.quota > 0 ? `${formatBytesLocal(data.remaining)} 剩余` : '无限制';
    const quotaLimit = document.getElementById('quotaLimitValue');
    const quotaUsed = document.getElementById('quotaUsedValue');
    const quotaRemaining = document.getElementById('quotaRemainingValue');
    const quotaPercent = document.getElementById('quotaPercentValue');
    const usageBar = document.getElementById('quotaUsageBar');
    if (quotaLimit) quotaLimit.textContent = quotaLabel;
    if (quotaUsed) quotaUsed.textContent = data.usedFormatted || '0 B';
    if (quotaRemaining) quotaRemaining.textContent = remainingLabel;
    if (quotaPercent) quotaPercent.textContent = `${usedPercent}%`;
    if (usageBar) usageBar.style.width = `${Math.max(0, Math.min(100, usedPercent))}%`;
    info.innerHTML = `
      <div class="quota-note-card">
        <strong>${data.quota > 0 ? '配额已启用' : '当前不限制容量'}</strong>
        <span>${data.quota > 0 ? `已使用 ${data.usedFormatted || '0 B'}，剩余 ${formatBytesLocal(data.remaining)}。` : '上传不会受总容量限制，仍建议定期清理回收站和临时文件。'}</span>
      </div>
    `;
    const input = document.getElementById('quotaInput');
    if (input && data.quota > 0) input.value = data.quota;
  },

  fillQuota(bytes) {
    const input = document.getElementById('quotaInput');
    if (input) input.value = bytes;
  },

  async setQuota() {
    const input = document.getElementById('quotaInput');
    const result = document.getElementById('quotaResult');
    const bytes = Number(input?.value || 0);
    if (bytes < 0) { if (result) result.textContent = '配额不能为负数'; return; }
    const confirmTitle = bytes > 0 ? '保存存储配额？' : '取消存储配额限制？';
    const confirmBody = bytes > 0 ? `新的配额为 ${formatBytesLocal(bytes)}。` : '取消后上传不再受总量配额限制。';
    if (!(await adminConfirm(confirmTitle, confirmBody))) return;
    if (result) result.textContent = '正在保存...';
    const { res, data } = await api.setAdminQuota(bytes);
    if (!res.ok || data?.success === false) {
      if (result) result.textContent = data?.message || '保存失败';
      return;
    }
    if (result) result.textContent = bytes > 0 ? `配额已设为 ${formatBytesLocal(bytes)}` : '已取消配额限制';
    await this.loadQuota();
  },

  async loadWebhooks() {
    const list = document.getElementById('webhookList');
    setWebhookResult();
    setWebhookListCount(0);
    if (!list) return;
    list.innerHTML = '<div class="text-sm text-slate-500">正在加载...</div>';
    const { res, data } = await api.adminWebhooks();
    if (!res.ok) {
      list.innerHTML = '<div class="text-sm text-rose-600 font-bold">加载失败。</div>';
      return;
    }
    const items = normalizeWebhookItems(data);
    if (adminState.webhookEditingIndex >= items.length) adminState.webhookEditingIndex = -1;
    setWebhookListCount(items.length);
    if (items.length === 0) {
      adminState.webhookEditingIndex = -1;
      setWebhookFormMode();
      list.innerHTML = '<div class="webhook-empty">暂未配置 Webhook。</div>';
      return;
    }
    list.innerHTML = items.map((item, i) => `
      <div class="webhook-row ${i === adminState.webhookEditingIndex ? 'is-editing' : ''}">
        <div class="webhook-row-main">
          <div class="webhook-row-head">
            <span class="webhook-type-badge">${escapeHtml(item.method || 'POST')}</span>
            <span class="webhook-type-badge">格式 ${escapeHtml(item.msgtype || 'json')}</span>
            <strong class="webhook-row-title">${escapeHtml(item.name || `Webhook #${i + 1}`)}</strong>
          </div>
          <div class="webhook-url">${escapeHtml(item.url)}</div>
          <div class="webhook-meta">
            <span>${escapeHtml(item.contentType || 'application/json')}</span>
            <span>${escapeHtml(webhookEventsLabel(item.events))}</span>
            ${Object.keys(item.headers || {}).length ? '<span>headers</span>' : ''}
            ${item.body ? '<span>body</span>' : ''}
          </div>
        </div>
        <div class="webhook-row-actions">
          <div class="webhook-row-buttons">
            <button class="btn h-8 px-3" data-admin-action="edit-webhook" data-args='${escapeHtml(JSON.stringify([i]))}'>编辑</button>
            <button class="btn h-8 px-3" data-admin-action="test-webhook" data-args='${escapeHtml(JSON.stringify([i]))}'>测试发送</button>
            <button class="admin-danger-btn" data-admin-action="remove-webhook" data-args='${escapeHtml(JSON.stringify([i]))}'>删除</button>
          </div>
          <p class="webhook-row-status" data-webhook-status="${i}" role="status" aria-live="polite"></p>
        </div>
      </div>
    `).join('');
    setWebhookFormMode(items[adminState.webhookEditingIndex]);
  },

  async loadWebhookDeliveries() {
    const list = document.getElementById('webhookDeliveriesList');
    if (!list) return;
    list.innerHTML = '<div class="webhook-empty">正在加载投递记录...</div>';
    const { res, data } = await api.adminWebhookDeliveries();
    if (!res.ok) {
      list.innerHTML = '<div class="webhook-empty">投递记录加载失败。</div>';
      return;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      list.innerHTML = '<div class="webhook-empty">暂无投递记录。</div>';
      return;
    }
    list.innerHTML = items.map(item => {
      const status = Number(item.status || item.status_code || 0);
      const ok = status >= 200 && status < 300;
      const event = item.event || item.event_type || 'webhook';
      const target = item.url || item.endpoint || item.name || 'Webhook';
      const error = item.error || item.error_message || '';
      return `
        <div class="webhook-delivery-row">
          <div class="webhook-delivery-head">
            <strong>${escapeHtml(event)}</strong>
            <span class="status-pill ${ok ? 'is-ok' : 'is-bad'}">${status || (ok ? 'OK' : '失败')}</span>
          </div>
          <div class="webhook-delivery-meta">
            <span>${escapeHtml(target)}</span>
            <span>${escapeHtml(adminTime(item.created_at || item.createdAt))}</span>
            ${item.duration_ms || item.durationMs ? `<span>${escapeHtml(String(item.duration_ms || item.durationMs))}ms</span>` : ''}
          </div>
          ${error ? `<div class="webhook-delivery-meta"><span>${escapeHtml(error)}</span></div>` : ''}
        </div>
      `;
    }).join('');
  },

  async loadTasks() {
    const list = document.getElementById('taskList');
    if (!list) return;
    list.innerHTML = '<div class="task-empty">正在加载任务...</div>';
    const runningCount = document.getElementById('taskRunningCount');
    const completedCount = document.getElementById('taskCompletedCount');
    const failedCount = document.getElementById('taskFailedCount');
    [runningCount, completedCount, failedCount].forEach(el => {
      if (el) el.textContent = '0';
    });
    const { res, data } = await api.fileTasks(30);
    if (!res.ok) {
      list.innerHTML = '<div class="task-empty">任务加载失败。</div>';
      return;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    if (runningCount) runningCount.textContent = String(items.filter(item => ['running', 'queued'].includes(item.status)).length);
    if (completedCount) completedCount.textContent = String(items.filter(item => item.status === 'completed').length);
    if (failedCount) failedCount.textContent = String(items.filter(item => ['failed', 'partial'].includes(item.status)).length);
    if (!items.length) {
      list.innerHTML = '<div class="task-empty">暂无后台任务。</div>';
      return;
    }
    list.innerHTML = items.map(item => {
      const total = Math.max(Number(item.total || 0), 0);
      const completed = Math.max(Number(item.completed || 0), 0);
      const failed = Math.max(Number(item.failed || 0), 0);
      const done = Math.min(total || completed + failed || 1, completed + failed);
      const pct = total ? Math.round((done / total) * 100) : (item.status === 'completed' ? 100 : 0);
      const typeLabel = item.type === 'paste' ? '复制/移动' : item.type === 'delete' ? '删除' : item.type;
      return `
        <div class="task-row">
          <div class="task-row-head">
            <strong>${escapeHtml(typeLabel || '任务')}</strong>
            <span class="status-pill ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
          </div>
          <div class="task-progress"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>
          <div class="task-row-count">${Math.max(0, Math.min(100, pct))}%</div>
          <div class="task-row-meta">
            <span>完成 ${completed}/${total || '-'}</span>
            ${failed ? `<span>失败 ${failed}</span>` : ''}
            <span>创建 ${escapeHtml(adminTime(item.createdAt))}</span>
            ${item.finishedAt ? `<span>结束 ${escapeHtml(adminTime(item.finishedAt))}</span>` : ''}
          </div>
          ${item.error ? `<div class="task-row-meta"><span>${escapeHtml(item.error)}</span></div>` : ''}
        </div>
      `;
    }).join('');
  },

  async addWebhook() {
    let next;
    try {
      next = readWebhookForm();
    } catch (err) {
      setWebhookResult(err.message || 'headers 不是有效 JSON', 'error');
      return;
    }
    if (!next.url || !next.url.startsWith('http')) {
      setWebhookResult('请输入有效的 http(s) URL', 'error');
      return;
    }
    const { data } = await api.adminWebhooks();
    const current = normalizeWebhookItems(data);
    const editingIndex = adminState.webhookEditingIndex;
    const editingItem = editingIndex >= 0 ? current[editingIndex] : null;
    let updated = Boolean(editingItem);
    if (editingItem) {
      current[editingIndex] = { ...editingItem, ...next, id: editingItem.id };
    } else {
      const existingIndex = current.findIndex(item => item.url === next.url);
      if (existingIndex >= 0) {
        current[existingIndex] = { ...current[existingIndex], ...next, id: current[existingIndex].id };
        updated = true;
      } else {
        current.push(next);
      }
    }
    setWebhookResult('正在保存...', 'muted');
    const { res, data: saveData } = await api.setAdminWebhooks(current);
    if (!res.ok || saveData?.success === false) {
      setWebhookResult(saveData?.message || '保存失败', 'error');
      return;
    }
    adminState.webhookEditingIndex = -1;
    setWebhookForm();
    await this.loadWebhooks();
    setWebhookResult(updated ? 'Webhook 已更新' : `已添加，共 ${current.length} 个 Webhook`, 'success');
  },

  async editWebhook(index) {
    const { data } = await api.adminWebhooks();
    const current = normalizeWebhookItems(data);
    const item = current[index];
    if (!item) return;
    adminState.webhookEditingIndex = index;
    setWebhookForm(item);
    setWebhookFormMode(item);
    document.getElementById('webhookSettingsBody')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async removeWebhook(index) {
    const { data } = await api.adminWebhooks();
    const current = normalizeWebhookItems(data);
    if (index < 0 || index >= current.length) return;
    if (!(await adminConfirm('删除 Webhook？', current[index].name || current[index].url))) return;
    const removed = current.splice(index, 1);
    setWebhookResult('正在保存...', 'muted');
    const { res } = await api.setAdminWebhooks(current);
    if (!res.ok) {
      setWebhookResult('删除失败', 'error');
      return;
    }
    if (adminState.webhookEditingIndex === index) {
      adminState.webhookEditingIndex = -1;
      setWebhookForm();
    } else if (adminState.webhookEditingIndex > index) {
      adminState.webhookEditingIndex -= 1;
    }
    await this.loadWebhooks();
    setWebhookResult(`已删除 ${removed[0].name || removed[0].url}`, 'success');
  },

  async testWebhook(index) {
    setWebhookResult();
    const { data } = await api.adminWebhooks();
    const current = normalizeWebhookItems(data);
    const endpoint = current[index];
    if (!endpoint) return;
    setWebhookRowStatus(index, '正在发送测试通知...', 'muted');
    const { res, data: testData } = await api.testAdminWebhook(endpoint);
    if (!res.ok || testData?.success === false) {
      setWebhookRowStatus(index, testData?.message || '测试发送失败，请检查 URL、平台类型或签名配置。', 'error');
      return;
    }
    setWebhookRowStatus(index, '测试发送成功', 'success');
  },
};

Object.assign(AdminActions, createAdminShareActions({ adminConfirm }));

function formatBytesLocal(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
}
