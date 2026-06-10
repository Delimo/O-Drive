import { api } from './api.js';
import { adminState } from './admin-state.js';
import { renderAdminEmptyState, renderAdminLoadingState, setAdminStatusMessage } from './admin-ui-utils.js';
import { escapeHtml } from './utils.js';

function shareLink(token) {
  return new URL(`/share.html?token=${encodeURIComponent(token)}`, window.location.origin).href;
}

function shareTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '长期有效';
}

function setSharesResult(text = '', tone = 'muted') {
  setAdminStatusMessage('sharesResult', text, tone);
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

function setShareSummary(items = []) {
  const total = document.getElementById('shareTotalCount');
  const active = document.getElementById('shareActiveCount');
  const expired = document.getElementById('shareExpiredCount');
  const password = document.getElementById('sharePasswordCount');
  if (total) total.textContent = String(items.length);
  if (active) active.textContent = String(items.filter(item => !item.expired && !item.exhausted).length);
  if (expired) expired.textContent = String(items.filter(item => item.expired || item.exhausted).length);
  if (password) password.textContent = String(items.filter(item => item.hasPassword).length);
}

function shareStatus(item) {
  if (item.exhausted) return { label: '已达次数', className: 'is-hidden' };
  if (item.expired) return { label: '已过期', className: 'is-hidden' };
  return { label: '有效', className: 'is-visible' };
}

function shareStatusHint(item) {
  if (item.exhausted) return '下载次数已用完';
  if (item.expired) {
    const cleanupAt = item.autoDeleteAt ? new Date(item.autoDeleteAt).toLocaleString('zh-CN', { hour12: false }) : '超过 7 天后';
    return `自动清理：${cleanupAt}`;
  }
  const lastAccessedAt = item.lastAccessedAt ? new Date(item.lastAccessedAt).toLocaleString('zh-CN', { hour12: false }) : '尚未访问';
  return `最近访问：${lastAccessedAt}`;
}

function sharePolicy(item) {
  const maxDownloads = item.maxDownloads ? String(item.maxDownloads) : '不限';
  const remaining = item.maxDownloads ? Math.max(Number(item.maxDownloads || 0) - Number(item.downloadCount || 0), 0) : '';
  return [
    `<span>过期 ${escapeHtml(shareTime(item.expiresAt))}</span>`,
    `<span>下载 ${escapeHtml(String(item.downloadCount || 0))}/${escapeHtml(maxDownloads)}</span>`,
    remaining !== '' ? `<span>剩余 ${escapeHtml(String(remaining))}</span>` : '',
    item.allowPreview ? '<span>可预览</span>' : '<span>不可预览</span>',
    item.allowDownload ? '<span>可下载</span>' : '<span>不可下载</span>',
    item.hasPassword ? '<span>有密码</span>' : '<span>无密码</span>',
  ].filter(Boolean).join('');
}

export function createAdminShareActions({ adminConfirm }) {
  return {
    async loadShares() {
      const list = document.getElementById('shareList') || document.getElementById('sharesTbody');
      if (!list) return;
      setSharesResult();
      syncShareFilters();
      list.innerHTML = renderAdminLoadingState('正在加载分享...', '正在整理分享状态和访问记录');
      const { res, data } = await api.adminShares();
      if (!res.ok) {
        list.innerHTML = renderAdminEmptyState({
          title: '分享链接加载失败',
          description: '请稍后刷新，或检查分享记录服务是否可用。',
          primaryAction: 'refresh-shares',
          primaryLabel: '重新加载',
          compact: true,
        });
        setShareSummary([]);
        return;
      }
      const allRows = data.items || [];
      setShareSummary(allRows);
      const rows = allRows.filter(item => matchesShareFilters(item, adminState.shareFilters));
      if (!rows.length) {
        list.innerHTML = allRows.length
          ? renderAdminEmptyState({
              title: '没有匹配的分享链接',
              description: '换个关键词或状态条件再试试。',
              primaryAction: 'reset-share-filters',
              primaryLabel: '重置筛选',
            })
          : renderAdminEmptyState({
              title: '暂无分享链接',
              description: '回到文件列表，选择一个文件后可在详情里创建分享。',
              primaryAction: 'reset-share-filters',
              primaryLabel: '清空筛选',
              secondaryHref: '/',
              secondaryLabel: '去文件列表',
            });
        return;
      }
      list.innerHTML = rows.map(item => {
        const status = shareStatus(item);
        const createdAt = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) : '-';
        const auditText = item.lastAccessedAt
          ? `最近访问 ${new Date(item.lastAccessedAt).toLocaleString('zh-CN', { hour12: false })}${item.lastAccessIp ? ` · ${item.lastAccessIp}` : ''}`
          : '最近访问 暂无';
        return `
          <div class="share-card">
            <div class="share-card-main">
              <div class="share-card-title">
                <strong>${escapeHtml(item.name || item.path)}</strong>
                <span>${escapeHtml(item.path)}</span>
              </div>
              <div class="admin-share-chips">${sharePolicy(item)}<span class="admin-share-audit">${escapeHtml(auditText)}</span></div>
              <div class="share-card-meta">创建：${escapeHtml(createdAt)}</div>
            </div>
            <div class="share-card-side">
              <div class="share-card-status">
                <span class="admin-status-badge ${status.className}">${status.label}</span>
                <small>${escapeHtml(shareStatusHint(item))}</small>
              </div>
              <div class="share-card-actions">
                <button class="btn h-8 px-3" data-admin-action="copy-share" data-args='${escapeHtml(JSON.stringify([item.token]))}'>复制链接</button>
                <button class="admin-danger-btn" data-admin-action="delete-share" data-args='${escapeHtml(JSON.stringify([item.token]))}'>删除</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    async copyShare(token) {
      if (!token) return;
      const link = shareLink(token);
      try {
        await navigator.clipboard.writeText(link);
        setSharesResult('分享链接已复制。', 'success');
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
      setSharesResult('分享链接已删除。', 'success');
    },

    async cleanupShares() {
      if (!(await adminConfirm('清理过期分享？', '这是手动清理，会立即删除已过期或已达到下载次数限制的分享记录。'))) return;
      const { res, data } = await api.cleanupExpiredShares();
      if (!res.ok || data?.success === false) {
        setSharesResult(data?.message || '清理失败', 'error');
        return;
      }
      await this.loadShares();
      setSharesResult(`已清理 ${data.deleted || 0} 条分享记录。`, 'success');
    },
  };
}
