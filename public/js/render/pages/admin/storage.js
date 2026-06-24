export function createStorageRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  function renderStorageSection(admin) {
    const {
      storageConfig, storageConfigLoading, storageConfigError,
      trashRetention, trashRetentionLoading, trashCleanupBusy,
      protectedPaths = [], protectedPathsLoading, protectedPathsError,
      hiddenPaths = [], hiddenPathsLoading, hiddenPathsError
    } = admin;

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
      <div class="ov-storage">
        <div class="ov-storage-header">
          <div class="ov-storage-title-group">
            <h2 class="ov-storage-title">存储管理</h2>
            <p class="ov-storage-desc">R2存储桶配额、回收站策略与路径管理</p>
          </div>
        </div>

        <div class="ov-storage-top">
          <div class="ov-storage-quota">
            <div class="ov-quota-header">
              <span class="ov-quota-title">存储配额</span>
              <button class="btn btn-sm" type="button" data-action="show-edit-storage-quota">调整限额</button>
            </div>
            <div class="ov-quota-body">
              <div class="ov-quota-info">
                <span class="ov-quota-label">R2 实例</span>
                <span class="ov-quota-name">${escapeHtml(r2.name || "bucket")}</span>
              </div>
              <div class="ov-quota-stats">
                <div class="ov-quota-stat">
                  <span class="ov-quota-stat-label">已使用</span>
                  <span class="ov-quota-stat-value">${safeText(r2.usedFormatted)}</span>
                </div>
                <div class="ov-quota-stat">
                  <span class="ov-quota-stat-label">配额上限</span>
                  <span class="ov-quota-stat-value">${safeText(r2.quotaFormatted)}</span>
                </div>
                <div class="ov-quota-stat">
                  <span class="ov-quota-stat-label">使用率</span>
                  <span class="ov-quota-stat-value" style="color:${fillColor};">${usedPercent}%</span>
                </div>
              </div>
              <div class="ov-quota-track">
                <div class="ov-quota-fill" style="width:${usedPercent}%;background:${fillColor};"></div>
              </div>
            </div>
          </div>

          <div class="ov-storage-trash">
            <div class="ov-trash-header">
              <span class="ov-trash-title">回收站策略</span>
            </div>
            <div class="ov-trash-body">
              <p class="ov-trash-desc">设置已删除文件在系统内被永久抹除前的暂存天数。</p>
              <div class="ov-trash-input-row">
                <input class="input" type="number" data-binding="trash-retention-days"
                       value="${trashRetention ? trashRetention.days : 7}" style="width:60px;text-align:center;">
                <span class="ov-trash-unit">天</span>
                <button class="btn btn-primary btn-sm" style="margin-left:auto;" type="button"
                        data-action="save-trash-retention">保存</button>
              </div>
              <div class="ov-trash-divider"></div>
              <div class="ov-trash-cleanup">
                <span class="ov-trash-cleanup-label">强制清空回收站</span>
                <button class="btn btn-danger btn-sm" type="button"
                        data-action="cleanup-trash-by-retention" ${trashCleanupBusy ? 'disabled' : ''}>
                  ${trashCleanupBusy ? '清理中...' : '立即清理'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="ov-storage-bottom">
          <div class="ov-path-section">
            <div class="ov-path-header">
              <div class="ov-path-title-group">
                <span class="ov-path-dot" style="background:var(--accent);"></span>
                <span class="ov-path-title">受保护路径</span>
              </div>
              <button class="btn btn-sm" type="button" data-action="show-add-protected-path">添加</button>
            </div>
            <div class="ov-path-body">
              ${protectedPathsLoading
                ? `<div class="ov-empty-inline">载入中...</div>`
                : protectedPathsError
                  ? `<div class="ov-empty-inline" style="color:var(--danger);">${escapeHtml(protectedPathsError)}</div>`
                  : protectedPaths.length === 0
                    ? `<div class="ov-empty-inline">尚未配置受保护路径</div>`
                    : `<div class="ov-path-list">
                        ${protectedPaths.map(item => {
                          const path = String(item?.path || item?.folder || "/");
                          const note = item?.note || "";
                          const name = item?.showName || path;
                          return `
                            <div class="ov-path-item">
                              <div class="ov-path-item-info">
                                <span class="ov-path-item-dot" style="background:var(--accent);"></span>
                                <span class="ov-path-item-name">${safeText(name)}</span>
                                <code class="ov-path-item-code">${safeText(path)}</code>
                              </div>
                              <button class="btn btn-sm" type="button"
                                      data-action="confirm-delete-protected-path"
                                      data-path="${escapeHtml(path)}">移除</button>
                            </div>
                            ${note ? `<div class="ov-path-item-note">${escapeHtml(note)}</div>` : ""}
                          `;
                        }).join("")}
                      </div>`
              }
            </div>
          </div>

          <div class="ov-path-section">
            <div class="ov-path-header">
              <div class="ov-path-title-group">
                <span class="ov-path-dot" style="background:#8b5cf6;"></span>
                <span class="ov-path-title">隐藏路径</span>
              </div>
              <button class="btn btn-sm" type="button" data-action="show-add-hidden-path">添加</button>
            </div>
            <div class="ov-path-body">
              ${hiddenPathsLoading
                ? `<div class="ov-empty-inline">载入中...</div>`
                : hiddenPathsError
                  ? `<div class="ov-empty-inline" style="color:var(--danger);">${escapeHtml(hiddenPathsError)}</div>`
                  : hiddenPaths.length === 0
                    ? `<div class="ov-empty-inline">尚未配置隐藏路径</div>`
                    : `<div class="ov-path-list">
                        ${hiddenPaths.map(item => {
                          const path = String(item?.path || item?.folder || "/");
                          const note = item?.note || "";
                          const name = item?.showName || path;
                          return `
                            <div class="ov-path-item">
                              <div class="ov-path-item-info">
                                <span class="ov-path-item-dot" style="background:#8b5cf6;"></span>
                                <span class="ov-path-item-name">${safeText(name)}</span>
                                <code class="ov-path-item-code">${safeText(path)}</code>
                              </div>
                              <button class="btn btn-sm" type="button"
                                      data-action="confirm-delete-hidden-path"
                                      data-path="${escapeHtml(path)}">移除</button>
                            </div>
                            ${note ? `<div class="ov-path-item-note">${escapeHtml(note)}</div>` : ""}
                          `;
                        }).join("")}
                      </div>`
              }
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
