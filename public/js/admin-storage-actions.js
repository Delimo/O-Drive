import { adminState } from './admin-state.js';
import { api } from './api.js';
import {
  buttonByAction,
  renderAdminEmptyState,
  renderAdminLoadingState,
  setAdminButtonBusy,
  setAdminStatusMessage,
} from './admin-ui-utils.js';
import { escapeHtml } from './utils.js';
import {
  formatBytesLocal,
  formatGbInput,
  parseCapacityLocal,
} from './admin-format-utils.js';

function removeLegacyQuotaShortcuts() {
  document.querySelectorAll('[data-admin-action="fill-quota"]').forEach(button => {
    const group = button.closest('.quota-preset-grid');
    if (group) group.remove();
    else button.remove();
  });
  document.querySelectorAll('.quota-preset-grid').forEach(group => group.remove());
}

function normalizeGbInput(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  return Number((value / (1024 ** 3)).toFixed(2)).toString();
}

function inputGbValue(id) {
  const value = document.getElementById(id)?.value.trim();
  return value ? `${value}GB` : '';
}

function setQuotaResult(text = '', tone = 'muted') {
  setAdminStatusMessage('quotaResult', text, tone);
}

function setStorageResult(text = '', tone = 'muted') {
  setAdminStatusMessage('storageResult', text, tone);
}

export function createAdminStorageActions({ adminConfirm }) {
  return {
    switchStorageView(view = 'overview') {
      adminState.storageView = ['overview', 's3', 'bindings'].includes(view) ? view : 'overview';
      document.querySelectorAll('[data-storage-view]').forEach(panel => {
        panel.classList.add('is-active');
      });
      document.querySelectorAll('.storage-subtab-btn').forEach(button => {
        button.classList.remove('is-active');
      });
    },

    async loadQuota() {
      removeLegacyQuotaShortcuts();
      const info = document.getElementById('quotaInfo');
      setQuotaResult();
      if (!info) return;
      info.innerHTML = renderAdminLoadingState('正在加载配额...', '正在读取 R2 水位和存储桶状态');
      const { res, data } = await api.adminStorage();
      if (!res.ok) {
        info.innerHTML = renderAdminEmptyState({
          title: 'R2 配额信息加载失败',
          description: '请稍后重试，或检查后台服务是否可用。',
          compact: true,
        });
        return;
      }
      const r2 = data?.r2 || { quotaBytes: 0, usedBytes: 0, usedFormatted: '0 B', quotaFormatted: '未设置', usedPercent: 0 };
      const usedPercent = r2.quotaBytes > 0 ? Math.round((r2.usedBytes / r2.quotaBytes) * 100) : 0;
      const remainingBytes = r2.quotaBytes > 0 ? Math.max(0, r2.quotaBytes - r2.usedBytes) : Infinity;
      const primaryBucket = document.getElementById('storagePrimaryBucketValue');
      const quotaMode = document.getElementById('storageQuotaModeValue');
      const policyStatus = document.getElementById('storagePolicyStatusValue');
      const quotaPercent = document.getElementById('quotaPercentValue');
      const quotaPercentLabel = document.getElementById('quotaPercentLabel');
      const usageBar = document.getElementById('quotaUsageBar');
      const quotaHero = document.querySelector('.storage-quota-hero');
      if (primaryBucket) primaryBucket.textContent = 'R2';
      if (quotaMode) quotaMode.textContent = '分桶独立';
      if (policyStatus) policyStatus.textContent = data?.overflowEnabled ? '已启用' : '未启用';
      if (quotaPercent) quotaPercent.textContent = r2.quotaBytes > 0 ? `${usedPercent}%` : r2.usedFormatted || '0 B';
      if (quotaPercentLabel) quotaPercentLabel.textContent = r2.quotaBytes > 0 ? 'R2 已使用' : '当前按存储桶分别配额';
      if (usageBar) usageBar.style.width = `${Math.max(0, Math.min(100, usedPercent))}%`;
      quotaHero?.classList.toggle('is-unlimited', !(r2.quotaBytes > 0));
      info.innerHTML = `
        <div class="quota-note-card">
          <strong>${r2.quotaBytes > 0 ? 'R2 配额已启用' : '当前使用分桶配额模式'}</strong>
          <span>${r2.quotaBytes > 0 ? `R2 已使用 ${r2.usedFormatted || '0 B'}，剩余 ${formatBytesLocal(remainingBytes)}。` : '上传不再检查全局总量，而是分别检查每个存储桶自己的配额。'}</span>
        </div>
      `;
    },

    async loadStorage() {
      const spaceList = document.getElementById('storageSpaceList');
      const storageSpaceCount = document.getElementById('storageSpaceCountValue');
      const storageOverflowCount = document.getElementById('storageOverflowCountValue');
      setStorageResult();
      if (!spaceList) return;
      const { res, data } = await api.adminStorage();
      if (!res.ok) {
        if (storageSpaceCount) storageSpaceCount.textContent = '0';
        if (storageOverflowCount) storageOverflowCount.textContent = '0';
        setStorageResult('加载存储配置失败，请稍后重试。', 'error');
        spaceList.innerHTML = renderAdminEmptyState({
          title: 'S3 空间加载失败',
          description: '当前无法读取扩展存储配置。',
          compact: true,
        });
        return;
      }
      adminState.storageConfig = data;
      const r2Quota = document.getElementById('r2QuotaBytesInput');
      const threshold = document.getElementById('overflowThresholdInput');
      const enabled = document.getElementById('overflowEnabledInput');
      if (r2Quota) r2Quota.value = formatGbInput(data.r2?.quotaBytes);
      if (threshold) threshold.value = data.overflowThresholdPercent || 85;
      if (enabled) enabled.checked = Boolean(data.overflowEnabled);
      const spaces = Array.isArray(data.spaces) ? data.spaces : [];
      const overflowTargets = spaces.filter(item => item.enabled && item.overflowTarget);
      if (storageSpaceCount) storageSpaceCount.textContent = String(spaces.length);
      if (storageOverflowCount) storageOverflowCount.textContent = String(overflowTargets.length);
      this.syncStoragePolicyAvailability(data);
      this.syncStorageEditorState();
      spaceList.innerHTML = spaces.map(item => `
        <div class="access-rule-card storage-space-card ${adminState.storageEditingId === item.id ? 'is-editing' : ''}">
          <div class="access-rule-main">
            <strong>${escapeHtml(item.name || item.id)}</strong>
            <span>${escapeHtml(item.bucket || '-')} · ${escapeHtml(item.endpoint || '-')}</span>
          </div>
          <div class="access-rule-states">
            <span class="admin-status-badge ${item.enabled ? 'is-visible' : 'is-hidden'}">${item.enabled ? '启用' : '停用'}</span>
            ${item.overflowTarget ? '<span class="admin-status-badge is-visible">溢出目标</span>' : ''}
            <span class="access-rule-note">${escapeHtml(item.usedFormatted || '0 B')} / ${escapeHtml(item.quotaFormatted || '未设置')}</span>
            ${item.hasSecret ? '<span class="access-rule-note">密钥已保存</span>' : '<span class="access-rule-note">缺少密钥</span>'}
          </div>
          <div class="access-rule-actions">
            <button class="btn h-8 px-3" data-admin-action="edit-storage-space" data-args='${escapeHtml(JSON.stringify([item.id]))}'>编辑</button>
            <button class="btn h-8 px-3" data-admin-action="test-storage-space" data-args='${escapeHtml(JSON.stringify([item.id]))}'>测试</button>
            <button class="admin-danger-btn" data-admin-action="remove-storage-space" data-args='${escapeHtml(JSON.stringify([item.id]))}'>删除</button>
          </div>
        </div>
      `).join('') || renderAdminEmptyState({
        title: '暂无 S3 空间',
        description: '先添加一个扩展存储，再决定是否把它作为 R2 溢出目标。',
        primaryAction: 'new-storage-space',
        primaryLabel: '添加空间',
        compact: true,
      });
    },

    storageName(id) {
      if (id === 'r2') return 'Cloudflare R2';
      const item = (adminState.storageConfig?.spaces || []).find(space => space.id === id);
      return item?.name || id || '-';
    },

    syncStoragePolicyAvailability(config = adminState.storageConfig || {}) {
      const enabled = document.getElementById('overflowEnabledInput');
      const threshold = document.getElementById('overflowThresholdInput');
      const hint = document.getElementById('storagePolicyHint');
      const hasOverflowTarget = (config.spaces || []).some(item => item.enabled && item.overflowTarget);
      [enabled, threshold].forEach(el => {
        if (el) el.disabled = !hasOverflowTarget;
      });
      if (enabled && !hasOverflowTarget) enabled.checked = false;
      if (hint) {
        hint.textContent = hasOverflowTarget
          ? '已检测到可用 S3 溢出空间，高水位策略可正常启用。'
          : '请先配置并启用至少一个 S3 扩展存储，且勾选“作为溢出空间”。';
        hint.classList.toggle('is-warning', !hasOverflowTarget);
      }
    },

    syncStorageEditorState() {
      const editingId = adminState.storageEditingId || '';
      const space = (adminState.storageConfig?.spaces || []).find(item => item.id === editingId);
      const title = document.getElementById('storageEditorTitle');
      const hint = document.getElementById('storageEditorHint');
      const idInput = document.getElementById('storageIdInput');
      if (title) title.textContent = space ? `编辑扩展存储 ${space.name || space.id}` : '添加扩展存储';
      if (hint) {
        hint.textContent = space
          ? '正在编辑已配置空间。这个面板里可以单独调整它的配额、溢出角色和连接信息，ID 在编辑时保持只读。'
          : '新增的 S3 空间会在这里设置自己的容量上限，也可以同时作为文件夹目标或 R2 溢出空间。';
      }
      if (idInput) idInput.readOnly = Boolean(space);
      document.querySelectorAll('.storage-space-card').forEach(card => {
        const editButton = card.querySelector('[data-admin-action="edit-storage-space"]');
        const args = editButton?.dataset.args || '[]';
        let id = '';
        try { id = JSON.parse(args)[0] || ''; } catch (_) {}
        card.classList.toggle('is-editing', Boolean(id && id === editingId));
      });
    },

    fillStorageSpaceForm(space = null) {
      const set = (id, value = '') => { const el = document.getElementById(id); if (el) el.value = value; };
      set('storageNameInput', space?.name || '');
      set('storageIdInput', space?.id || '');
      set('storageEndpointInput', space?.endpoint || '');
      set('storageBucketInput', space?.bucket || '');
      set('storageAccessKeyInput', space?.accessKeyId || '');
      set('storageSecretKeyInput', '');
      set('storageRegionInput', space?.region || 'auto');
      set('storagePrefixInput', space?.prefix || '');
      set('storageQuotaInput', normalizeGbInput(space?.quotaBytes));
      const enabled = document.getElementById('storageEnabledInput');
      const overflow = document.getElementById('storageOverflowInput');
      if (enabled) enabled.checked = space ? Boolean(space.enabled) : true;
      if (overflow) overflow.checked = space ? Boolean(space.overflowTarget) : true;
      const secret = document.getElementById('storageSecretKeyInput');
      if (secret) secret.type = 'password';
      document.querySelector('.storage-secret-toggle')?.classList.remove('is-visible');
    },

    newStorageSpace() {
      adminState.storageEditingId = '';
      this.fillStorageSpaceForm(null);
      this.syncStorageEditorState();
      document.getElementById('storageNameInput')?.focus();
    },

    focusStorageBinding() {
      document.getElementById('bindingPathInput')?.focus();
    },

    editStorageSpace(id = '') {
      const space = (adminState.storageConfig?.spaces || []).find(item => item.id === id);
      if (!space) return;
      adminState.storageEditingId = id;
      this.fillStorageSpaceForm(space);
      this.syncStorageEditorState();
      document.getElementById('storageNameInput')?.focus();
    },

    toggleStorageSecret() {
      const input = document.getElementById('storageSecretKeyInput');
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      const button = document.querySelector('.storage-secret-toggle');
      button?.classList.toggle('is-visible', visible);
      button?.setAttribute('aria-label', visible ? '隐藏 Secret Access Key' : '显示 Secret Access Key');
      button?.setAttribute('title', visible ? '隐藏密钥' : '显示密钥');
    },

    readStorageBaseConfig() {
      const current = adminState.storageConfig || { spaces: [], bindings: [] };
      const r2QuotaValue = document.getElementById('r2QuotaBytesInput')?.value.trim();
      const hasOverflowTarget = (current.spaces || []).some(item => item.enabled && item.overflowTarget);
      return {
        ...current,
        r2QuotaBytes: r2QuotaValue !== undefined && r2QuotaValue !== '' ? `${r2QuotaValue}GB` : current.r2?.quotaBytes || '10GB',
        overflowThresholdPercent: Number(document.getElementById('overflowThresholdInput')?.value || current.overflowThresholdPercent || 85),
        overflowEnabled: hasOverflowTarget && Boolean(document.getElementById('overflowEnabledInput')?.checked),
        spaces: [...(current.spaces || [])],
        bindings: [...(current.bindings || [])],
      };
    },

    async saveStorageConfig(config, message = '存储配置已保存') {
      setStorageResult('正在保存...', 'loading');
      const { res, data } = await api.setAdminStorage(config);
      if (!res.ok || data?.success === false) {
        setStorageResult(data?.message || '保存失败', 'error');
        return false;
      }
      await this.loadStorage();
      setStorageResult(message, 'success');
      return true;
    },

    readStorageSpaceForm() {
      return {
        id: document.getElementById('storageIdInput')?.value.trim(),
        name: document.getElementById('storageNameInput')?.value.trim(),
        endpoint: document.getElementById('storageEndpointInput')?.value.trim(),
        bucket: document.getElementById('storageBucketInput')?.value.trim(),
        accessKeyId: document.getElementById('storageAccessKeyInput')?.value.trim(),
        secretAccessKey: document.getElementById('storageSecretKeyInput')?.value,
        region: document.getElementById('storageRegionInput')?.value.trim() || 'auto',
        prefix: document.getElementById('storagePrefixInput')?.value.trim(),
        quotaBytes: inputGbValue('storageQuotaInput'),
        enabled: Boolean(document.getElementById('storageEnabledInput')?.checked),
        overflowTarget: Boolean(document.getElementById('storageOverflowInput')?.checked),
      };
    },

    async addStorageSpace() {
      const saveButton = buttonByAction('add-storage-space');
      const config = this.readStorageBaseConfig();
      const item = this.readStorageSpaceForm();
      if (!item.id || !item.name || !item.endpoint || !item.bucket) {
        setStorageResult('请填写名称、ID、Endpoint 和 Bucket。', 'error');
        return;
      }
      if (!/^[a-zA-Z0-9-]+$/.test(item.id)) {
        setStorageResult('ID 仅支持英文、数字和连字符。', 'error');
        return;
      }
      const idx = config.spaces.findIndex(space => space.id === item.id);
      if (idx >= 0) config.spaces[idx] = { ...config.spaces[idx], ...item };
      else config.spaces.push(item);
      adminState.storageEditingId = item.id;
      setAdminButtonBusy(saveButton, true, '保存中...');
      try {
        await this.saveStorageConfig(config, 'S3 空间已保存。');
      } finally {
        setAdminButtonBusy(saveButton, false);
      }
    },

    async testStorageSpace(id = '') {
      const testButton = buttonByAction('test-storage-space');
      const saved = id ? (adminState.storageConfig?.spaces || []).find(item => item.id === id) : null;
      const space = saved || this.readStorageSpaceForm();
      if (!space?.id && !space?.name) {
        setStorageResult('请先填写或选择一个 S3 空间。', 'error');
        return;
      }
      setAdminButtonBusy(testButton, true, '测试中...');
      setStorageResult('正在测试 S3 连接...', 'loading');
      try {
        const { res, data } = await api.testAdminStorage(space);
        if (!res.ok || data?.success === false) {
          setStorageResult(data?.message || '连接测试失败', 'error');
          return;
        }
        setStorageResult(`${data.message || '连接成功'}，耗时 ${data.durationMs || 0}ms。`, 'success');
      } finally {
        setAdminButtonBusy(testButton, false);
      }
    },

    async saveStoragePolicy() {
      const saveButton = buttonByAction('save-storage-policy');
      const config = this.readStorageBaseConfig();
      setAdminButtonBusy(saveButton, true, '保存中...');
      try {
        await this.saveStorageConfig(config, 'R2 溢出设置已保存。');
      } finally {
        setAdminButtonBusy(saveButton, false);
      }
    },

    async removeStorageSpace(id) {
      const config = this.readStorageBaseConfig();
      if (!(await adminConfirm('删除 S3 空间？', `空间 ${id} 的路径绑定也会移除。`))) return;
      config.spaces = config.spaces.filter(item => item.id !== id);
      config.bindings = config.bindings.filter(item => item.storageId !== id);
      if (adminState.storageEditingId === id) {
        adminState.storageEditingId = '';
        this.fillStorageSpaceForm(null);
      }
      await this.saveStorageConfig(config, 'S3 空间已删除');
    },

    async addStorageBinding() {
      const saveButton = buttonByAction('add-storage-binding');
      const config = this.readStorageBaseConfig();
      const path = (document.getElementById('bindingPathInput')?.value || '').trim().replace(/^\/+|\/+$/g, '');
      const storageId = document.getElementById('bindingStorageInput')?.value || 'r2';
      if (!path) {
        setStorageResult('请输入要绑定的路径。', 'error');
        return;
      }
      config.bindings = [...config.bindings.filter(item => item.path !== path), { path, storageId }];
      setAdminButtonBusy(saveButton, true, '绑定中...');
      try {
        await this.saveStorageConfig(config, `/${path} 已绑定到 ${this.storageName(storageId)}。`);
      } finally {
        setAdminButtonBusy(saveButton, false);
      }
    },

    async removeStorageBinding(path) {
      const config = this.readStorageBaseConfig();
      config.bindings = config.bindings.filter(item => item.path !== path);
      await this.saveStorageConfig(config, `/${path} 已取消绑定。`);
    },

  };
}
