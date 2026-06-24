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

    return `
      <div class="ov-page" style="display:flex; flex-direction:column; gap:16px; height:100%; overflow:hidden; font-family:system-ui, sans-serif;">
        <div class="ov-page-header">
          <div>
            <h2 class="ov-page-title" style="margin:0; font-size:16px; font-weight:600; color:var(--text);">储存管理</h2>
            <p class="ov-page-desc" style="margin:2px 0 0; font-size:11px; color:var(--muted);">控制 R2 存储桶配额及设置文件临时保留周期</p>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:24px; border-top:1px solid var(--line); padding-top:16px; flex:1; min-h-0;">
          <!-- 存储配额 -->
          <div style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:12px;">
                <span style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">R2 实例：${escapeHtml(r2.name || "bucket")}</span>
                <button class="btn" type="button" data-action="show-edit-storage-quota" style="font-size:11px; padding:3px 8px; border:1px solid var(--line); border-radius:4px; background:transparent;">
                  调整限额
                </button>
              </div>

              <div style="margin:12px 0;">
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
                  <span style="color:var(--text);">空间已用百分比</span>
                  <span style="font-weight:600; color:var(--text);">${usedPercent}%</span>
                </div>
                <!-- 极简纤细轨道线 -->
                <div style="height:3px; background:var(--track-bg); overflow:hidden;">
                  <div style="width:${usedPercent}%; height:100%; background:var(--accent);"></div>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:16px; font-size:12px; border-top:1px solid var(--line); padding-top:12px;">
              <div>
                <span style="color:var(--muted);">已使用容量</span>
                <div style="font-weight:600; color:var(--text); margin-top:2px;">${safeText(r2.usedFormatted)}</div>
              </div>
              <div style="border-left:1px solid var(--line); padding-left:16px;">
                <span style="color:var(--muted);">配额总上限</span>
                <div style="font-weight:600; color:var(--text); margin-top:2px;">${safeText(r2.quotaFormatted)}</div>
              </div>
            </div>
          </div>

          <!-- 回收站控制 -->
          <div style="display:flex; flex-direction:column; justify-content:space-between; border-left:1px solid var(--line); padding-left:24px;">
            <div>
              <h3 style="margin:0 0 4px 0; font-size:13px; font-weight:600; color:var(--text);">过期自动垃圾清理</h3>
              <p style="font-size:11px; color:var(--muted); line-height:1.4; margin-bottom:12px;">设置已删除文件在系统内被永久抹除前的暂存天数。</p>

              <div style="display:flex; gap:6px;">
                <div style="position:relative; flex:1;">
                  <input class="input" type="number" data-binding="trash-retention-days" value="${trashRetention ? trashRetention.days : 7}" style="width:100%; padding:5px 8px; font-size:12px; border:1px solid var(--line); border-radius:4px; background:transparent;">
                  <span style="position:absolute; right:8px; top:50%; transform:translateY(-50%); font-size:11px; color:var(--muted);">天</span>
                </div>
                <button class="btn btn-primary" type="button" data-action="save-trash-retention" style="font-size:11px; padding:0 12px; border-radius:4px;">
                  保存
                </button>
              </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--line); padding-top:12px; font-size:11px;">
              <span style="color:var(--muted);">强制清空回收站：</span>
              <button class="btn btn-danger" type="button" data-action="cleanup-trash-by-retention" style="font-size:11px; padding:3px 8px; border-radius:4px;" ${trashCleanupBusy ? 'disabled' : ''}>
                ${trashCleanupBusy ? '清理中...' : '立即同步清理'}
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