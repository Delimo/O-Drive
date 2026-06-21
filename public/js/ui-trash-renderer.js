import { state } from './state.js';
import { escapeHtml, Utils } from './utils.js';

export function renderTrashList() {
  const tbody = document.getElementById('trashTbody');
  const count = document.getElementById('trashCount');
  const page = document.getElementById('trashPage');
  const total = document.getElementById('trashTotal');
  if (!tbody) return;
  const rows = state.trash.items || [];
  if (count) count.textContent = String(state.trash.total ?? rows.length);
  if (page) page.textContent = String(state.trash.currentPage || 1);
  if (total) total.textContent = String(state.trash.totalPages || 1);
  tbody.innerHTML = rows.map(item => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="px-4 py-3 font-mono text-slate-600">${escapeHtml(item.kind)}</td>
      <td class="px-4 py-3 text-slate-900 break-all">${escapeHtml(item.original_key)}</td>
      <td class="px-4 py-3 text-slate-500 font-mono">${escapeHtml(Utils.formatDate(item.trashed_at))}</td>
      <td class="px-4 py-3 text-slate-500 font-mono">${escapeHtml(item.size ? `${(item.size / 1024).toFixed(1)} KB` : '0 KB')}</td>
      <td class="px-4 py-3">
        <div class="flex justify-end gap-2">
          <button class="btn btn-primary h-8 px-3 text-xs" data-action="restore-trash" data-args='${escapeHtml(JSON.stringify([item.id]))}'>恢复</button>
          <button class="btn btn-danger-soft h-8 px-3 text-xs" data-action="purge-trash" data-args='${escapeHtml(JSON.stringify([item.id]))}'>彻底删除</button>
        </div>
      </td>
    </tr>
  `).join('');
}
