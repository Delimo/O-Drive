export function createOverviewRenderer({
  safeText, escapeHtml, formatTime
}) {
  
  function renderBreakdownList(breakdown) {
    const items = Object.entries(breakdown || {});
    if (items.length === 0) {
      return `<p style="color:var(--muted); font-size:12px; margin:0; padding:4px 0;">暂无分类数据</p>`;
    }
    const totalCount = items.reduce((sum, [_, val]) => sum + (val.count || 0), 0) || 1;

    return items.map(([category, info]) => {
      const count = info.count || 0;
      const pct = Math.min(100, Math.round((count / totalCount) * 100));
      return `
        <div style="display:flex; align-items:center; justify-content:space-between; font-size:12px; padding:6px 0; border-bottom:1px dashed var(--line);">
          <span style="color:var(--text); font-weight:500;">${escapeHtml(category)}</span>
          <span style="color:var(--muted); font-variant-numeric: tabular-nums;">${count} 个 (${pct}%)</span>
        </div>
      `;
    }).join("");
  }

  function renderAdminStatsGrid(stats) {
    if (!stats) return ``;
    const { files = {}, trash = {}, index = {}, shares = {}, latest = [], breakdown = {} } = stats;

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px; height:100%; overflow:hidden; font-family:system-ui, sans-serif;">
        
        <!-- 头部信息 -->
        <div class="ov-page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:16px; font-weight:600; color:var(--text); letter-spacing:-0.02em;">概览控制台</h2>
            <p class="ov-page-desc" style="margin:2px 0 0; font-size:11px; color:var(--muted);">节点数据与存储统计指标</p>
          </div>
          <button class="btn" type="button" data-action="refresh-admin" style="font-size:11px; padding:4px 10px; border:1px solid var(--line); border-radius:4px; background:transparent; color:var(--text);">
            刷新状态
          </button>
        </div>

        <!-- 扁平无边框指标行 -->
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:12px 0;">
          <div style="border-right:1px solid var(--line); padding-left:8px;">
            <span style="font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">文件总量</span>
            <div style="font-size:20px; font-weight:700; color:var(--text); margin-top:2px; font-variant-numeric: tabular-nums;">${safeText(files.count, "0")}</div>
          </div>
          <div style="border-right:1px solid var(--line); padding-left:16px;">
            <span style="font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">占用空间</span>
            <div style="font-size:20px; font-weight:700; color:var(--text); margin-top:2px; font-variant-numeric: tabular-nums;">${safeText(files.totalSizeFormatted, "0 B")}</div>
          </div>
          <div style="border-right:1px solid var(--line); padding-left:16px;">
            <span style="font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">共享链接</span>
            <div style="font-size:20px; font-weight:700; color:var(--text); margin-top:2px; font-variant-numeric: tabular-nums;">${safeText(shares.total, "0")}</div>
          </div>
          <div style="padding-left:16px;">
            <span style="font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">待删垃圾</span>
            <div style="font-size:20px; font-weight:700; color:var(--text); margin-top:2px; font-variant-numeric: tabular-nums;">${safeText(trash.count, "0")}</div>
          </div>
        </div>

        <!-- 双栏数据布局 -->
        <div class="admin-grid" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:20px; flex:1; min-h-0;">
          
          <!-- 左侧：最近上传（采用极简横线列表，最大高度防溢出） -->
          <div style="display:flex; flex-direction:column; min-h-0;">
            <h3 style="margin:0 0 10px 0; font-size:12px; font-weight:600; color:var(--text); text-transform:uppercase; letter-spacing:0.03em;">最近上传</h3>
            <div style="flex:1; overflow-y:auto; max-height:220px; display:flex; flex-direction:column;">
              ${latest && latest.length > 0 ? latest.map(file => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:12px;">
                  <span style="color:var(--text); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:260px;">${escapeHtml(file.name)}</span>
                  <div style="color:var(--muted); display:flex; gap:12px; font-variant-numeric: tabular-nums; flex-shrink:0;">
                    <span>${safeText(file.sizeFormatted)}</span>
                    <span>${formatTime(file.uploaded)}</span>
                  </div>
                </div>
              `).join("") : `<p style="color:var(--muted); padding:16px 0; font-size:12px; margin:0;">无上传记录</p>`}
            </div>
          </div>

          <!-- 右侧：分类占比与索引 -->
          <div style="display:flex; flex-direction:column; gap:16px; min-h-0;">
            <div>
              <h3 style="margin:0 0 8px 0; font-size:12px; font-weight:600; color:var(--text); text-transform:uppercase; letter-spacing:0.03em;">类型分布</h3>
              <div style="max-height:140px; overflow-y:auto;">
                ${renderBreakdownList(breakdown)}
              </div>
            </div>

            <div style="border-top:1px solid var(--line); padding-top:10px; display:flex; align-items:center; justify-content:space-between; font-size:12px;">
              <div>
                <span style="color:var(--muted);">数据索引推荐:</span>
                <span style="font-weight:600; color:var(--text); margin-left:4px;">${escapeHtml(index.recommendation || "无需处理")}</span>
              </div>
              <button class="btn" type="button" data-action="confirm-maintenance-action" data-maintenance-action="rebuild-index" data-maintenance-label="重建文件索引"
                      style="padding:4px 8px; font-size:11px; border:1px solid var(--line); background:transparent; color:var(--accent); border-radius:4px; font-weight:500;">
                同步索引
              </button>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  return { renderAdminStatsGrid };
}