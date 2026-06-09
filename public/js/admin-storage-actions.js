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

export function createAdminStorageActions({ adminConfirm }) {
  return {
    switchStorageView(view = 'overview') {
      const active = ['overview', 's3', 'bindings'].includes(view) ? view : 'overview';
      adminState.storageView = active;
      document.querySelectorAll('[data-storage-view]').forEach(panel => {
        panel.classList.toggle('is-active', panel.dataset.storageView === active);
      });
      document.querySelectorAll('.storage-subtab-btn').forEach(button => {
        let args = [];
        try { args = JSON.parse(button.dataset.args || '[]'); } catch (_) {}
        button.classList.toggle('is-active', args[0] === active);
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
      if (input) input.value = data.quota > 0 ? (data.quotaFormatted || formatBytesLocal(data.quota)) : '0';
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
      bindingSelect.innerHTML = [
        '<option value="r2">Cloudflare R2</option>',
        ...(data.spaces || []).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.id)}</option>`),
      ].join('');
      spaceList.innerHTML = (data.spaces || []).map(item => `
        <div class="access-rule-card">
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

    readStorageBaseConfig() {
      const current = adminState.storageConfig || { spaces: [], bindings: [] };
      const r2QuotaValue = document.getElementById('r2QuotaBytesInput')?.value.trim();
      return {
        ...current,
        r2QuotaBytes: r2QuotaValue !== undefined && r2QuotaValue !== '' ? `${r2QuotaValue}GB` : current.r2?.quotaBytes || '10GB',
        overflowThresholdPercent: Number(document.getElementById('overflowThresholdInput')?.value || current.overflowThresholdPercent || 85),
        overflowEnabled: Boolean(document.getElementById('overflowEnabledInput')?.checked),
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
        quotaBytes: document.getElementById('storageQuotaInput')?.value.trim(),
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
      const idx = config.spaces.findIndex(space => space.id === item.id);
      if (idx >= 0) config.spaces[idx] = { ...config.spaces[idx], ...item };
      else config.spaces.push(item);
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
      const parsed = parseCapacityLocal(input?.value || 0);
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
