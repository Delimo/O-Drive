export function createStorageRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, components
}) {
  function renderStorageSection(admin) {
    const { storageConfig, storageConfigLoading, storageConfigError, trashRetention, trashRetentionLoading, trashCleanupBusy } = admin;

    if (storageConfigError) {
      return components.renderErrorCard({ icon: "", error: storageConfigError, onRetry: "refresh-admin-storage-config" });
    }
    if (storageConfigLoading || !storageConfig) {
      return renderEmptyStateCompact("载入中", "读取存储桶配额...", "");
    }

    const r2 = storageConfig.r2 || {};
    const usedPercent = r2.usedPercent || 0;
    const fillColor = usedPercent > 80 ? 'var(--danger)' : usedPercent > 60 ? 'var(--warning)' : 'var(--accent)';

    return `
      <div class="ap">
        <div class="ap-head">
          <div>
            <h2 class="ap-title">储存管理</h2>
            <p class="ap-desc">控制 R2 存储桶配额及设置文件临时保留周期</p>
          </div>
        </div>

        <div class="ap-grid">
          <div class="ap-card ap-col-7">
            <div class="ap-card-head">
              <span class="ap-lbl" style="margin:0;">存储配额</span>
              <button class="ap-btn ap-btn-sm" type="button" data-action="show-edit-storage-quota">调整限额</button>
            </div>
            <div class="ap-card-body">
              <div class="ap-row" style="align-items:baseline;gap:6px;margin-bottom:2px;">
                <span class="ap-desc-text" style="margin:0;">R2 实例</span>
                <span style="font-weight:600;font-size:12px;color:var(--text);">${escapeHtml(r2.name || "bucket")}</span>
              </div>
              <div class="ap-ov-stats" style="grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px;">
                <div class="ap-ov-stat" style="padding:8px 10px;">
                  <span class="ap-ov-stat-label">已使用</span>
                  <span class="ap-ov-stat-val" style="font-size:18px;">${safeText(r2.usedFormatted)}</span>
                </div>
                <div class="ap-ov-stat" style="padding:8px 10px;">
                  <span class="ap-ov-stat-label">配额上限</span>
                  <span class="ap-ov-stat-val" style="font-size:18px;">${safeText(r2.quotaFormatted)}</span>
                </div>
                <div class="ap-ov-stat" style="padding:8px 10px;">
                  <span class="ap-ov-stat-label">使用率</span>
                  <span class="ap-ov-stat-val" style="font-size:18px;color:${fillColor};">${usedPercent}%</span>
                </div>
              </div>
              <div style="margin-top:14px;">
                <div class="ap-track" style="height:6px;">
                  <div class="ap-fill" style="width:${usedPercent}%;background:${fillColor};"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="ap-card ap-col-5">
            <div class="ap-card-head">
              <span class="ap-lbl" style="margin:0;">回收站策略</span>
            </div>
            <div class="ap-card-body">
              <p class="ap-desc-text" style="margin:0 0 12px;">设置已删除文件在系统内被永久抹除前的暂存天数。</p>
              <div class="ap-row" style="gap:6px;align-items:center;">
                <input class="ap-input" type="number" data-binding="trash-retention-days"
                       value="${trashRetention ? trashRetention.days : 7}" style="width:60px;text-align:center;">
                <span style="font-size:11px;color:var(--muted);">天</span>
                <button class="ap-btn ap-btn-primary" style="margin-left:auto;" type="button"
                        data-action="save-trash-retention">保存</button>
              </div>
              <div style="border-top:1px solid var(--line);margin-top:14px;padding-top:12px;">
                <div class="ap-row" style="justify-content:space-between;align-items:center;">
                  <span class="ap-desc-text" style="margin:0;">强制清空回收站</span>
                  <button class="ap-btn ap-btn-danger ap-btn-sm" type="button"
                          data-action="cleanup-trash-by-retention" ${trashCleanupBusy ? 'disabled' : ''}>
                    ${trashCleanupBusy ? '清理中...' : '立即清理'}
                  </button>
                </div>
              </div>
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
