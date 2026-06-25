export function createOverviewRenderer({
  safeText, escapeHtml, formatTime, formatRelative
}) {

  function getExtColor(ext) {
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '#10b981';
    if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return '#8b5cf6';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return '#ec4899';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) return '#0e7490';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '#f59e0b';
    return '#64748b';
  }

  function getExtBg(ext) {
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'rgba(16,185,129,0.1)';
    if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return 'rgba(139,92,246,0.1)';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'rgba(236,72,153,0.1)';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) return 'rgba(14,116,144,0.1)';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'rgba(245,158,11,0.1)';
    return 'rgba(100,116,139,0.1)';
  }

  function renderAdminStatsGrid(stats) {
    if (!stats) return ``;
    const { files = {}, trash = {}, index = {}, shares = {}, latest = [], breakdown = {}, attention = [], logs = {}, tasks = {}, thumbnailsPresent = false } = stats;
    const warnings = attention.filter(i => i.level === "warning");
    const anomalies = { total: warnings.length, items: warnings };
    const recentFiles = latest.slice(0, 6);

    const breakdownItems = Object.entries(breakdown || {});
    const totalBreakdown = breakdownItems.reduce((sum, [_, val]) => sum + (val.count || 0), 0) || 1;

    return `
      <div class="ov-overview">
        <div class="ov-overview-header">
          <div class="ov-overview-title-group">
            <h2 class="ov-overview-title">系统概览</h2>
            <p class="ov-overview-desc">存储状态与文件指标一览</p>
          </div>
          <button class="btn" type="button" data-action="refresh-admin">
            <span class="icon">${''}</span>
            刷新
          </button>
        </div>

        <div class="ov-overview-stats">
          <div class="ov-stat-card">
            <div class="ov-stat-icon" style="background:rgba(14,116,144,0.1);color:#0e7490;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
            </div>
            <div class="ov-stat-body">
              <span class="ov-stat-label">文件总量</span>
              <span class="ov-stat-value">${safeText(files.count, "0")}</span>
            </div>
          </div>

          <div class="ov-stat-card">
            <div class="ov-stat-icon" style="background:rgba(139,92,246,0.1);color:#8b5cf6;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </div>
            <div class="ov-stat-body">
              <span class="ov-stat-label">占用空间</span>
              <span class="ov-stat-value">${safeText(files.totalSizeFormatted, "0 B")}</span>
            </div>
          </div>

          <div class="ov-stat-card">
            <div class="ov-stat-icon" style="background:rgba(16,185,129,0.1);color:#10b981;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </div>
            <div class="ov-stat-body">
              <span class="ov-stat-label">分享链接</span>
              <span class="ov-stat-value">${safeText(shares.total, "0")}</span>
            </div>
          </div>

          <div class="ov-stat-card">
            <div class="ov-stat-icon" style="background:rgba(245,158,11,0.1);color:#f59e0b;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </div>
            <div class="ov-stat-body">
              <span class="ov-stat-label">回收站</span>
              <span class="ov-stat-value">${safeText(trash.count, "0")}</span>
              <span class="ov-stat-sub">${safeText(trash.sizeFormatted, "0 B")}</span>
            </div>
          </div>
        </div>

        <div class="ov-overview-grid">
          <div class="ov-overview-left">
            <div class="ov-section">
              <div class="ov-section-head">
                <span class="ov-section-title">最近上传</span>
              </div>
              <div class="ov-section-body ov-recent-list">
                ${recentFiles && recentFiles.length > 0 ? recentFiles.map(file => {
                  const ext = (file.key || '').split('.').pop().toLowerCase();
                  const extColor = getExtColor(ext);
                  const extBg = getExtBg(ext);
                  return `
                    <div class="ov-recent-item">
                      <div class="ov-recent-icon" style="background:${extBg};color:${extColor};">
                        <span style="font-size:10px;font-weight:700;text-transform:uppercase;">${escapeHtml(ext.slice(0,4))}</span>
                      </div>
                      <div class="ov-recent-info">
                        <span class="ov-recent-name">${escapeHtml(file.key)}</span>
                        <span class="ov-recent-meta">${safeText(file.sizeFormatted)} · ${formatRelative(file.uploaded)}</span>
                      </div>
                    </div>
                  `;
                }).join("") : `
                  <div class="ov-empty-inline">暂无上传记录</div>
                `}
              </div>
            </div>

            <div class="ov-section">
              <div class="ov-section-head">
                <span class="ov-section-title">维护中心</span>
              </div>
              <div class="ov-section-body" style="display:flex;flex-direction:column;gap:8px;">
                <div class="ov-maint-grid">
                  <div class="ov-maint-item">
                    <div class="ov-maint-info">
                      <span class="ov-maint-label">索引记录</span>
                      <span class="ov-maint-value">${safeText(index.count, "0")}</span>
                    </div>
                    ${index.latestUpdatedAt ? `<span class="ov-maint-time">${formatRelative(index.latestUpdatedAt)}</span>` : ''}
                  </div>
                  <div class="ov-maint-item">
                    <div class="ov-maint-info">
                      <span class="ov-maint-label">回收站占用</span>
                      <span class="ov-maint-value">${safeText(trash.sizeFormatted, "0 B")}</span>
                    </div>
                    <span class="ov-maint-count">${safeText(trash.count, "0")} 项</span>
                  </div>
                  <div class="ov-maint-item">
                    <div class="ov-maint-info">
                      <span class="ov-maint-label">缩略图缓存</span>
                      <span class="ov-maint-value">${thumbnailsPresent ? "有缓存" : "无缓存"}</span>
                    </div>
                    ${thumbnailsPresent 
                      ? `<span class="ov-maint-tag" style="background:rgba(14,116,144,0.1);color:var(--accent);">已生成</span>`
                      : `<span class="ov-maint-tag">未生成</span>`}
                  </div>
                  <div class="ov-maint-item">
                    <div class="ov-maint-info">
                      <span class="ov-maint-label">异常</span>
                      <span class="ov-maint-value">${safeText(anomalies.total, "0")}</span>
                    </div>
                    ${anomalies.total > 0 
                      ? `<span class="ov-maint-tag" style="background:rgba(239,68,68,0.1);color:#ef4444;">需处理</span>`
                      : `<span class="ov-maint-tag" style="background:rgba(16,185,129,0.1);color:#10b981;">正常</span>`}
                  </div>
                  <div class="ov-maint-item">
                    <div class="ov-maint-info">
                      <span class="ov-maint-label">操作日志</span>
                      <span class="ov-maint-value">${safeText(logs.count, "0")}</span>
                    </div>
                    <span class="ov-maint-tag">条记录</span>
                  </div>
                  <div class="ov-maint-item">
                    <div class="ov-maint-info">
                      <span class="ov-maint-label">已完成任务</span>
                      <span class="ov-maint-value">${safeText(tasks.completed, "0")}</span>
                    </div>
                    <span class="ov-maint-tag">项完成</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="ov-overview-right">
            <div class="ov-section">
              <div class="ov-section-head">
                <span class="ov-section-title">类型分布</span>
                <button class="btn btn-sm" type="button" data-action="refresh-admin">刷新</button>
              </div>
              <div class="ov-section-body ov-breakdown-chart">
                ${breakdownItems.length > 0 ? (() => {
                  const colors = ['#10b981', '#8b5cf6', '#ec4899', '#0e7490', '#f59e0b', '#64748b'];
                  return breakdownItems.map(([category, info], i) => {
                    const count = info.count || 0;
                    const pct = Math.min(100, Math.round((count / totalBreakdown) * 100));
                    const color = colors[i % colors.length];
                    return `
                      <div class="ov-breakdown-row">
                        <span class="ov-breakdown-name">${escapeHtml(category)}</span>
                        <div class="ov-breakdown-track">
                          <div class="ov-breakdown-fill" style="width:${pct}%;background:${color};"></div>
                        </div>
                        <span class="ov-breakdown-count">${count}</span>
                        <span class="ov-breakdown-pct">${pct}%</span>
                      </div>
                    `;
                  }).join("");
                })() : `
                  <div class="ov-empty-inline">暂无分类数据</div>
                `}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderAdminErrorState(error) {
    return `
      <div class="ov-overview">
        <div class="ov-overview-header">
          <div class="ov-overview-title-group">
            <h2 class="ov-overview-title">系统概览</h2>
            <p class="ov-overview-desc">存储状态与文件指标一览</p>
          </div>
        </div>
        <div class="ov-overview-error">
          <div class="ov-error-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <p class="ov-error-text">${escapeHtml(error)}</p>
          <button class="btn" type="button" data-action="refresh-admin">重新加载</button>
        </div>
      </div>
    `;
  }

  return { renderAdminStatsGrid, renderAdminErrorState };
}
