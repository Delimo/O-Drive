import { api } from './api.js';
import { adminState } from './admin-state.js';
import { escapeHtml } from './utils.js';

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
  result.classList.toggle('hidden', !text);
  result.classList.toggle('text-rose-600', tone === 'error');
  result.classList.toggle('text-emerald-700', tone === 'success');
}

function readShareFilters() {
  return {
    q: (document.getElementById('shareFilterQuery')?.value || '').trim().toLowerCase(),
    status: document.getElementById('shareFilterStatus')?.value || 'all',
  };
}

function syncShareFilters() {
  const filters = adminState.shareFilters || { q: '', status: 'all' };
  const query = document.getElementById('shareFilterQuery');
  const status = document.getElementById('shareFilterStatus');
  if (query) query.value = filters.q || '';
  if (status) status.value = filters.status || 'all';
}

function matchesShareFilters(item, filters = {}) {
  const q = String(filters.q || '').trim().toLowerCase();
  if (q) {
    const haystack = `${item.name || ''} ${item.path || ''}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  const status = filters.status || 'all';
  if (status === 'active') return !item.expired && !item.exhausted;
  if (status === 'expired') return Boolean(item.expired);
  if (status === 'exhausted') return Boolean(item.exhausted);
  return true;
}

export function createAdminShareActions({ adminConfirm }) {
  return {
    async loadShares() {
      const tbody = document.getElementById('sharesTbody');
      if (!tbody) return;
      setSharesResult();
      syncShareFilters();
      tbody.innerHTML = '<tr><td colspan="4"><div class="admin-empty-state">正在加载...</div></td></tr>';
      const { res, data } = await api.adminShares();
      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="4"><div class="admin-empty-state">分享链接加载失败</div></td></tr>';
        return;
      }
      const allRows = data.items || [];
      const rows = allRows.filter(item => matchesShareFilters(item, adminState.shareFilters));
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="admin-empty-state">${allRows.length ? '没有匹配的分享链接' : '暂无分享链接'}</div></td></tr>`;
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
          item.maxDownloads ? `<span>剩余 ${escapeHtml(String(Math.max(Number(item.maxDownloads || 0) - Number(item.downloadCount || 0), 0)))}</span>` : '',
          item.allowPreview ? '<span>可预览</span>' : '<span>不可预览</span>',
          item.allowDownload ? '<span>可下载</span>' : '<span>不可下载</span>',
          item.hasPassword ? '<span>有密码</span>' : '<span>无密码</span>',
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

    applyShareFilters() {
      adminState.shareFilters = readShareFilters();
      return this.loadShares();
    },

    resetShareFilters() {
      adminState.shareFilters = { q: '', status: 'all' };
      syncShareFilters();
      return this.loadShares();
    },

    async deleteShare(token) {
      if (!token || !(await adminConfirm('删除分享链接？', '删除后该分享会立即失效，且不会留下分享记录。'))) return;
      const { res, data } = await api.deleteShare(token);
      if (!res.ok || data?.success === false) {
        setSharesResult(data?.message || '删除失败', 'error');
        return;
      }
      await this.loadShares();
      setSharesResult('分享链接已删除', 'success');
    },

    async cleanupShares() {
      if (!(await adminConfirm('清理过期分享？', '这是手动清理，会立即删除已过期或已达到下载次数限制的分享记录。'))) return;
      const { res, data } = await api.cleanupExpiredShares();
      if (!res.ok || data?.success === false) {
        setSharesResult(data?.message || '清理失败', 'error');
        return;
      }
      await this.loadShares();
      setSharesResult(`已清理 ${data.deleted || 0} 条分享记录`, 'success');
    },
  };
}
