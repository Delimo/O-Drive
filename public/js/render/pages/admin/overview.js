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
  function renderAdminStatsGrid(stats) {
    const breakdown = Object.entries(stats.breakdown || {});
    const latest = (stats.latest || []).slice(0, 6);
    const attention = stats.attention || [];

    return `
      <div class="ov-root">
        <div class="ov-header">
          <div>
            <h2 class="ov-title">后台概览</h2>
            <p class="ov-subtitle">系统整体运行状态与资源统计</p>
          </div>
          <button class="btn toolbar-btn" type="button" data-action="refresh-admin">
            ${icons.refresh}<span>刷新</span>
          </button>
        </div>

        <div class="ov-grid">
          <div class="ov-card ov-accent-blue">
            <div class="ov-card-head">
              <span class="ov-card-icon">${icons.stats}</span>
              <span class="ov-card-label">文件总数</span>
            </div>
            <div class="ov-metric">${safeText(stats.files?.count || 0, "0")}</div>
            <div class="ov-meta">
              总容量 ${safeText(stats.files?.totalSizeFormatted, "0 B")} · ${safeText(stats.files?.folderMarkers || 0, "0")} 个文件夹
            </div>
          </div>

          <div class="ov-card ov-accent-amber">
            <div class="ov-card-head">
              <span class="ov-card-icon">${icons.trash}</span>
              <span class="ov-card-label">回收站</span>
            </div>
            <div class="ov-metric">${safeText(stats.trash?.count || 0, "0")}<span class="ov-metric-unit">项</span></div>
            <div class="ov-meta">${safeText(stats.trash?.sizeFormatted, "0 B")} · 占比 ${safeText(stats.trash?.percentOfFiles || 0, "0")}%</div>
            <div class="ov-bar"><div class="ov-bar-fill ov-bar-amber" style="width:${Math.min(stats.trash?.percentOfFiles || 0, 100)}%"></div></div>
          </div>

          <div class="ov-card ov-accent-green">
            <div class="ov-card-head">
              <span class="ov-card-icon">${icons.eye}</span>
              <span class="ov-card-label">索引状态</span>
            </div>
            <div class="ov-metric">${safeText(stats.index?.recommendation, "等待初始化")}</div>
            <div class="ov-meta">
              索引 ${safeText(stats.index?.count || 0, "0")} 条 ·
              更新于 ${safeText(stats.index?.latestUpdatedAt ? formatTime(stats.index.latestUpdatedAt) : "未知")}
            </div>
            <div class="ov-card-action">
              <button class="btn btn-primary btn-small" type="button" data-action="confirm-maintenance-action" data-maintenance-action="rebuild-index" data-maintenance-label="重建文件索引">
                ${icons.refresh}<span>重建索引</span>
              </button>
            </div>
          </div>

          <div class="ov-card ov-span-2">
            <div class="ov-card-head">
              <span class="ov-card-icon">${icons.grid}</span>
              <span class="ov-card-label">类型分布</span>
            </div>
            <div class="ov-type-grid">
              ${
                breakdown.length
                  ? breakdown.map(([key, value]) => `
                    <div class="ov-type-chip">
                      <span class="ov-type-name">${safeText(key)}</span>
                      <span class="ov-type-count">${safeText(value.count || 0, "0")}</span>
                      <span class="ov-type-size">${safeText(value.sizeFormatted || "0 B")}</span>
                    </div>
                  `).join("")
                  : '<div class="ov-empty">暂无分类数据</div>'
              }
            </div>
          </div>

          <div class="ov-card">
            <div class="ov-card-head">
              <span class="ov-card-icon">${icons.bell}</span>
              <span class="ov-card-label">系统提醒</span>
            </div>
            <div class="ov-alert-list">
              ${
                attention.length
                  ? attention.map((item) => `
                    <div class="ov-alert-item" data-level="${safeText(item.level || "info")}">
                      <div class="ov-alert-title">${safeText(item.title || "系统提示")}</div>
                      <div class="ov-alert-body">${safeText(item.body || "")}</div>
                    </div>
                  `).join("")
                  : '<div class="ov-empty">暂无系统提醒</div>'
              }
            </div>
          </div>

          <div class="ov-card ov-span-full">
            <div class="ov-card-head">
              <span class="ov-card-icon">${icons.list}</span>
              <span class="ov-card-label">最近资源</span>
            </div>
            <div class="ov-latest-wrap">
              ${
                latest.length
                  ? latest.map((item) => `
                    <div class="ov-latest-chip">
                      <div class="ov-latest-name">${safeText(item.name || item.key || "")}</div>
                      <div class="ov-latest-meta">
                        ${safeText(item.sizeFormatted || formatBytes(item.size || 0), "0 B")} · ${safeText(formatRelative(item.uploaded || 0), "刚刚")}
                      </div>
                    </div>
                  `).join("")
                  : '<div class="ov-empty">暂无最近资源记录</div>'
              }
            </div>
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
