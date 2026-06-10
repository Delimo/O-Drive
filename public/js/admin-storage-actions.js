import { adminState } from './admin-state.js';
import { api } from './api.js';
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
      const quotaPercentLabel = document.getElementById('quotaPercentLabel');
      const usageBar = document.getElementById('quotaUsageBar');
      const quotaHero = document.querySelector('.storage-quota-hero');
      if (quotaLimit) quotaLimit.textContent = quotaLabel;
      if (quotaUsed) quotaUsed.textContent = data.usedFormatted || '0 B';
      if (quotaRemaining) quotaRemaining.textContent = remainingLabel;
      if (quotaPercent) quotaPercent.textContent = data.quota > 0 ? `${usedPercent}%` : data.usedFormatted || '0 B';
      if (quotaPercentLabel) quotaPercentLabel.textContent = data.quota > 0 ? '已使用' : '当前未限制配额';
      if (usageBar) usageBar.style.width = `${Math.max(0, Math.min(100, usedPercent))}%`;
      quotaHero?.classList.toggle('is-unlimited', !(data.quota > 0));
      info.innerHTML = `
        <div class="quota-note-card">
          <strong>${data.quota > 0 ? '配额已启用' : '当前不限制容量'}</strong>
          <span>${data.quota > 0 ? `已使用 ${data.usedFormatted || '0 B'}，剩余 ${formatBytesLocal(data.remaining)}。` : '上传不会受总容量限制，仍建议定期清理回收站和临时文件。'}</span>
        </div>
      `;
      const input = document.getElementById('quotaInput');
      if (input) input.value = data.quota > 0 ? formatGbInput(data.quota) : '0';
    },

    async loadStorage() {
      const result = document.getElementById('storageResult');
      const spaceList = document.getElementById('storageSpaceList');
      const bindingList = document.getElementById('storageBindingList');
      const bindingSelect = document.getElementById('bindingStorageInput');
      if (result) result.textContent = '';
      if (!spaceList || !bindingList || !bindingSelect) return;
      const { res, data } = await api.adminStorage();
      if (!res.ok) {
        if (result) result.textContent = '加载存储配置失败';
        return;
      }
      adminState.storageConfig = data;
      const r2Quota = document.getElementById('r2QuotaBytesInput');
      const threshold = document.getElementById('overflowThresholdInput');
      const enabled = document.getElementById('overflowEnabledInput');
      if (r2Quota) r2Quota.value = formatGbInput(data.r2?.quotaBytes);
      if (threshold) threshold.value = data.overflowThresholdPercent || 85;
      if (enabled) enabled.checked = Boolean(data.overflowEnabled);
      this.syncStoragePolicyAvailability(data);
      this.syncStorageEditorState();
      bindingSelect.innerHTML = [
        '<option value="r2">Cloudflare R2</option>',
        ...(data.spaces || []).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.id)}</option>`),
      ].join('');
      spaceList.innerHTML = (data.spaces || []).map(item => `
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
      `).join('') || '<div class="access-empty">暂无 S3 空间</div>';
      bindingList.innerHTML = (data.bindings || []).map(item => `
        <div class="access-rule-card">
          <div class="access-rule-main">
            <strong>/${escapeHtml(item.path)}</strong>
            <span>存储空间：${escapeHtml(this.storageName(item.storageId))}</span>
          </div>
          <div class="access-rule-actions">
            <button class="admin-danger-btn" data-admin-action="remove-storage-binding" data-args='${escapeHtml(JSON.stringify([item.path]))}'>删除</button>
          </div>
        </div>
      `).join('') || '<div class="access-empty">暂无路径绑定，根目录默认使用 R2</div>';
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
          ? '正在编辑已配置空间。ID 为关联路径和索引使用，编辑时保持只读。'
          : 'S3 兼容存储可作为文件夹目标，也可承担 R2 溢出。';
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
      const result = document.getElementById('storageResult');
      if (result) result.textContent = '正在保存...';
      const { res, data } = await api.setAdminStorage(config);
      if (!res.ok || data?.success === false) {
        if (result) result.textContent = data?.message || '保存失败';
        return false;
      }
      if (result) result.textContent = message;
      await this.loadStorage();
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
      const config = this.readStorageBaseConfig();
      const item = this.readStorageSpaceForm();
      if (!item.id || !item.name || !item.endpoint || !item.bucket) {
        const result = document.getElementById('storageResult');
        if (result) result.textContent = '请填写名称、ID、Endpoint 和 Bucket';
        return;
      }
      if (!/^[a-zA-Z0-9-]+$/.test(item.id)) {
        const result = document.getElementById('storageResult');
        if (result) result.textContent = 'ID 仅支持英文、数字和连字符';
        return;
      }
      const idx = config.spaces.findIndex(space => space.id === item.id);
      if (idx >= 0) config.spaces[idx] = { ...config.spaces[idx], ...item };
      else config.spaces.push(item);
      adminState.storageEditingId = item.id;
      await this.saveStorageConfig(config, 'S3 空间已保存');
    },

    async testStorageSpace(id = '') {
      const result = document.getElementById('storageResult');
      const saved = id ? (adminState.storageConfig?.spaces || []).find(item => item.id === id) : null;
      const space = saved || this.readStorageSpaceForm();
      if (!space?.id && !space?.name) {
        if (result) result.textContent = '请先填写或选择一个 S3 空间';
        return;
      }
      if (result) result.textContent = '正在测试 S3 连接...';
      const { res, data } = await api.testAdminStorage(space);
      if (!res.ok || data?.success === false) {
        if (result) result.textContent = data?.message || '连接测试失败';
        return;
      }
      if (result) result.textContent = `${data.message || '连接成功'}，耗时 ${data.durationMs || 0}ms`;
    },

    async saveStoragePolicy() {
      const config = this.readStorageBaseConfig();
      await this.saveStorageConfig(config, 'R2 溢出设置已保存');
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
      const config = this.readStorageBaseConfig();
      const path = (document.getElementById('bindingPathInput')?.value || '').trim().replace(/^\/+|\/+$/g, '');
      const storageId = document.getElementById('bindingStorageInput')?.value || 'r2';
      if (!path) {
        const result = document.getElementById('storageResult');
        if (result) result.textContent = '请输入要绑定的路径';
        return;
      }
      config.bindings = [...config.bindings.filter(item => item.path !== path), { path, storageId }];
      await this.saveStorageConfig(config, `/${path} 已绑定到 ${this.storageName(storageId)}`);
    },

    async removeStorageBinding(path) {
      const config = this.readStorageBaseConfig();
      config.bindings = config.bindings.filter(item => item.path !== path);
      await this.saveStorageConfig(config, `/${path} 已取消绑定`);
    },

    fillQuota(bytes) {
      const input = document.getElementById('quotaInput');
      if (input) input.value = bytes;
    },

    async setQuota() {
      const input = document.getElementById('quotaInput');
      const result = document.getElementById('quotaResult');
      const value = input?.value.trim();
      const parsed = parseCapacityLocal(value ? `${value}GB` : 0);
      if (!parsed.ok) { if (result) result.textContent = '请输入有效容量，或填 0 表示不限制'; return; }
      const bytes = parsed.bytes;
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
  };
}
