export function createOverviewRenderer({
  safeText, escapeHtml, formatTime
}) {

  function getExtBadge(fileName) {
    const ext = fileName.split('.').pop().toLowerCase().slice(0, 4) || 'file';
    let cls = 'ap-ext-default';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) cls = 'ap-ext-img';
    else if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) cls = 'ap-ext-video';
    else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) cls = 'ap-ext-audio';
    else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) cls = 'ap-ext-doc';
    else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) cls = 'ap-ext-archive';
    return `<span class="ap-ext ${cls}">${ext}</span>`;
  }

  function renderBreakdownList(breakdown) {
    const items = Object.entries(breakdown || {});
    if (items.length === 0) return `<p class="ap-empty-inline">暂无数据</p>`;
    const totalCount = items.reduce((sum, [_, val]) => sum + (val.count || 0), 0) || 1;
    const colorMap = { '图片': '#10b981', '视频': '#8b5cf6', '音频': '#ec4899', '文档': '#0e7490' };

    return items.map(([category, info]) => {
      const count = info.count || 0;
      const pct = Math.min(100, Math.round((count / totalCount) * 100));
      const color = colorMap[category] || 'var(--accent)';
      return `
        <div class="ap-bar-row">
          <div class="ap-bar-head">
            <span class="ap-bar-name">${escapeHtml(category)}</span>
            <span class="ap-bar-val">${count} (${pct}%)</span>
          </div>
          <div class="ap-track">
            <div class="ap-fill" style="width:${pct}%;background:${color};"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAdminStatsGrid(stats) {
    if (!stats) return ``;
    const { files = {}, trash = {}, index = {}, shares = {}, latest = [], breakdown = {} } = stats;

    return `
      <div class="ap">
        <div class="ap-head">
          <div>
            <h2 class="ap-title">概览控制台</h2>
            <p class="ap-desc">节点文件存储诊断与分类指标分析</p>
          </div>
          <button class="ap-btn" type="button" data-action="refresh-admin">刷新状态</button>
        </div>

        <div class="ap-ov-stats">
          <div class="ap-ov-stat">
            <span class="ap-ov-stat-label">文件总量</span>
            <span class="ap-ov-stat-val">${safeText(files.count, "0")}</span>
          </div>
          <div class="ap-ov-stat">
            <span class="ap-ov-stat-label">占用空间</span>
            <span class="ap-ov-stat-val">${safeText(files.totalSizeFormatted, "0 B")}</span>
          </div>
          <div class="ap-ov-stat">
            <span class="ap-ov-stat-label">共享链接</span>
            <span class="ap-ov-stat-val">${safeText(shares.total, "0")}</span>
          </div>
          <div class="ap-ov-stat">
            <span class="ap-ov-stat-label">待清垃圾</span>
            <span class="ap-ov-stat-val">${safeText(trash.count, "0")}</span>
          </div>
        </div>

        <div class="ap-grid">
          <div class="ap-card ap-col-7">
            <div class="ap-card-head">
              <span class="ap-lbl" style="margin:0;">最近上传</span>
            </div>
            <div class="ap-card-body" style="overflow-y:auto;max-height:220px;">
              ${latest && latest.length > 0 ? latest.map(file => `
                <div class="ap-file-row">
                  <div class="ap-file-row-main">
                    ${getExtBadge(file.name)}
                    <span class="ap-file-row-name">${escapeHtml(file.name)}</span>
                  </div>
                  <div class="ap-file-row-meta">
                    <span>${safeText(file.sizeFormatted)}</span>
                    <span>${formatTime(file.uploaded)}</span>
                  </div>
                </div>
              `).join("") : `<p class="ap-empty-inline">暂无上传记录</p>`}
            </div>
          </div>

          <div class="ap-card ap-col-5">
            <div class="ap-card-head">
              <span class="ap-lbl" style="margin:0;">类型分布</span>
            </div>
            <div class="ap-card-body" style="overflow-y:auto;max-height:130px;">
              ${renderBreakdownList(breakdown)}
            </div>
            <div style="border-top:1px solid var(--line);padding:10px 14px;">
              <div class="ap-row" style="justify-content:space-between;font-size:11px;">
                <span class="ap-desc-text" style="margin:0;">索引状态</span>
                <span class="ap-badge ap-badge-info">${escapeHtml(index.recommendation || "正常")}</span>
              </div>
              <div class="ap-row" style="justify-content:space-between;font-size:11px;margin-top:4px;">
                <span class="ap-desc-text" style="margin:0;">索引记录</span>
                <span style="font-weight:600;color:var(--text);">${safeText(index.count, "0")}</span>
              </div>
              <button class="ap-btn ap-btn-primary ap-btn-full" style="margin-top:8px;" type="button"
                      data-action="confirm-maintenance-action"
                      data-maintenance-action="rebuild-index"
                      data-maintenance-label="重建文件索引">重建文件索引</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderAdminErrorState(error) {
    return `
      <div class="ap">
        <div class="ap-head">
          <div>
            <h2 class="ap-title">概览控制台</h2>
            <p class="ap-desc">节点文件存储诊断与分类指标分析</p>
          </div>
        </div>
        <div class="ap-card">
          <div class="ap-card-body" style="text-align:center;padding:32px 20px;">
            <p style="margin:0 0 12px;color:var(--danger);font-size:13px;">${escapeHtml(error)}</p>
            <button class="ap-btn" type="button" data-action="refresh-admin">重新加载</button>
          </div>
        </div>
      </div>
    `;
  }

  return { renderAdminStatsGrid, renderAdminErrorState };
}
