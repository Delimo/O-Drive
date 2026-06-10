import { api } from './api.js';
import { escapeHtml } from './utils.js';

function updateAccessPresetButtons(mode = '') {
  document.querySelectorAll('.access-preset-btn').forEach(btn => {
    let active = false;
    try {
      const args = JSON.parse(btn.dataset.args || '[]');
      active = args[0] === mode;
    } catch (_) {
      active = false;
    }
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

export function createAdminAccessActions({ adminConfirm }) {
  return {
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
      updateAccessPresetButtons(mode);
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
      updateAccessPresetButtons('');
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
  };
}
