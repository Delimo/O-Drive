export function createStorageRenderer({
  icons, safeText, escapeHtml, renderEmptyStateCompact, formatBytes, components
}) {
  
  function renderStorageSection(admin) {
    const { storageConfig, storageConfigLoading, storageConfigError, trashRetention, trashRetentionLoading, trashCleanupBusy } = admin;

    if (storageConfigError) {
      return components.renderErrorCard({ icon: icons.refresh, error: storageConfigError, onRetry: "refresh-admin-storage-config" });
    }
    if (storageConfigLoading || !storageConfig) {
      return renderEmptyStateCompact("正在加载存储配置", "读取云端参数中...", icons.spinner);
    }

    const r2 = storageConfig.r2 || {};
    const usedPercent = r2.usedPercent || 0;

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px;">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:20px; font-weight:700; color:var(--text);">存储管理</h2>
            <p class="ov-page-desc" style="margin:4px 0 0; font-size:13px; color:var(--muted);">查看 R2 云存储配额及配置回收站保留期限</p>
          </div>
        </div>

        <div class="admin-grid" style="display:grid; grid-template-columns: repeat(12, 1fr); gap:16px;">
          <!-- 存储配额卡片 (7 columns) -->
          <div style="grid-column: span 7; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:20px; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                <div>
                  <span class="admin-label" style="font-size:11px; text-transform:uppercase; color:var(--muted); letter-spacing:0.05em;">Cloudflare R2</span>
                  <h3 style="margin:4px 0 0; font-size:18px; font-weight:700; color:var(--text);">${escapeHtml(r2.name || "未连接存储桶")}</h3>
                </div>
                <button class="btn" type="button" data-action="show-edit-storage-quota" style="font-size:12px; font-weight:600; padding:6px 12px; border-radius:8px; border:1px solid var(--line); background:var(--panel); color:var(--text);">
                  调整配额限制
                </button>
              </div>

              <div style="margin:24px 0;">
                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:8px;">
                  <span style="color:var(--muted);">存储使用进度</span>
                  <span style="font-weight:600; color:var(--text);">${usedPercent}% (${safeText(r2.usedFormatted)} / ${safeText(r2.quotaFormatted)})</span>
                </div>
                <!-- 优化后的进度轨 -->
                <div style="height:12px; background:var(--track-bg); border-radius:6px; overflow:hidden;">
                  <div style="width:${usedPercent}%; height:100%; background:linear-gradient(90deg, var(--accent) 0%, #06b6d4 100%); border-radius:6px; transition: width 0.3s ease;"></div>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:16px; border-top:1px solid var(--line); padding-top:16px; margin-top:8px;">
              <div style="flex:1;">
                <span style="font-size:11px; color:var(--muted);">已使用</span>
                <div style="font-size:16px; font-weight:600; color:var(--text); margin-top:2px;">${safeText(r2.usedFormatted)}</div>
              </div>
              <div style="flex:1; border-left:1px solid var(--line); padding-left:16px;">
                <span style="font-size:11px; color:var(--muted);">总限额</span>
                <div style="font-size:16px; font-weight:600; color:var(--text); margin-top:2px;">${safeText(r2.quotaFormatted)}</div>
              </div>
            </div>
          </div>

          <!-- 回收站策略卡片 (5 columns) -->
          <div style="grid-column: span 5; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:20px; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h3 style="margin:0 0 8px 0; font-size:15px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:8px;">
                <span style="width:18px; height:18px; color:var(--danger);">${icons.trash}</span> 回收站与文件清理
              </h3>
              <p style="font-size:13px; color:var(--muted); line-height:1.4; margin:0 0 16px 0;">
                设置文件删除后的保留时间。保留期到期后系统会自动清理其数据。
              </p>

              <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
                <label style="font-size:12px; font-weight:600; color:var(--text);">自动清理周期</label>
                <div style="display:flex; gap:8px;">
                  <div style="position:relative; flex:1;">
                    <input class="input" type="number" data-binding="trash-retention-days" 
                           value="${trashRetention ? trashRetention.days : 7}" min="1" max="365"
                           style="width:100%; padding:8px 12px; padding-right:40px; border:1px solid var(--line); border-radius:8px; background:var(--panel-soft); font-size:13px;"
                           ${trashRetentionLoading ? 'disabled' : ''}>
                    <span style="position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:12px; color:var(--muted);">天</span>
                  </div>
                  <button class="btn btn-primary" type="button" data-action="save-trash-retention" 
                          style="padding:0 16px; font-size:13px; font-weight:600; border-radius:8px;"
                          ${trashRetentionLoading ? 'disabled' : ''}>
                    保存设置
                  </button>
                </div>
              </div>
            </div>

            <div style="border-top:1px solid var(--line); padding-top:16px; display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:12px; color:var(--muted);">需要立即释放空间吗？</span>
              <button class="btn btn-danger" type="button" data-action="cleanup-trash-by-retention"
                      style="font-size:12px; padding:6px 12px; border-radius:8px;"
                      ${trashCleanupBusy ? 'disabled' : ''}>
                ${trashCleanupBusy ? '清理中...' : '即刻启动清理'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return {
    renderStorageSection,
    renderAdminStorageSection: renderStorageSection
  };
}