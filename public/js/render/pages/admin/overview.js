export function createOverviewRenderer({
  safeText, escapeHtml, formatTime
}) {
  
  // 动态文本文件后缀徽章（代替不好看的图形图标，增添科技感）
  function getExtBadge(fileName) {
    const ext = fileName.split('.').pop().toLowerCase().slice(0, 4) || 'file';
    let bg = 'rgba(148, 163, 184, 0.12)';
    let color = 'var(--muted)';
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      bg = 'rgba(16, 185, 129, 0.12)'; // 绿色系
      color = '#10b981';
    } else if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) {
      bg = 'rgba(139, 92, 246, 0.12)'; // 紫色系
      color = '#8b5cf6';
    } else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
      bg = 'rgba(236, 72, 153, 0.12)'; // 粉色系
      color = '#ec4899';
    } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) {
      bg = 'rgba(14, 116, 144, 0.12)'; // 蓝青色系
      color = '#0e7490';
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      bg = 'rgba(245, 158, 11, 0.12)'; // 橙色系
      color = '#f59e0b';
    }
    return `<span style="font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: ${bg}; color: ${color}; font-family: monospace; flex-shrink: 0; min-width: 32px; text-align: center;">${ext}</span>`;
  }

  // 渲染带有彩色条形图的分布列表
  function renderBreakdownList(breakdown, escapeHtml) {
    const items = Object.entries(breakdown || {});
    if (items.length === 0) {
      return `<p style="color:var(--muted); font-size:12px; text-align:center; padding:12px 0; margin:0;">暂无数据</p>`;
    }
    const totalCount = items.reduce((sum, [_, val]) => sum + (val.count || 0), 0) || 1;

    return items.map(([category, info]) => {
      const count = info.count || 0;
      const pct = Math.min(100, Math.round((count / totalCount) * 100));
      
      // 为不同的文件类型赋予精美的配色条
      let barColor = 'var(--accent)';
      if (['图片', 'image'].includes(category)) barColor = '#10b981';
      else if (['视频', 'video'].includes(category)) barColor = '#8b5cf6';
      else if (['音频', 'audio'].includes(category)) barColor = '#ec4899';
      else if (['文档', 'pdf', 'text', 'document'].includes(category)) barColor = '#0e7490';

      return `
        <div style="margin-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
            <span style="color:var(--text); font-weight:600;">${escapeHtml(category)}</span>
            <span style="color:var(--muted); font-variant-numeric: tabular-nums;">${count} 个 (${pct}%)</span>
          </div>
          <!-- 扁平渐变条形图 -->
          <div style="height:6px; background:var(--track-bg); border-radius:3px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:3px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAdminStatsGrid(stats) {
    if (!stats) return ``;
    const { files = {}, trash = {}, index = {}, shares = {}, latest = [], breakdown = {} } = stats;

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px; height:100%; overflow:hidden; font-family:system-ui, -apple-system, sans-serif;">
        
        <!-- 头部标题栏 -->
        <div class="ov-page-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:16px; font-weight:700; color:var(--text); letter-spacing:-0.01em;">概览控制台</h2>
            <p class="ov-page-desc" style="margin:2px 0 0; font-size:11px; color:var(--muted);">节点文件存储诊断与分类指标分析</p>
          </div>
          <button class="btn" type="button" data-action="refresh-admin" 
                  style="font-size:11px; font-weight:600; padding:5px 12px; border:1px solid var(--line); border-radius:6px; background:var(--panel); color:var(--text); cursor:pointer;">
            刷新状态
          </button>
        </div>

        <!-- 扁平指标卡（加上轻量底色和微弱边框，消除空白感） -->
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px;">
          <div style="padding:12px 16px; background:var(--panel-soft); border:1px solid var(--line); border-radius:8px;">
            <span style="font-size:10px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">文件总量</span>
            <div style="font-size:22px; font-weight:700; color:var(--text); margin-top:4px; font-variant-numeric: tabular-nums;">${safeText(files.count, "0")}</div>
          </div>
          <div style="padding:12px 16px; background:var(--panel-soft); border:1px solid var(--line); border-radius:8px;">
            <span style="font-size:10px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">占用空间</span>
            <div style="font-size:22px; font-weight:700; color:var(--text); margin-top:4px; font-variant-numeric: tabular-nums;">${safeText(files.totalSizeFormatted, "0 B")}</div>
          </div>
          <div style="padding:12px 16px; background:var(--panel-soft); border:1px solid var(--line); border-radius:8px;">
            <span style="font-size:10px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">共享链接</span>
            <div style="font-size:22px; font-weight:700; color:var(--text); margin-top:4px; font-variant-numeric: tabular-nums;">${safeText(shares.total, "0")}</div>
          </div>
          <div style="padding:12px 16px; background:var(--panel-soft); border:1px solid var(--line); border-radius:8px;">
            <span style="font-size:10px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:0.04em;">待清垃圾</span>
            <div style="font-size:22px; font-weight:700; color:var(--text); margin-top:4px; font-variant-numeric: tabular-nums;">${safeText(trash.count, "0")}</div>
          </div>
        </div>

        <!-- 下方双栏信息面板：精确控制最大高度防止单屏溢出 -->
        <div class="admin-grid" style="display:grid; grid-template-columns: repeat(12, 1fr); gap:16px; flex:1; min-h-0;">
          
          <!-- 左侧：最近上传 (占据 7 列)，设置内部滚动 -->
          <div style="grid-column: span 7; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; display:flex; flex-direction:column; min-h-0;">
            <h3 style="margin:0 0 12px 0; font-size:13px; font-weight:600; color:var(--text);">最近上传文件</h3>
            <div style="flex:1; overflow-y:auto; max-height:210px; display:flex; flex-direction:column; gap:8px;">
              ${latest && latest.length > 0 ? latest.map(file => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:var(--panel-soft); border-radius:6px; border:1px solid var(--line); font-size:12px;">
                  <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                    <!-- 动态高亮文字徽章 -->
                    ${getExtBadge(file.name)}
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text); font-weight:500;">${escapeHtml(file.name)}</div>
                  </div>
                  <div style="display:flex; gap:12px; color:var(--muted); font-variant-numeric: tabular-nums; flex-shrink:0;">
                    <span>${safeText(file.sizeFormatted)}</span>
                    <span>${formatTime(file.uploaded)}</span>
                  </div>
                </div>
              `).join("") : `<p style="color:var(--muted); text-align:center; padding:32px 0; margin:0; font-size:12px;">暂无上传记录</p>`}
            </div>
          </div>

          <!-- 右侧：类型分布条形图与索引维护 (占据 5 列) -->
          <div style="grid-column: span 5; display:flex; flex-direction:column; gap:12px; min-h-0;">
            <!-- 条形图分类区 -->
            <div style="background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; min-h-0;">
              <h3 style="margin:0 0 12px 0; font-size:13px; font-weight:600; color:var(--text);">文件类型分布</h3>
              <div style="max-height:130px; overflow-y:auto; padding-right:4px;">
                ${renderBreakdownList(breakdown, escapeHtml)}
              </div>
            </div>
            
            <!-- 同步索引区 -->
            <div style="background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 16px; flex:1; display:flex; flex-direction:column; justify-content:space-between; min-h-0;">
              <div style="font-size:11px; color:var(--muted); line-height:1.4;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--line); padding-bottom:6px;">
                  <span>数据推荐状态:</span>
                  <span style="font-weight:600; color:var(--accent);">${escapeHtml(index.recommendation || "正常")}</span>
                </div>
                <div style="display:flex; justify-content:space-between; padding-top:6px;">
                  <span>索引记录总量:</span>
                  <span style="font-weight:600; color:var(--text);">${safeText(index.count, "0")} 行</span>
                </div>
              </div>
              <button class="btn btn-primary" type="button" data-action="confirm-maintenance-action" data-maintenance-action="rebuild-index" data-maintenance-label="重建文件索引"
                      style="width:100%; padding:8px; border-radius:6px; font-size:11px; font-weight:600; margin-top:8px;">
                同步重建文件索引
              </button>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  return { renderAdminStatsGrid };
}