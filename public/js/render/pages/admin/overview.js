export function createOverviewRenderer({
  icons, safeText, escapeHtml, renderEmptyStateCompact, formatBytes, formatTime
}) {
  
  // 渲染文件分类进度条
  function renderBreakdownList(breakdown) {
    const items = Object.entries(breakdown || {});
    if (items.length === 0) return `<p style="color:var(--muted); font-size:13px; text-align:center; padding:12px;">暂无分类数据</p>`;
    
    // 计算总数以便画比例条
    const totalCount = items.reduce((sum, [_, val]) => sum + (val.count || 0), 0) || 1;

    return items.map(([category, info]) => {
      const count = info.count || 0;
      const pct = Math.min(100, Math.round((count / totalCount) * 100));
      return `
        <div style="margin-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
            <span style="color:var(--text); font-weight:500;">${escapeHtml(category)}</span>
            <span style="color:var(--muted);">${count} 个 (${pct}%)</span>
          </div>
          <div style="height:6px; background:var(--track-bg); border-radius:3px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:var(--accent); border-radius:3px;"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAdminStatsGrid(stats) {
    if (!stats) return renderEmptyStateCompact("暂无数据", "请尝试刷新页面", icons.stats);

    const { files = {}, trash = {}, index = {}, shares = {}, latest = [], attention = [], breakdown = {} } = stats;

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px;">
        <!-- 头部标题 -->
        <div class="ov-page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:20px; font-weight:700; color:var(--text);">系统概览</h2>
            <p class="ov-page-desc" style="margin:4px 0 0; font-size:13px; color:var(--muted);">实时掌握系统运行状态与文件存储动态</p>
          </div>
          <button class="btn" type="button" data-action="refresh-admin" style="display:flex; align-items:center; gap:6px; padding:6px 12px; font-size:13px; border:1px solid var(--line); border-radius:8px; background:var(--panel);">
            <span style="width:14px; height:14px; display:inline-block;">${icons.refresh}</span> 刷新数据
          </button>
        </div>

        <!-- 四宫格核心指标 -->
        <div class="ov2-hero" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
          <div class="ov2-hero-card" style="display:flex; align-items:center; gap:14px; padding:16px; background:var(--panel); border:1px solid var(--line); border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
            <div style="width:40px; height:40px; border-radius:8px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; flex-shrink:0;">${icons.file}</div>
            <div>
              <span style="font-size:11px; text-transform:uppercase; color:var(--muted); letter-spacing:0.05em;">总文件数</span>
              <div style="font-size:20px; font-weight:700; color:var(--text); margin-top:2px;">${safeText(files.count, "0")}</div>
            </div>
          </div>
          <div class="ov2-hero-card" style="display:flex; align-items:center; gap:14px; padding:16px; background:var(--panel); border:1px solid var(--line); border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
            <div style="width:40px; height:40px; border-radius:8px; background:rgba(16,185,129,0.08); color:#10b981; display:grid; place-items:center; flex-shrink:0;">${icons.stats}</div>
            <div>
              <span style="font-size:11px; text-transform:uppercase; color:var(--muted); letter-spacing:0.05em;">存储用量</span>
              <div style="font-size:20px; font-weight:700; color:var(--text); margin-top:2px;">${safeText(files.totalSizeFormatted, "0 B")}</div>
            </div>
          </div>
          <div class="ov2-hero-card" style="display:flex; align-items:center; gap:14px; padding:16px; background:var(--panel); border:1px solid var(--line); border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
            <div style="width:40px; height:40px; border-radius:8px; background:rgba(245,158,11,0.08); color:#f59e0b; display:grid; place-items:center; flex-shrink:0;">${icons.share}</div>
            <div>
              <span style="font-size:11px; text-transform:uppercase; color:var(--muted); letter-spacing:0.05em;">活跃链接</span>
              <div style="font-size:20px; font-weight:700; color:var(--text); margin-top:2px;">${safeText(shares.total, "0")}</div>
            </div>
          </div>
          <div class="ov2-hero-card" style="display:flex; align-items:center; gap:14px; padding:16px; background:var(--panel); border:1px solid var(--line); border-radius:12px; box-shadow:0 1px 2px rgba(0,0,0,0.02);">
            <div style="width:40px; height:40px; border-radius:8px; background:rgba(239,68,68,0.08); color:#ef4444; display:grid; place-items:center; flex-shrink:0;">${icons.trash}</div>
            <div>
              <span style="font-size:11px; text-transform:uppercase; color:var(--muted); letter-spacing:0.05em;">待清垃圾</span>
              <div style="font-size:20px; font-weight:700; color:var(--text); margin-top:2px;">${safeText(trash.count, "0")}</div>
            </div>
          </div>
        </div>

        <!-- 详细信息栅格 -->
        <div class="admin-grid" style="display:grid; grid-template-columns: repeat(12, 1fr); gap:16px;">
          
          <!-- 左侧：提醒状态 + 最近上传 (8 columns) -->
          <div style="grid-column: span 8; display:flex; flex-direction:column; gap:16px;">
            
            <!-- 系统提醒 -->
            ${attention && attention.length > 0 ? `
              <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px;">
                <h3 style="margin:0 0 10px 0; font-size:14px; font-weight:600; color:var(--text); display:flex; align-items:center; gap:6px;">
                  <span style="width:16px; height:16px; color:var(--warning);">${icons.info}</span> 待处理关注项
                </h3>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${attention.map(item => `
                    <div style="display:flex; gap:10px; padding:10px; background:var(--panel-soft); border-left:4px solid ${item.level === 'warning' ? 'var(--warning)' : 'var(--accent)'}; border-radius:0 8px 8px 0;">
                      <div style="font-size:13px; font-weight:600; color:var(--text);">${escapeHtml(item.title)}:</div>
                      <div style="font-size:13px; color:var(--muted); flex:1;">${escapeHtml(item.body)}</div>
                    </div>
                  `).join("")}
                </div>
              </div>
            ` : ""}

            <!-- 最近上传列表 -->
            <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px;">
              <h3 style="margin:0 0 12px 0; font-size:14px; font-weight:600; color:var(--text);">最近上传文件</h3>
              ${latest && latest.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${latest.map(file => `
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:10px; background:var(--panel-soft); border-radius:8px; border:1px solid var(--line);">
                      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                        <span style="width:18px; height:18px; color:var(--muted); flex-shrink:0;">${icons.file}</span>
                        <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:13px; font-weight:500; color:var(--text);">${escapeHtml(file.name)}</div>
                      </div>
                      <div style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--muted); flex-shrink:0;">
                        <span>${safeText(file.sizeFormatted)}</span>
                        <span>${formatTime(file.uploaded)}</span>
                      </div>
                    </div>
                  `).join("")}
                </div>
              ` : `<p style="color:var(--muted); font-size:13px; text-align:center; padding:24px 0;">暂无最近上传记录</p>`}
            </div>
          </div>

          <!-- 右侧：文件类别分布 + 索引状态 (4 columns) -->
          <div style="grid-column: span 4; display:flex; flex-direction:column; gap:16px;">
            <!-- 文件分类占比 -->
            <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px;">
              <h3 style="margin:0 0 12px 0; font-size:14px; font-weight:600; color:var(--text);">文件类型分布</h3>
              ${renderBreakdownList(breakdown)}
            </div>

            <!-- 文件索引管理 -->
            <div style="background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:16px;">
              <h3 style="margin:0 0 8px 0; font-size:14px; font-weight:600; color:var(--text);">数据索引状态</h3>
              <div style="font-size:13px; color:var(--muted); margin-bottom:12px; line-height:1.4;">
                <div>重建状态: <span style="font-weight:600; color:var(--accent);">${escapeHtml(index.recommendation || "未知")}</span></div>
                <div style="margin-top:4px;">记录总数: ${safeText(index.count, "0")} 行</div>
                ${index.latestUpdatedAt ? `<div style="font-size:11px; margin-top:4px;">最后更新: ${formatTime(index.latestUpdatedAt)}</div>` : ""}
              </div>
              <button class="btn btn-primary" type="button" 
                      data-action="confirm-maintenance-action" 
                      data-maintenance-action="rebuild-index" 
                      data-maintenance-label="重建文件索引"
                      style="width:100%; display:flex; align-items:center; justify-content:center; gap:6px; padding:8px; border-radius:8px; font-size:12px; font-weight:600;">
                <span style="width:14px; height:14px;">${icons.grid}</span> 立即重建索引
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return { renderAdminStatsGrid };
}