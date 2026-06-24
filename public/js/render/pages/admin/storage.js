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
          <div class="ov-rules-card-full">
            <div class="ov-rules-card-full-header">
              <h3 class="ov-rules-card-full-title">规则</h3>
              <span class="ov-rules-card-full-count">${(protectedPaths || []).length + (hiddenPaths || []).length} 条规则</span>
            </div>
            <div class="ov-rules-card-full-body">
              <div class="ov-rules-editor-inline">
                <div class="ov-rules-inline-fields">
                  <input class="input" type="text" placeholder="路径 /客户资料/" data-action-input="set-rule-path">
                  <input class="input" type="password" placeholder="密码（可选）" data-action-input="set-rule-password">
                  <input class="input" type="text" placeholder="备注（可选）" data-action-input="set-rule-note">
                </div>
                <div class="ov-rules-inline-actions">
                  <label class="ov-rules-checkbox-sm">
                    <input type="checkbox" data-action-change="toggle-rule-hide">
                    <span>隐藏</span>
                  </label>
                  <label class="ov-rules-checkbox-sm">
                    <input type="checkbox" checked data-action-change="toggle-rule-show-name">
                    <span>显示名称</span>
                  </label>
                  <button class="btn btn-primary btn-sm" type="button" data-action="save-access-rule">添加</button>
                </div>
              </div>
              <div class="ov-rules-divider"></div>
              <div class="ov-rules-list-inline">
                ${(protectedPaths || []).length === 0 && (hiddenPaths || []).length === 0
                  ? `<div class="ov-empty-inline">暂无规则</div>`
                  : `
                    <div class="ov-rules-table-wrap">
                      <table class="ov-rules-table">
                        <thead>
                          <tr>
                            <th>路径</th>
                            <th>类型</th>
                            <th>备注</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          ${(hiddenPaths || []).map(item => {
                            const path = String(item?.path || item?.folder || "/");
                            const note = item?.note || "";
                            return `
                              <tr>
                                <td class="ov-td-mono">${safeText(path)}</td>
                                <td><span class="ov-badge ov-badge-purple">隐藏</span></td>
                                <td class="ov-td-muted">${safeText(note, "-")}</td>
                                <td><button class="btn btn-sm" type="button" data-action="confirm-delete-hidden-path" data-path="${escapeHtml(path)}">移除</button></td>
                              </tr>
                            `;
                          }).join("")}
                          ${(protectedPaths || []).map(item => {
                            const path = String(item?.path || item?.folder || "/");
                            const note = item?.note || "";
                            const showName = item?.showName;
                            return `
                              <tr>
                                <td class="ov-td-mono">${safeText(path)}</td>
                                <td><span class="ov-badge ov-badge-accent">${showName ? '密码(显示)' : '密码(隐藏)'}</span></td>
                                <td class="ov-td-muted">${safeText(note, "-")}</td>
                                <td><button class="btn btn-sm" type="button" data-action="confirm-delete-protected-path" data-path="${escapeHtml(path)}">移除</button></td>
                              </tr>
                            `;
                          }).join("")}
                        </tbody>
                      </table>
                    </div>
                  `}
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
