export function createOverviewRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyStateCompact,
  formatBytes,
  formatTime,
  formatRelative,
  components,
}) {
  function renderRingChart(breakdown) {
    const entries = Object.entries(breakdown);
    if (!entries.length) return "";

    const colors = ["#0e7490", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444", "#6366f1", "#ec4899", "#14b8a6"];
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const total = entries.reduce((s, [, v]) => s + (v.count || 0), 0);
    if (!total) return "";

    let offset = 0;
    const segments = entries.map(([key, val], i) => {
      const pct = (val.count || 0) / total;
      const len = pct * circumference;
      const seg = `<circle cx="50" cy="50" r="${radius}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="10" stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}" stroke-linecap="round" />`;
      offset += len;
      return seg;
    });

    return `
      <div class="ov-ring-wrap">
        <svg class="ov-ring-svg" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="var(--track-bg, rgba(148,163,184,0.12))" stroke-width="10" />
          ${segments.join("")}
          <text x="50" y="48" text-anchor="middle" class="ov-ring-total">${safeText(total, "0")}</text>
          <text x="50" y="58" text-anchor="middle" class="ov-ring-label">总计</text>
        </svg>
      </div>
    `;
  }

  function renderAdminStatsGrid(stats) {
    const breakdown = stats.breakdown || {};
    const latest = (stats.latest || []).slice(0, 8);
    const attention = stats.attention || [];
    const fileCount = stats.files?.count || 0;
    const totalSize = stats.files?.totalSizeFormatted || "0 B";
    const folders = stats.files?.folderMarkers || 0;
    const trashCount = stats.trash?.count || 0;
    const trashSize = stats.trash?.sizeFormatted || "0 B";
    const trashPct = Math.min(stats.trash?.percentOfFiles || 0, 100);
    const indexRec = stats.index?.recommendation || "等待初始化";
    const indexCount = stats.index?.count || 0;
    const indexTime = stats.index?.latestUpdatedAt ? formatTime(stats.index.latestUpdatedAt) : "未知";
    const latestUpload = stats.latest?.[0]?.uploaded ? formatRelative(stats.latest[0].uploaded) : "暂无";

    return `
      <div class="ov-page">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title">后台概览</h2>
            <p class="ov-page-desc">系统整体运行状态与资源统计</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin">
            ${icons.refresh}<span>刷新</span>
          </button>
        </div>

        <div class="ov-hero-stats">
          <div class="ov-hero-card ov-hero-blue">
            <div class="ov-hero-icon">${icons.stats}</div>
            <div class="ov-hero-body">
              <div class="ov-hero-label">文件总数</div>
              <div class="ov-hero-value">${safeText(fileCount, "0")}</div>
              <div class="ov-hero-meta">${safeText(totalSize)} · ${safeText(folders, "0")} 个文件夹</div>
            </div>
          </div>

          <div class="ov-hero-card ov-hero-amber">
            <div class="ov-hero-icon">${icons.trash}</div>
            <div class="ov-hero-body">
              <div class="ov-hero-label">回收站</div>
              <div class="ov-hero-value">${safeText(trashCount, "0")}<span class="ov-hero-unit">项</span></div>
              <div class="ov-hero-meta">${safeText(trashSize)} · 占比 ${safeText(stats.trash?.percentOfFiles || 0, "0")}%</div>
            </div>
            <div class="ov-hero-bar"><div class="ov-hero-bar-fill ov-bar-amber" style="width:${trashPct}%"></div></div>
          </div>

          <div class="ov-hero-card ov-hero-green">
            <div class="ov-hero-icon">${icons.eye}</div>
            <div class="ov-hero-body">
              <div class="ov-hero-label">索引状态</div>
              <div class="ov-hero-value ov-hero-value-sm">${safeText(indexRec)}</div>
              <div class="ov-hero-meta">${safeText(indexCount, "0")} 条 · 更新于 ${safeText(indexTime)}</div>
            </div>
            <div class="ov-hero-action">
              <button class="btn btn-primary btn-small" type="button" data-action="confirm-maintenance-action" data-maintenance-action="rebuild-index" data-maintenance-label="重建文件索引">
                ${icons.refresh}<span>重建索引</span>
              </button>
            </div>
          </div>

          <div class="ov-hero-card ov-hero-purple">
            <div class="ov-hero-icon">${icons.grid}</div>
            <div class="ov-hero-body">
              <div class="ov-hero-label">存储占比</div>
              <div class="ov-hero-value">${safeText(stats.trash?.percentOfFiles || 0, "0")}%</div>
              <div class="ov-hero-meta">回收站占文件总量</div>
            </div>
            <div class="ov-hero-bar"><div class="ov-hero-bar-fill" style="width:${trashPct}%"></div></div>
          </div>
        </div>

        <div class="ov-quick-bar">
          <div class="ov-quick-item">
            <span class="ov-quick-icon">${icons.folder}</span>
            <span class="ov-quick-text">文件夹 <strong>${safeText(folders, "0")}</strong></span>
          </div>
          <div class="ov-quick-dot"></div>
          <div class="ov-quick-item">
            <span class="ov-quick-icon">${icons.share}</span>
            <span class="ov-quick-text">分享 <strong>${safeText(stats.shares?.total || 0, "0")}</strong></span>
          </div>
          <div class="ov-quick-dot"></div>
          <div class="ov-quick-item">
            <span class="ov-quick-icon">${icons.upload}</span>
            <span class="ov-quick-text">最近上传 <strong>${safeText(latestUpload)}</strong></span>
          </div>
          <div class="ov-quick-dot"></div>
          <div class="ov-quick-item">
            <span class="ov-quick-icon">${icons.bell}</span>
            <span class="ov-quick-text">提醒 <strong>${safeText(attention.length, "0")}</strong></span>
          </div>
        </div>

        <div class="ov-two-col">
          <div class="ov-col-left">
            <div class="ov-section-card">
              <div class="ov-section-head">
                <span class="ov-section-icon">${icons.grid}</span>
                <span class="ov-section-title">类型分布</span>
              </div>
              <div class="ov-type-body">
                ${renderRingChart(breakdown)}
                <div class="ov-type-legend">
                  ${Object.entries(breakdown).map(([key, val], i) => {
                    const colors = ["#0e7490", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444", "#6366f1", "#ec4899", "#14b8a6"];
                    const pct = fileCount ? ((val.count || 0) / fileCount * 100).toFixed(1) : "0";
                    return `
                      <div class="ov-legend-item">
                        <span class="ov-legend-dot" style="background:${colors[i % colors.length]}"></span>
                        <span class="ov-legend-name">${safeText(key)}</span>
                        <span class="ov-legend-count">${safeText(val.count || 0, "0")}</span>
                        <span class="ov-legend-pct">${pct}%</span>
                      </div>
                    `;
                  }).join("") || '<div class="ov-empty">暂无分类数据</div>'}
                </div>
              </div>
            </div>
          </div>

          <div class="ov-col-right">
            <div class="ov-section-card">
              <div class="ov-section-head">
                <span class="ov-section-icon">${icons.bell}</span>
                <span class="ov-section-title">系统提醒</span>
              </div>
              <div class="ov-alert-list">
                ${attention.length
                  ? attention.map((item) => `
                    <div class="ov-alert-item" data-level="${safeText(item.level || "info")}">
                      <div class="ov-alert-dot"></div>
                      <div class="ov-alert-content">
                        <div class="ov-alert-title">${safeText(item.title || "系统提示")}</div>
                        <div class="ov-alert-body">${safeText(item.body || "")}</div>
                      </div>
                    </div>
                  `).join("")
                  : '<div class="ov-empty">暂无系统提醒</div>'}
              </div>
            </div>
          </div>
        </div>

        <div class="ov-section-card">
          <div class="ov-section-head">
            <span class="ov-section-icon">${icons.list}</span>
            <span class="ov-section-title">最近资源</span>
          </div>
          <div class="ov-recent-grid">
            ${latest.length
              ? latest.map((item) => `
                <div class="ov-recent-chip">
                  <div class="ov-recent-name">${safeText(item.name || item.key || "")}</div>
                  <div class="ov-recent-meta">
                    ${safeText(item.sizeFormatted || formatBytes(item.size || 0), "0 B")} · ${safeText(formatRelative(item.uploaded || 0), "刚刚")}
                  </div>
                </div>
              `).join("")
              : '<div class="ov-empty">暂无最近资源记录</div>'}
          </div>
        </div>
      </div>
    `;
  }

  function renderAdminErrorState(error) {
    return `
      <div class="empty-state">
        <div>
          <div class="empty-orb">${icons.lock}</div>
          <h3 class="empty-title">概览加载失败</h3>
          <p class="empty-copy">${escapeHtml(error)}</p>
          <div style="margin-top:18px;">
            <button class="btn btn-primary" type="button" data-action="refresh-admin">
              ${icons.refresh}
              <span>重新加载</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return { renderAdminStatsGrid, renderAdminErrorState };
}
