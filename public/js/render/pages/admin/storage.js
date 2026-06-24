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
          <div class="ov-rules-editor">
            <div class="ov-rules-editor-header">
              <h3 class="ov-rules-editor-title">规则编辑</h3>
              <p class="ov-rules-editor-desc">路径可以是目录，也可以是具体文件。</p>
            </div>
            <div class="ov-rules-editor-body">
              <div class="ov-rules-type-group">
                <button class="ov-rules-type-btn active" type="button" data-action="set-rule-type" data-type="hide">仅隐藏</button>
                <button class="ov-rules-type-btn" type="button" data-action="set-rule-type" data-type="password">仅密码</button>
                <button class="ov-rules-type-btn" type="button" data-action="set-rule-type" data-type="both">隐藏+密码</button>
              </div>
              <div class="ov-rules-field">
                <label class="ov-rules-label">路径</label>
                <input class="input" type="text" placeholder="/客户资料/" data-action-input="set-rule-path">
              </div>
              <div class="ov-rules-field">
                <label class="ov-rules-label">访问密码</label>
                <input class="input" type="password" placeholder="至少 4 位，可不填" data-action-input="set-rule-password">
              </div>
              <div class="ov-rules-field">
                <label class="ov-rules-label">备注</label>
                <input class="input" type="text" placeholder="可选" data-action-input="set-rule-note">
              </div>
              <div class="ov-rules-options">
                <label class="ov-rules-checkbox">
                  <input type="checkbox" data-action-change="toggle-rule-hide">
                  <span class="ov-rules-checkbox-label">
                    <span class="ov-rules-checkbox-title">隐藏路径</span>
                    <span class="ov-rules-checkbox-desc">从访客文件列表移除</span>
                  </span>
                </label>
                <label class="ov-rules-checkbox">
                  <input type="checkbox" checked data-action-change="toggle-rule-show-name">
                  <span class="ov-rules-checkbox-label">
                    <span class="ov-rules-checkbox-title">名称可见</span>
                    <span class="ov-rules-checkbox-desc">受密码保护时仍显示名称</span>
                  </span>
                </label>
              </div>
              <button class="btn btn-primary" type="button" style="width:100%;" data-action="save-access-rule">保存规则</button>
            </div>
          </div>

          <div class="ov-rules-list">
            <div class="ov-rules-list-header">
              <h3 class="ov-rules-list-title">规则列表</h3>
              <span class="ov-rules-list-count">${(protectedPaths || []).length + (hiddenPaths || []).length} 条规则</span>
            </div>
            <div class="ov-rules-list-body">
              ${(protectedPaths || []).length === 0 && (hiddenPaths || []).length === 0
                ? `<div class="ov-empty-inline">暂无访问控制规则</div>`
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
    `;
  }

  return {
    renderStorageSection,
    renderAdminStorageSection: renderStorageSection
  };
}
