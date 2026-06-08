import { api } from './api.js';
import { escapeHtml } from './utils.js';
import { adminTime, statusClass, statusLabel } from './admin-format-utils.js';

function setTextIfChanged(el, value) {
  if (el && el.textContent !== value) el.textContent = value;
}

function taskCounts(items) {
  return {
    running: items.filter(item => ['running', 'queued'].includes(item.status)).length,
    completed: items.filter(item => item.status === 'completed').length,
    failed: items.filter(item => ['failed', 'partial'].includes(item.status)).length,
  };
}

function taskRenderKey(items, counts) {
  return JSON.stringify({
    counts,
    items: items.map(item => ({
      id: item.id,
      type: item.type,
      status: item.status,
      total: item.total,
      completed: item.completed,
      failed: item.failed,
      error: item.error || '',
      progressPct: item.result?.progressPct ?? null,
      currentFile: item.result?.currentFile || '',
      createdAt: item.createdAt,
      finishedAt: item.finishedAt,
    })),
  });
}

function taskTypeLabel(type) {
  if (type === 'paste') return '复制/移动';
  if (type === 'delete') return '删除';
  if (type === 'upload') return '上传';
  return type || '任务';
}

function taskProgress(item) {
  const total = Math.max(Number(item.total || 0), 0);
  const completed = Math.max(Number(item.completed || 0), 0);
  const failed = Math.max(Number(item.failed || 0), 0);
  const done = Math.min(total || completed + failed || 1, completed + failed);
  const uploadPct = item.type === 'upload' && Number.isFinite(Number(item.result?.progressPct))
    ? Number(item.result.progressPct)
    : null;
  const pct = uploadPct !== null ? uploadPct : (total ? Math.round((done / total) * 100) : (item.status === 'completed' ? 100 : 0));
  return {
    total,
    completed,
    failed,
    pct: Math.max(0, Math.min(100, pct)),
  };
}

function renderTaskRow(item) {
  const { total, completed, failed, pct } = taskProgress(item);
  return `
    <div class="task-row">
      <div class="task-row-head">
        <strong>${escapeHtml(taskTypeLabel(item.type))}</strong>
        <span class="status-pill ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
      </div>
      <div class="task-progress"><span style="width:${pct}%"></span></div>
      <div class="task-row-count">${pct}%</div>
      <div class="task-row-meta">
        <span>${item.type === 'upload' ? '上传' : '完成'} ${completed}/${total || '-'}</span>
        ${failed ? `<span>失败 ${failed}</span>` : ''}
        ${item.type === 'upload' && item.result?.currentFile ? `<span>${escapeHtml(item.result.currentFile)}</span>` : ''}
        <span>创建 ${escapeHtml(adminTime(item.createdAt))}</span>
        ${item.finishedAt ? `<span>结束 ${escapeHtml(adminTime(item.finishedAt))}</span>` : ''}
      </div>
      ${item.error ? `<div class="task-row-meta"><span>${escapeHtml(item.error)}</span></div>` : ''}
    </div>
  `;
}

export function createAdminTaskActions() {
  return {
    async loadTasks() {
      const list = document.getElementById('taskList');
      if (!list) return;

      const hasRendered = list.dataset.loaded === 'true';
      if (!hasRendered) {
        list.innerHTML = '<div class="task-empty">正在加载任务...</div>';
        ['taskRunningCount', 'taskCompletedCount', 'taskFailedCount']
          .map(id => document.getElementById(id))
          .forEach(el => setTextIfChanged(el, '0'));
      }

      const { res, data } = await api.fileTasks(30);
      if (!res.ok) {
        if (!hasRendered) list.innerHTML = '<div class="task-empty">任务加载失败。</div>';
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      const counts = taskCounts(items);
      setTextIfChanged(document.getElementById('taskRunningCount'), String(counts.running));
      setTextIfChanged(document.getElementById('taskCompletedCount'), String(counts.completed));
      setTextIfChanged(document.getElementById('taskFailedCount'), String(counts.failed));

      const renderKey = taskRenderKey(items, counts);
      if (list.dataset.renderKey === renderKey) {
        list.dataset.loaded = 'true';
        return;
      }

      list.innerHTML = items.length
        ? items.map(renderTaskRow).join('')
        : '<div class="task-empty">暂无后台任务。</div>';
      list.dataset.renderKey = renderKey;
      list.dataset.loaded = 'true';
    },
  };
}
