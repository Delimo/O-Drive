import { adminState } from './admin-state.js';
import { api } from './api.js';
import { describeLogAction, logActionClass } from './admin-log-utils.js';
import { escapeHtml } from './utils.js';

const LOG_PAGE_SIZE = 10;

function setLogPaginationState() {
  const prev = document.getElementById('logPrevButton');
  const next = document.getElementById('logNextButton');
  if (prev) prev.disabled = adminState.currentPage <= 1;
  if (next) next.disabled = adminState.currentPage >= adminState.totalPages;
}

export function createAdminLogActions() {
  return {
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
  };
}
