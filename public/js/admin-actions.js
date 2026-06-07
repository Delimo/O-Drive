import { adminState } from './admin-state.js';
import { api } from './api.js';
import { escapeHtml } from './utils.js';

const LOG_PAGE_SIZE = 8;
const WEBHOOK_EVENT_OPTIONS = [
  ['file.uploaded', '上传'],
  ['file.deleted', '删除'],
  ['file.purged', '彻底删除'],
  ['file.moved', '移动'],
  ['file.copied', '复制'],
  ['file.renamed', '重命名'],
  ['folder.created', '新建文件夹'],
  ['download.burst', '大量下载'],
  ['login.burst', '登录异常'],
];
const WEBHOOK_EVENT_KEYS = WEBHOOK_EVENT_OPTIONS.map(([key]) => key);
export const ADMIN_TABS = ['overview', 'health', 'logs', 'privacy', 'protected', 'quota', 'shares', 'webhooks'];

export function getInitialAdminTab() {
  const tab = (window.location.hash || '').replace(/^#/, '');
  return ADMIN_TABS.includes(tab) ? tab : 'overview';
}

function describeLogAction(action = '') {
  const normalized = String(action || '').toUpperCase();
  const labels = {
    UPLOAD: '上传文件',
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
    QUOTA: '存储配额',
    WEBHOOKS: 'Webhook 配置',
    WEBHOOK_TEST: 'Webhook 测试',
    SHARE_CREATE: '创建分享',
    SHARE_DELETE: '删除分享',
    SHARE_CLEANUP: '清理分享',
    TRASH: '回收站',
    RESTORE: '恢复文件',
    PURGE: '彻底删除',
    TRASH_CLEAR: '清空回收站',
    TRASH_CLEANUP: '清理回收站',
    TRASH_RETENTION: '回收站保留期',
    SAVE_TEXT: '保存文本',
    UPLOAD_CONFLICT: '上传冲突',
  };
  return labels[normalized] || normalized.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()) || '未知操作';
}

function logActionClass(action = '') {
  const normalized = String(action || '').toUpperCase();
  if (normalized.includes('DELETE') || normalized.includes('ABORT') || normalized.includes('PURGE') || normalized.includes('CLEAR')) return 'is-delete';
  if (normalized.includes('UPLOAD') || normalized.includes('CREATE') || normalized.includes('MKDIR')) return 'is-upload';
  return 'is-default';
}

function normalizeWebhookItems(data = {}) {
  const source = Array.isArray(data.items) ? data.items : [];
  return source.map((item, index) => ({
    id: item.id || `${Date.now()}-${index}`,
    name: item.name || '',
    msgtype: ['json', 'text', 'markdown'].includes(item.msgtype)
      ? item.msgtype
      : 'json',
    url: item.url || '',
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(item.method || '').toUpperCase())
      ? String(item.method).toUpperCase()
      : 'POST',
    contentType: item.contentType || 'application/json',
    headers: item.headers && typeof item.headers === 'object' && !Array.isArray(item.headers) ? item.headers : {},
    body: item.body || '',
    events: Array.isArray(item.events)
      ? [...new Set(item.events.map(event => String(event || '').trim()).filter(event => WEBHOOK_EVENT_KEYS.includes(event)))]
      : [],
    enabled: item.enabled !== false,
  })).filter(item => item.url);
}

function selectedWebhookEvents() {
  return [...document.querySelectorAll('input[name="webhookEvents"]:checked')]
    .map(input => input.value)
    .filter(value => WEBHOOK_EVENT_KEYS.includes(value));
}

function setWebhookEvents(events = []) {
  const selected = Array.isArray(events) && events.length ? new Set(events) : new Set(WEBHOOK_EVENT_KEYS);
  document.querySelectorAll('input[name="webhookEvents"]').forEach(input => {
    input.checked = selected.has(input.value);
  });
}

function webhookEventsLabel(events = []) {
  if (!Array.isArray(events) || events.length === 0 || events.length === WEBHOOK_EVENT_KEYS.length) return '全部事件';
  return events.map(event => WEBHOOK_EVENT_OPTIONS.find(([key]) => key === event)?.[1] || event).join('、');
}

function adminConfirm(title, body = '') {
  if (typeof window.showConfirm === 'function') return window.showConfirm(title, body);
  return Promise.resolve(confirm([title, body].filter(Boolean).join('\n\n')));
}

function setMaintenanceResult(text = '') {
  const label = document.getElementById('healthMaintenanceResult');
  if (label) label.textContent = text;
}

function headersToText(headers = {}) {
  return Object.keys(headers).length ? JSON.stringify(headers, null, 2) : '';
}

function parseHeadersText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('headers 必须是 JSON 对象');
  return parsed;
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
    item.classList.add('hidden');
    item.classList.remove('is-error', 'is-muted');
  });
  status.textContent = text;
  status.classList.toggle('hidden', !text);
  status.classList.toggle('is-error', tone === 'error');
  status.classList.toggle('is-muted', tone === 'muted');
}

async function renderWebhookDeliveries() {
  const box = document.getElementById('webhookDeliveries');
  if (!box) return;
  const { res, data } = await api.adminWebhookDeliveries();
  if (!res.ok) {
    box.innerHTML = '';
    return;
  }
  const items = data.items || [];
  if (!items.length) {
    box.innerHTML = '<div class="webhook-empty">暂无发送记录。</div>';
    return;
  }
  box.innerHTML = [
    '<div class="webhook-block-title">最近发送</div>',
    ...items.map(item => {
      const ok = Number(item.ok || 0) === 1;
      const time = item.created_at ? new Date(Number(item.created_at)).toLocaleString('zh-CN', { hour12: false }) : '-';
      const status = item.status ? `HTTP ${item.status}` : (item.error || '-');
      return `
        <div class="webhook-delivery-row ${ok ? 'is-ok' : 'is-bad'}">
          <em>${ok ? '成功' : '失败'}</em>
          <strong title="${escapeHtml(item.url || '')}">${escapeHtml(item.event || '')} · ${escapeHtml(item.endpoint || item.url || '')}</strong>
          <span>${escapeHtml(status)} · ${escapeHtml(String(item.duration_ms || 0))}ms · ${escapeHtml(time)}</span>
        </div>
      `;
    }),
  ].join('');
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

function shareLink(token) {
  return new URL(`/share.html?token=${encodeURIComponent(token)}`, window.location.origin).href;
}

function shareTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '长期有效';
}

function setSharesResult(text = '', tone = 'muted') {
  const result = document.getElementById('sharesResult');
  if (!result) return;
  result.textContent = text;
  result.classList.toggle('text-rose-600', tone === 'error');
  result.classList.toggle('text-emerald-700', tone === 'success');
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
    if (options.persist !== false && window.location.hash !== `#${tabId}`) {
      history.replaceState(null, '', `#${tabId}`);
    }

    if (tabId === 'overview') return this.loadStats();
    if (tabId === 'health') return Promise.all([this.loadHealth(), this.loadMaintenance()]);
    if (tabId === 'logs') return this.loadLogs();
    if (tabId === 'privacy') return this.loadHidden();
    if (tabId === 'quota') return this.loadQuota();
    if (tabId === 'shares') return this.loadShares();
    if (tabId === 'webhooks') return this.loadWebhooks();
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

  adminCredentialsHealthItem(usernameOk, passwordOk, guestEnabled) {
    const rows = [
      ['管理员用户名', usernameOk, '环境变量 ADMIN_USERNAME'],
      ['管理员密码', passwordOk, '环境变量 ADMIN_PASSWORD'],
      ['访客访问', true, guestEnabled ? 'ALLOW_GUEST=true，访客可浏览' : '默认关闭；只有 ALLOW_GUEST=true 才开启'],
    ];

    return `
      <div class="health-item health-credentials-item ${usernameOk && passwordOk ? 'is-ok' : 'is-bad'}">
        <div class="health-credentials-head">
          <strong>登录与访问</strong>
          <span>管理员凭据和访客访问状态</span>
        </div>
        <div class="health-credentials-list">
          ${rows.map(([label, ok, detail]) => `
            <div class="health-credential-row ${ok ? 'is-ok' : 'is-bad'}">
              <div>
                <strong>${escapeHtml(label)}</strong>
                <span>${escapeHtml(detail)}</span>
              </div>
              <em>${ok ? '正常' : '异常'}</em>
            </div>
          `).join('')}
        </div>
      </div>
    `;
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

    const tableList = Array.isArray(data.db?.tables) && data.db.tables.length
      ? `已存在表：${data.db.tables.join(', ')}`
      : '所需表会在功能首次使用时自动创建';

    grid.innerHTML = [
      this.healthItem('D1 数据库绑定 D1', Boolean(data.db?.ok), data.db?.message || tableList),
      this.healthItem('R2 存储绑定 R2', Boolean(data.r2?.ok), data.r2?.message || '文件读写使用该 Bucket'),
      this.adminCredentialsHealthItem(Boolean(data.env?.adminUsername), Boolean(data.env?.adminPassword), Boolean(data.env?.guestEnabled)),
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

  async loadHidden() {
    const { data } = await api.hiddenPaths();
    document.getElementById('hiddenTbody').innerHTML = (data?.list || []).map(i => {
      const path = escapeHtml(i.path);
      return `<tr class="admin-hidden-row hover:bg-slate-50 transition-colors"><td data-label="路径" class="px-5 py-4 font-mono text-primary break-all">${path}</td><td data-label="操作" class="px-5 py-4 text-right"><button class="admin-danger-btn" data-admin-action="remove-hidden" data-args='${escapeHtml(JSON.stringify([i.path]))}'>取消隐藏</button></td></tr>`;
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
    if (await adminConfirm('取消隐藏路径？', `路径 ${p} 将恢复可见。`)) {
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
    }).join('') || '<tr><td colspan="4"><div class="admin-empty-state">暂无受保护路径</div></td></tr>';
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
    if (await adminConfirm('删除访问密码？', `路径 ${p} 将允许所有人访问。`)) {
      await api.removeProtectedPath(p);
      this.loadProtected();
    }
  },

  async loadQuota() {
    const info = document.getElementById('quotaInfo');
    const result = document.getElementById('quotaResult');
    if (result) result.textContent = '';
    if (!info) return;
    info.innerHTML = '<div class="text-sm text-slate-500">正在加载...</div>';
    const { res, data } = await api.adminQuota();
    if (!res.ok) {
      info.innerHTML = '<div class="text-sm text-rose-600 font-bold">加载配额信息失败。</div>';
      return;
    }
    const quotaLabel = data.quota > 0 ? data.quotaFormatted : '无限制';
    const usedPercent = data.quota > 0 ? Math.round((data.used / data.quota) * 100) : 0;
    const remainingLabel = data.quota > 0 ? `${formatBytesLocal(data.remaining)} 剩余` : '无限制';
    info.innerHTML = [
      this.maintenanceItem('存储配额', quotaLabel, data.quota > 0 ? `已用 ${usedPercent}%` : '未设置上限'),
      this.maintenanceItem('已使用', data.usedFormatted, `${usedPercent}%`),
      this.maintenanceItem('剩余空间', remainingLabel, ''),
    ].join('');
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

  async loadShares() {
    const tbody = document.getElementById('sharesTbody');
    if (!tbody) return;
    setSharesResult();
    tbody.innerHTML = '<tr><td colspan="4"><div class="admin-empty-state">正在加载...</div></td></tr>';
    const { res, data } = await api.adminShares();
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="4"><div class="admin-empty-state">分享链接加载失败</div></td></tr>';
      return;
    }
    const rows = data.items || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4"><div class="admin-empty-state">暂无分享链接</div></td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(item => {
      const expired = item.expired || item.exhausted;
      const status = item.exhausted ? '已达次数' : item.expired ? '已过期' : '有效';
      const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) : '-';
      const lastAccessedAt = item.lastAccessedAt ? new Date(item.lastAccessedAt).toLocaleString('zh-CN', { hour12: false }) : '尚未访问';
      const cleanupAt = item.autoDeleteAt ? new Date(item.autoDeleteAt).toLocaleString('zh-CN', { hour12: false }) : '';
      const statusHint = item.exhausted
        ? '已自动清理下载入口'
        : item.expired
          ? `自动清理：${cleanupAt || '超过 7 天后'}`
          : `访问：${lastAccessedAt}`;
      const policy = [
        `<span>过期 ${escapeHtml(shareTime(item.expiresAt))}</span>`,
        `<span>下载 ${escapeHtml(String(item.downloadCount || 0))}/${item.maxDownloads ? escapeHtml(String(item.maxDownloads)) : '不限'}</span>`,
      ].join('');
      return `
          <tr class="admin-share-row hover:bg-slate-50 transition-colors">
            <td data-label="文件" class="admin-share-file px-5 py-4">
              <div class="admin-share-name">${escapeHtml(item.name || item.path)}</div>
              <div class="admin-share-path">${escapeHtml(item.path)}</div>
            </td>
            <td data-label="策略" class="admin-share-policy px-5 py-4">
              <div class="admin-share-chips">${policy}</div>
              <div class="admin-share-subtle">创建：${escapeHtml(createdAt)}</div>
            </td>
            <td data-label="状态" class="admin-share-status px-5 py-4">
              <span class="admin-status-badge ${expired ? 'is-hidden' : 'is-visible'}">${status}</span>
              <small>${escapeHtml(statusHint)}</small>
            </td>
            <td data-label="操作" class="admin-share-actions px-5 py-4 text-right">
              <div class="admin-share-buttons">
                <button class="btn h-8 px-3" data-admin-action="copy-share" data-args='${escapeHtml(JSON.stringify([item.token]))}'>复制链接</button>
                <button class="admin-danger-btn" data-admin-action="delete-share" data-args='${escapeHtml(JSON.stringify([item.token]))}'>删除</button>
              </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async copyShare(token) {
    if (!token) return;
    const link = shareLink(token);
    try {
      await navigator.clipboard.writeText(link);
      setSharesResult('分享链接已复制', 'success');
    } catch (_) {
      setSharesResult(link, 'success');
    }
  },

  async deleteShare(token) {
    if (!token || !(await adminConfirm('删除分享链接？', '删除后该分享会立即失效，且不会留下分享记录。'))) return;
    const { res, data } = await api.deleteShare(token);
    if (!res.ok || data?.success === false) {
      setSharesResult(data?.message || '删除失败', 'error');
      return;
    }
    setSharesResult('分享链接已删除', 'success');
    await this.loadShares();
  },

  async cleanupShares() {
    if (!(await adminConfirm('清理过期分享？', '这是手动清理，会立即删除已过期或已达到下载次数限制的分享记录。'))) return;
    const { res, data } = await api.cleanupExpiredShares();
    if (!res.ok || data?.success === false) {
      setSharesResult(data?.message || '清理失败', 'error');
      return;
    }
    setSharesResult(`已清理 ${data.deleted || 0} 条分享记录`, 'success');
    await this.loadShares();
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
      await renderWebhookDeliveries();
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
          <p class="webhook-row-status hidden" data-webhook-status="${i}" role="status" aria-live="polite"></p>
        </div>
      </div>
    `).join('');
    setWebhookFormMode(items[adminState.webhookEditingIndex]);
    await renderWebhookDeliveries();
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
      await renderWebhookDeliveries();
      return;
    }
    setWebhookRowStatus(index, `${testData.name || 'Webhook'} 测试发送成功`, 'success');
    await renderWebhookDeliveries();
  },
};

function formatBytesLocal(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
}
