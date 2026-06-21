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
      <div style="margin-bottom:16px;">
        <h2 style="font-size:20px;font-weight:700;color:var(--text);margin:0;">后台概览</h2>
      </div>
      <div class="admin-grid" style="gap:12px;">
        <div class="admin-card span-4">
          <div class="admin-card-header">
            <span class="admin-card-icon">${icons.stats}</span>
            <span class="admin-label">文件总数</span>
          </div>
          <div class="admin-value">${safeText(stats.files?.count || 0, "0")}</div>
          <div class="admin-copy">
            总容量 ${safeText(stats.files?.totalSizeFormatted, "0 B")}，文件夹 ${safeText(stats.files?.folderMarkers || 0, "0")}。
          </div>
          <div class="admin-status-row">
            <span class="toolbar-tag tag-active">存储正常</span>
          </div>
        </div>

        <div class="admin-card span-4">
          <div class="admin-card-header">
            <span class="admin-card-icon">${icons.trash}</span>
            <span class="admin-label">回收站项目</span>
          </div>
          <div class="admin-value">${safeText(stats.trash?.count || 0, "0")}</div>
          <div class="admin-copy">
            累计 ${safeText(stats.trash?.sizeFormatted, "0 B")}，约占 ${safeText(stats.trash?.percentOfFiles || 0, "0")}%。
          </div>
          <div class="admin-status-row">
            ${
              (stats.trash?.count || 0) > 0
                ? '<span class="toolbar-tag tag-soon">建议清理</span>'
                : '<span class="toolbar-tag tag-active">已清空</span>'
            }
          </div>
        </div>

        <div class="admin-card span-4">
          <div class="admin-card-header">
            <span class="admin-card-icon">${icons.eye}</span>
            <span class="admin-label">索引状态</span>
          </div>
          <div class="admin-value">${safeText(stats.index?.recommendation, "等待初始化")}</div>
          <div class="admin-copy" style="margin-bottom:8px;">
            索引 ${safeText(stats.index?.count || 0, "0")} 条，更新于
            ${safeText(stats.index?.latestUpdatedAt ? formatTime(stats.index.latestUpdatedAt) : "未知")}。
          </div>
          <div class="admin-status-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span class="toolbar-tag tag-active">${safeText(stats.index?.recommendation, "正常")}</span>
            <button class="btn btn-primary btn-small" type="button" data-action="confirm-maintenance-action" data-maintenance-action="rebuild-index" data-maintenance-label="重建文件索引" style="padding:0 8px;font-size:11px;min-height:24px;">
              ${icons.refresh}<span>立即重建</span>
            </button>
          </div>
        </div>

        <div class="admin-card span-8">
          <div class="admin-card-header">
            <span class="admin-card-icon">${icons.grid}</span>
            <span class="admin-label">类型分布</span>
          </div>
          <div class="type-grid">
            ${
              breakdown.length
                ? breakdown
                    .map(
                      ([key, value]) => `
                  <div class="type-chip">
                    <span class="type-chip-name">${safeText(key)}</span>
                    <span class="type-chip-meta">${safeText(value.count || 0, "0")} 项 · ${safeText(value.sizeFormatted || formatBytes(value.size || 0), "0 B")}</span>
                  </div>
                `,
                    )
                    .join("")
                : '<div class="muted" style="font-size:13px;padding:8px 0;">暂无分类数据</div>'
            }
          </div>
        </div>

        <div class="admin-card span-4">
          <div class="admin-card-header">
            <span class="admin-card-icon">${icons.bell}</span>
            <span class="admin-label">系统提醒</span>
          </div>
          <div class="attention-list-compact">
            ${
              attention.length
                ? attention
                    .map(
                      (item) => `
                  <article class="attention-item" data-level="${safeText(item.level || "info")}">
                    <h3 class="attention-title">${safeText(item.title || "系统提示")}</h3>
                    <div class="attention-copy">${safeText(item.body || "")}</div>
                  </article>
                `,
                    )
                    .join("")
                : '<div class="muted" style="font-size:13px;padding:8px 0;">暂无系统提醒</div>'
            }
          </div>
        </div>

        <div class="admin-card span-12">
          <div class="admin-card-header">
            <span class="admin-card-icon">${icons.list}</span>
            <span class="admin-label">最近资源</span>
          </div>
          <div class="latest-grid">
            ${
              latest.length
                ? latest
                    .map(
                      (item) => `
                  <article class="latest-chip">
                    <h3 class="latest-chip-name">${safeText(item.name || item.key || "")}</h3>
                    <div class="latest-chip-meta">
                      ${safeText(item.sizeFormatted || formatBytes(item.size || 0), "0 B")} · ${safeText(formatRelative(item.uploaded || 0), "刚刚")}
                    </div>
                  </article>
                `,
                    )
                    .join("")
                : '<div class="muted" style="font-size:13px;padding:8px 0;">暂无最近资源记录</div>'
            }
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
