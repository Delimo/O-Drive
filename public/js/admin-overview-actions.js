import { api } from './api.js';
import { escapeHtml } from './utils.js';

export function createAdminOverviewActions() {
  return {
    async loadStats() {
      const { res, data } = await api.adminStats();
      if (res.status !== 200) return window.location.href = '/';
      document.getElementById('statFileCount').textContent = String(data.files?.count || 0);
      document.getElementById('statTotalSize').textContent = data.files?.totalSizeFormatted || '0 B';
      document.getElementById('statTrash').innerHTML = `
        <span class="stat-trash-count">${data.trash?.count || 0} <span class="text-sm font-semibold text-slate-500">项</span></span>
        <span class="stat-trash-size text-sm font-semibold text-slate-500">${escapeHtml(data.trash?.sizeFormatted || '0 B')}</span>
      `;
      document.getElementById('statLogs').textContent = String(data.logs?.count || 0);
      this.renderStorageWarnings(data);
      this.renderOverviewAttention(data.attention || []);

      const labels = { image: '图片', video: '视频', audio: '音频', text: '文本', archive: '压缩包', exe: '程序', other: '其他' };
      const breakdown = Object.entries(data.breakdown || {});
      const totalCount = breakdown.reduce((sum, [, item]) => sum + Number(item.count || 0), 0) || 1;
      document.getElementById('statsBreakdown').innerHTML = breakdown.map(([kind, item]) => {
        const count = Number(item.count || 0);
        const pct = count > 0 ? Math.max(4, Math.round((count / totalCount) * 100)) : 0;
        return `
          <div class="breakdown-item rounded-xl border border-border bg-background">
            <div class="breakdown-head">
              <span class="breakdown-label">${labels[kind] || kind}</span>
              <strong class="breakdown-value font-mono">${escapeHtml(item.sizeFormatted || '0 B')}</strong>
            </div>
            <div class="breakdown-track">
              <div class="breakdown-bar" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');

      document.getElementById('statsLatest').innerHTML = (data.latest || []).slice(0, 7).map(item => `
        <div class="latest-item rounded-xl border border-border bg-background px-4 py-3">
          <div class="latest-item-name font-mono text-slate-700">${escapeHtml(item.key)}</div>
          <div class="latest-item-meta mt-1 text-xs text-slate-500 flex items-center justify-between gap-3">
            <span>${escapeHtml(item.sizeFormatted || '0 B')}</span>
            <span>${escapeHtml(item.uploaded ? new Date(item.uploaded).toLocaleString('zh-CN', { hour12: false }) : '-')}</span>
          </div>
        </div>
      `).join('') || '<div class="text-slate-500 text-sm">暂无文件</div>';
    },

    renderOverviewAttention(items = []) {
      const box = document.getElementById('overviewAttention');
      if (!box) return;
      const rows = Array.isArray(items) && items.length ? items : [{
        level: 'ok',
        title: '暂无需要处理的事项',
        body: '索引、日志和清理策略处于正常范围。',
        tab: 'health',
      }];
      box.innerHTML = rows.map(item => `
        <button class="attention-item is-${escapeHtml(item.level || 'info')}" data-admin-action="switch-tab" data-args='${escapeHtml(JSON.stringify([item.tab || 'health']))}'>
          <span class="attention-dot"></span>
          <span>
            <strong>${escapeHtml(item.title || '待关注事项')}</strong>
            <small>${escapeHtml(item.body || '')}</small>
          </span>
        </button>
      `).join('');
    },

    renderIndexStatus(index = {}) {
      const panel = document.getElementById('indexStatusPanel');
      if (!panel) return;
      const latest = index.latestUpdatedAt
        ? new Date(index.latestUpdatedAt).toLocaleString('zh-CN', { hour12: false })
        : '尚未更新';
      const fresh = Boolean(index.fresh);
      panel.classList.remove('hidden');
      panel.innerHTML = `
        <div class="index-status-main">
          <span class="index-status-badge ${fresh ? 'is-ok' : 'is-warning'}">${fresh ? '索引正常' : '需要关注'}</span>
          <div>
            <strong>${escapeHtml(index.recommendation || (fresh ? '索引可用' : '建议重建索引'))}</strong>
            <p>索引记录 ${escapeHtml(String(index.count || 0))} 个文件，占用 ${escapeHtml(index.totalSizeFormatted || '0 B')}，最后更新：${escapeHtml(latest)}</p>
          </div>
        </div>
        <div class="index-status-actions">
          <span>${index.sampleTruncated ? 'R2 抽样已达上限' : `R2 抽样 ${escapeHtml(String(index.sampleCount || 0))} 个可见文件`}</span>
          <button class="btn h-8 px-3" data-admin-action="maintenance-action" data-args='["rebuild-index"]'>重建索引</button>
        </div>
      `;
    },

    renderStorageWarnings(data) {
      const box = document.getElementById('storageWarnings');
      if (!box) return;
      const warnings = [];
      const fileCount = Number(data.files?.count || 0);
      const totalSize = Number(data.files?.totalSize || 0);
      const trashCount = Number(data.trash?.count || 0);
      const trashSize = Number(data.trash?.size || 0);

      if (data.files?.truncated) {
        warnings.push({
          level: 'warning',
          title: '文件统计已达到扫描上限',
          body: '当前最多扫描 20000 个文件，实际文件数可能更多。建议分目录管理，避免单次操作耗时过长。'
        });
      }
      if (fileCount >= 15000) {
        warnings.push({
          level: 'info',
          title: '文件数量较多',
          body: `当前已统计 ${fileCount} 个文件，跨目录复制、移动、删除时可能耗时较长。`
        });
      }
      if (trashCount >= 100 || trashSize > Math.max(totalSize * 0.2, 1024 * 1024 * 1024)) {
        warnings.push({
          level: 'warning',
          title: '回收站占用偏大',
          body: `回收站有 ${trashCount} 项，占用 ${data.trash?.sizeFormatted || '0 B'}，建议及时清理或设置自动清理以释放空间。`
        });
      }
      if (totalSize >= 50 * 1024 * 1024 * 1024) {
        warnings.push({
          level: 'info',
          title: '存储容量较大',
          body: '建议定期检查文件和回收站，避免长期保存重复上传的临时文件。'
        });
      }

      box.classList.toggle('hidden', warnings.length === 0);
      box.innerHTML = warnings.map(item => `
        <div class="storage-warning storage-warning-${item.level}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.body)}</span>
        </div>
      `).join('');
    },
  };
}
