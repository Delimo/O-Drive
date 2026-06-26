export function createOverviewRenderer({
  safeText, escapeHtml, formatRelative
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

  const BREAKDOWN_PRESETS = [
    { keys: ['image', 'img', 'photo', 'pictures'], label: '图片', color: '#14b8a6', tint: 'rgba(20,184,166,0.16)' },
    { keys: ['video', 'movie'], label: '视频', color: '#8b5cf6', tint: 'rgba(139,92,246,0.16)' },
    { keys: ['audio', 'music'], label: '音频', color: '#ec4899', tint: 'rgba(236,72,153,0.16)' },
    { keys: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'], label: '文档', color: '#0ea5e9', tint: 'rgba(14,165,233,0.16)' },
    { keys: ['zip', 'rar', '7z', 'tar', 'gz', 'archive'], label: '压缩包', color: '#f59e0b', tint: 'rgba(245,158,11,0.16)' },
    { keys: ['exe', 'apk', 'dll', 'deb', 'rpm'], label: '程序', color: '#ef4444', tint: 'rgba(239,68,68,0.16)' },
    { keys: ['folder'], label: '文件夹', color: '#22c55e', tint: 'rgba(34,197,94,0.16)' },
  ];

  function getBreakdownMeta(category, index = 0) {
    const raw = String(category || '').trim();
    const lowered = raw.toLowerCase();
    const matched = BREAKDOWN_PRESETS.find(item => item.keys.includes(lowered));
    const fallbackPalette = [
      { label: '图片', color: '#14b8a6', tint: 'rgba(20,184,166,0.16)' },
      { label: '视频', color: '#8b5cf6', tint: 'rgba(139,92,246,0.16)' },
      { label: '音频', color: '#ec4899', tint: 'rgba(236,72,153,0.16)' },
      { label: '文档', color: '#0ea5e9', tint: 'rgba(14,165,233,0.16)' },
      { label: '压缩包', color: '#f59e0b', tint: 'rgba(245,158,11,0.16)' },
      { label: '程序', color: '#ef4444', tint: 'rgba(239,68,68,0.16)' },
      { label: '其他', color: '#94a3b8', tint: 'rgba(148,163,184,0.16)' },
    ];

    if (matched) {
      return {
        label: matched.label,
        color: matched.color,
        tint: matched.tint,
        keyLabel: raw && raw !== matched.label ? raw : '',
      };
    }

    if (lowered === 'other' || lowered === 'others' || raw === '其他') {
      return {
        label: '其他',
        color: '#94a3b8',
        tint: 'rgba(148,163,184,0.16)',
        keyLabel: raw && raw !== '其他' ? raw : '',
      };
    }

    const fallback = fallbackPalette[index % fallbackPalette.length];
    return {
      label: raw || '未分类',
      color: fallback.color,
      tint: fallback.tint,
      keyLabel: raw && raw !== fallback.label ? raw : '',
    };
  }

  function buildBreakdownModel(entries) {
    const normalized = entries
      .map(([category, info], index) => ({
        category: String(category || '').trim(),
        count: Number(info?.count || 0),
        ...getBreakdownMeta(category, index),
      }))
      .filter(item => item.count > 0);

    if (!normalized.length) {
      return {
        items: [],
        total: 0,
        categories: 0,
        otherCount: 0,
        dominant: null,
        gradient: '',
      };
    }

    const nonOther = normalized
      .filter(item => {
        const lowered = item.category.toLowerCase();
        return lowered !== 'other' && lowered !== 'others' && lowered !== '其他';
      })
      .sort((a, b) => b.count - a.count);

    const otherCount = normalized
      .filter(item => {
        const lowered = item.category.toLowerCase();
        return lowered === 'other' || lowered === 'others' || lowered === '其他';
      })
      .reduce((sum, item) => sum + item.count, 0);

    const visibleItems = nonOther.slice(0, 5);
    const overflowCount = nonOther.slice(5).reduce((sum, item) => sum + item.count, 0);
    const mergedOther = otherCount + overflowCount;

    if (mergedOther > 0) {
      visibleItems.push({
        category: 'other',
        label: '其他',
        keyLabel: overflowCount > 0 ? '合并剩余' : '',
        count: mergedOther,
        color: '#94a3b8',
        tint: 'rgba(148,163,184,0.16)',
      });
    }

    const total = visibleItems.reduce((sum, item) => sum + item.count, 0);
    let cursor = 0;
    const gradient = total > 0
      ? visibleItems.map((item) => {
          const span = (item.count / total) * 360;
          const start = cursor;
          const end = cursor + span;
          cursor = end;
          return `${item.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
        }).join(', ')
      : '';

    return {
      items: visibleItems,
      total,
      categories: normalized.length,
      otherCount: mergedOther,
      dominant: visibleItems[0] || null,
      gradient,
    };
  }

  function renderAdminStatsGrid(stats) {
    if (!stats) return ``;
    const { files = {}, trash = {}, index = {}, shares = {}, latest = [], breakdown = {}, attention = [], logs = {}, tasks = {}, thumbnailsPresent = false } = stats;
    const warnings = attention.filter(i => i.level === "warning");
    const anomalies = { total: warnings.length, items: warnings };
    const recentFiles = latest.slice(0, 6);

    const breakdownItems = Object.entries(breakdown || {});
    const breakdownModel = buildBreakdownModel(breakdownItems);
    const dominantPct = breakdownModel.dominant && breakdownModel.total
      ? Math.round((breakdownModel.dominant.count / breakdownModel.total) * 100)
      : 0;

    return `
      <div class="ov-overview">
        <div class="ov-overview-header">
          <div class="ov-overview-title-group">
            <h2 class="ov-overview-title">系统概览</h2>
            <p class="ov-overview-desc">存储状态与文件指标一览</p>
          </div>
          <button class="btn" type="button" data-action="refresh-admin">
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
                        <span class="ov-recent-meta">${safeText(file.sizeFormatted)} · ${formatRelative(Math.floor(file.uploaded / 1000))}</span>
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
                <span class="ov-section-meta">${safeText(breakdownModel.total, "0")} 项 / ${safeText(breakdownModel.categories, "0")} 类</span>
              </div>
              <div class="ov-section-body ov-type-body">
                ${breakdownModel.items.length > 0 ? `
                  <div class="ov-type-stacked-bar" role="img" aria-label="文件类型分布">
                    ${breakdownModel.items.map((item) => {
                      const pct = breakdownModel.total ? (item.count / breakdownModel.total * 100) : 0;
                      return `<div class="ov-type-bar-segment" style="width:${pct}%;background:${item.color};" title="${escapeHtml(item.label)}: ${pct.toFixed(1)}%"></div>`;
                    }).join("")}
                  </div>
                  <div class="ov-type-legend">
                    ${breakdownModel.items.map((item) => {
                      const pct = breakdownModel.total ? Math.round((item.count / breakdownModel.total) * 100) : 0;
                      return `
                        <div class="ov-type-row">
                          <span class="ov-type-dot" style="background:${item.color};"></span>
                          <span class="ov-type-name">${escapeHtml(item.label)}</span>
                          <span class="ov-type-count">${safeText(item.count, "0")}</span>
                          <span class="ov-type-pct">${pct}%</span>
                          <div class="ov-type-track"><i style="width:${pct}%;background:${item.color};"></i></div>
                        </div>
                      `;
                    }).join("")}
                  </div>
                ` : `
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
