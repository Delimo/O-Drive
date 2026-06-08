import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { adminTime, statusClass, statusLabel } from './admin-format-utils.js';

export function createAdminTaskActions() {
  return {
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
  };
}
