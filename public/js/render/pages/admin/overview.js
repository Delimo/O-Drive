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
      <div class="ov2-ring-wrap">
        <svg class="ov2-ring-svg" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="${radius}" fill="none" stroke="var(--track-bg, rgba(148,163,184,0.12))" stroke-width="10" />
          ${segments.join("")}
          <text x="50" y="48" text-anchor="middle" class="ov2-ring-total">${safeText(total, "0")}</text>
          <text x="50" y="58" text-anchor="middle" class="ov2-ring-label">总计</text>
        </svg>
      </div>
    `;
  }

  function renderAdminStatsGrid(stats) {
    const breakdown = stats.breakdown || {};
    const latest = (stats.latest || []).slice(0, 4);
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
    const sharesTotal = stats.shares?.total || 0;
    const latestUpload = stats.latest?.[0]?.uploaded ? formatRelative(stats.latest[0].uploaded) : "暂无";
    const fileColors = ["#0e7490", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444", "#6366f1", "#ec4899", "#14b8a6"];

    const typeChips = Object.entries(breakdown).length
      ? Object.entries(breakdown).map(([key, val], i) => {
          const pct = fileCount ? ((val.count || 0) / fileCount * 100).toFixed(1) : "0";
          return `
            <div class="type-chip">
              <div class="type-chip-name">
                <span class="ov2-chip-dot" style="background:${fileColors[i % fileColors.length]}"></span>
                ${safeText(key)}
              </div>
              <div class="type-chip-meta">${safeText(val.count || 0, "0")} 个文件 · ${pct}%</div>
            </div>
          `;
        }).join("")
      : '<div class="ov2-empty">暂无分类数据</div>';

    const alertItems = attention.length
      ? attention.map((item) => {
          const level = item.level || "info";
          const dotColor = level === "warning" ? "#d97706" : level === "ok" ? "#16a34a" : "var(--accent)";
          return `
            <div class="attention-item" data-level="${safeText(level)}">
              <div class="attention-title">
                <span class="ov2-alert-dot" style="background:${dotColor}"></span>
                ${safeText(item.title || "系统提示")}
              </div>
              ${item.body ? `<div class="attention-copy">${safeText(item.body)}</div>` : ""}
            </div>
          `;
        }).join("")
      : '<div class="ov2-empty">暂无系统提醒</div>';

    const recentItems = latest.length
      ? latest.map((item) => `
          <div class="latest-chip">
            <div class="latest-chip-name">${safeText(item.name || item.key || "")}</div>
            <div class="latest-chip-meta">${safeText(item.sizeFormatted || formatBytes(item.size || 0), "0 B")} · ${safeText(formatRelative(item.uploaded || 0), "刚刚")}</div>
          </div>
        `).join("")
      : '<div class="ov2-empty ov2-empty-full">暂无最近资源记录</div>';

    return `
      <div class="ov-page">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title">后台概览</h2>
            <p class="ov-page-desc">系统整体运行状态与资源统计</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin">刷新</button>
        </div>

        <div class="ov2-hero">
          <div class="ov2-hero-card">
            <div class="ov2-hero-icon" style="background:rgba(14,116,144,0.1);color:#0e7490">${icons.stats}</div>
            <div class="ov2-hero-body">
              <span class="admin-label">文件总数</span>
              <div class="admin-value">${safeText(fileCount, "0")}</div>
              <div class="admin-copy">${safeText(totalSize)} · ${safeText(folders, "0")} 个文件夹</div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-icon" style="background:rgba(217,119,6,0.1);color:#d97706">${icons.trash}</div>
            <div class="ov2-hero-body">
              <span class="admin-label">回收站</span>
              <div class="admin-value">${safeText(trashCount, "0")}<span class="admin-value-unit">项</span></div>
              <div class="admin-copy">${safeText(trashSize)} · 占比 ${safeText(trashPct, "0")}%</div>
              <div class="ov2-hero-track">
                <div class="ov2-hero-fill" style="width:${trashPct}%;background:#d97706"></div>
              </div>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-icon" style="background:rgba(5,150,105,0.1);color:#059669">${icons.eye}</div>
            <div class="ov2-hero-body">
              <span class="admin-label">索引状态</span>
              <div class="admin-value" style="font-size:20px">${safeText(indexRec)}</div>
              <div class="admin-copy">${safeText(indexCount, "0")} 条 · ${safeText(indexTime)}</div>
              <button class="btn btn-primary btn-small" style="margin-top:6px" type="button" data-action="confirm-maintenance-action" data-maintenance-action="rebuild-index" data-maintenance-label="重建文件索引">重建索引</button>
            </div>
          </div>
          <div class="ov2-hero-card">
            <div class="ov2-hero-icon" style="background:rgba(124,58,237,0.1);color:#7c3aed">${icons.share}</div>
            <div class="ov2-hero-body">
              <span class="admin-label">分享</span>
              <div class="admin-value">${safeText(sharesTotal, "0")}</div>
              <div class="admin-copy">最近上传 ${safeText(latestUpload)}</div>
            </div>
          </div>
        </div>

        <div class="admin-grid">
          <div class="admin-card span-7">
            <div class="admin-card-header">
              <div class="admin-card-icon">${icons.grid}</div>
              <span class="admin-label">文件类型分布</span>
            </div>
            <div class="ov2-type-body">
              ${renderRingChart(breakdown)}
              <div class="type-grid" style="flex:1">${typeChips}</div>
            </div>
          </div>
          <div class="admin-card span-5">
            <div class="admin-card-header">
              <div class="admin-card-icon" style="background:rgba(217,119,6,0.1);color:#d97706">${icons.bell}</div>
              <span class="admin-label">系统提醒</span>
              ${attention.length ? `<span class="badge badge-warning">${attention.length}</span>` : ""}
            </div>
            <div class="attention-list-compact">${alertItems}</div>
          </div>
        </div>

        <div class="admin-card">
          <div class="admin-card-header">
            <div class="admin-card-icon">${icons.list}</div>
            <span class="admin-label">最近活动</span>
          </div>
          <div class="latest-grid">${recentItems}</div>
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
            <button class="btn btn-primary" type="button" data-action="refresh-admin">重新加载</button>
          </div>
        </div>
      </div>
    `;
  }

  return { renderAdminStatsGrid, renderAdminErrorState };
}
