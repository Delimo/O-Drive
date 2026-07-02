export function createStorageRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatBytes, formatTime, components
}) {

  function renderStorageSection(admin) {
    const {
      storageConfig, storageConfigLoading, storageConfigError,
      trashRetention, trashRetentionLoading, trashCleanupBusy,
      trashPreviewItems = [], trashPreviewLoading, trashPreviewError,
      protectedPaths = [], protectedPathsLoading, protectedPathsError,
      hiddenPaths = [], hiddenPathsLoading, hiddenPathsError,
      accessRuleDraft = {}, accessRuleSaving = false
    } = admin;

    if (storageConfigError) {
      return components.renderErrorCard({ icon: "", error: storageConfigError, onRetry: "refresh-admin-storage-config" });
    }
    if (storageConfigLoading || !storageConfig) {
      return renderEmptyStateCompact("载入中", "读取存储桶配额...", "");
    }

    const r2 = storageConfig.r2 || {};
    const usedPercent = r2.usedPercent || 0;
    const alertEnabled = r2.alertEnabled !== false;
    const alertWarningPercent = r2.alertWarningPercent || storageConfig.r2AlertWarningPercent || 90;
    const alertErrorPercent = r2.alertErrorPercent || storageConfig.r2AlertErrorPercent || 95;
    const fillColor = usedPercent > 80 ? 'var(--danger)' : usedPercent > 60 ? 'var(--warning)' : 'var(--accent)';
    const hiddenRuleCount = (hiddenPaths || []).length;
    const protectedRuleCount = (protectedPaths || []).length;
    const accessRuleCount = hiddenRuleCount + protectedRuleCount;
    const ruleDraft = {
      path: "",
      hidden: false,
      showName: true,
      password: "",
      note: "",
      ...(accessRuleDraft || {}),
    };

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
              <button class="btn btn-sm" type="button" data-action="show-edit-storage-quota" aria-label="调整存储限额">调整限额</button>
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
              <div class="ov-quota-alerts">
                <div class="ov-quota-alerts-head">
                  <span class="ov-quota-alerts-title">容量告警规则</span>
                  <label class="ov-quota-alerts-toggle">
                    <input type="checkbox" data-binding="storage-alert-enabled" ${alertEnabled ? "checked" : ""}>
                    <span>启用</span>
                  </label>
                </div>
                <div class="ov-quota-alerts-form">
                  <label class="ov-quota-alert-field">
                    <span>Warning</span>
                    <input class="input" type="number" min="1" max="100" step="1" data-binding="storage-alert-warning" value="${alertWarningPercent}">
                    <em>%</em>
                  </label>
                  <label class="ov-quota-alert-field">
                    <span>Error</span>
                    <input class="input" type="number" min="1" max="100" step="1" data-binding="storage-alert-error" value="${alertErrorPercent}">
                    <em>%</em>
                  </label>
                  <button class="btn btn-sm" type="button" data-action="save-storage-alert-thresholds">保存规则</button>
                </div>
              </div>
            </div>
          </div>

          <div class="ov-storage-trash">
            <div class="ov-trash-header">
              <span class="ov-trash-title">回收站策略</span>
              <a class="ov-trash-link" href="/" aria-label="返回云盘查看全部回收站文件">查看全部</a>
            </div>
            <div class="ov-trash-body">
              <div class="ov-trash-policy">
                <p class="ov-trash-desc">设置已删除文件在系统内被永久抹除前的暂存天数。</p>
                <div class="ov-trash-input-row">
                  <input class="input" type="number" data-binding="trash-retention-days"
                         value="${trashRetention ? trashRetention.days : 7}" style="width:60px;text-align:center;">
                  <span class="ov-trash-unit">天</span>
                  <button class="btn btn-primary btn-sm" type="button"
                          data-action="save-trash-retention">保存</button>
                </div>
              </div>
              <div class="ov-trash-cleanup">
                <span class="ov-trash-cleanup-label">强制清空过期回收站项目</span>
                <button class="btn btn-danger btn-sm" type="button"
                        data-action="cleanup-trash-by-retention" ${trashCleanupBusy ? 'disabled' : ''}>
                  ${trashCleanupBusy ? '清理中...' : '立即清理'}
                </button>
              </div>
              ${renderTrashPreview(trashPreviewItems, trashPreviewLoading, trashPreviewError)}
            </div>
          </div>
        </div>

        <div class="ov-storage-bottom">
          <div class="ov-rules-shell-header">
            <div class="ov-rules-shell-title-group">
              <span class="ov-rules-shell-kicker">访问控制</span>
              <h3 class="ov-rules-shell-title">路径规则</h3>
              <p class="ov-rules-shell-desc">为目录或文件设置密码保护，也可以从访客文件列表中隐藏路径。</p>
            </div>
            <div class="ov-rules-shell-meta" aria-label="路径规则统计">
              <span><strong>${accessRuleCount}</strong> 条规则</span>
              <span>${hiddenRuleCount} 隐藏</span>
              <span>${protectedRuleCount} 密码</span>
            </div>
          </div>

          <div class="ov-rules-workspace">
          <div class="ov-rules-editor">
            <div class="ov-rules-editor-header">
              <div class="ov-rules-editor-title-row">
                <h3 class="ov-rules-editor-title">新建规则</h3>
                <button class="btn btn-primary btn-sm" type="button" data-action="save-access-rule" ${accessRuleSaving ? "disabled" : ""}>
                  ${accessRuleSaving ? "保存中..." : "保存规则"}
                </button>
              </div>
              <p class="ov-rules-editor-desc">路径可以是目录，也可以是具体文件。</p>
            </div>
            <div class="ov-rules-editor-body">
              <div class="ov-rules-field">
                <label class="ov-rules-label">路径</label>
                <input class="input" type="text" placeholder="/客户资料/" data-action-input="set-rule-path" value="${escapeHtml(ruleDraft.path)}">
              </div>
              <div class="ov-rules-options">
                <label class="ov-rules-checkbox">
                  <input type="checkbox" data-action-change="toggle-rule-hide" ${ruleDraft.hidden ? "checked" : ""}>
                  <span class="ov-rules-checkbox-label">
                    <span class="ov-rules-checkbox-title">隐藏路径</span>
                    <span class="ov-rules-checkbox-desc">从访客文件列表移除</span>
                  </span>
                </label>
                <label class="ov-rules-checkbox">
                  <input type="checkbox" data-action-change="toggle-rule-show-name" ${ruleDraft.showName !== false ? "checked" : ""}>
                  <span class="ov-rules-checkbox-label">
                    <span class="ov-rules-checkbox-title">名称可见</span>
                    <span class="ov-rules-checkbox-desc">受密码保护时仍显示名称</span>
                  </span>
                </label>
              </div>
              <div class="ov-rules-inline-fields">
                <div class="ov-rules-field">
                  <label class="ov-rules-label">访问密码</label>
                  <input class="input" type="password" placeholder="至少 4 位，可不填" data-action-input="set-rule-password" value="${escapeHtml(ruleDraft.password)}">
                </div>
                <div class="ov-rules-field">
                  <label class="ov-rules-label">备注</label>
                  <input class="input" type="text" placeholder="可选" data-action-input="set-rule-note" value="${escapeHtml(ruleDraft.note)}">
                </div>
              </div>
            </div>
          </div>

          <div class="ov-rules-list">
            <div class="ov-rules-list-header">
              <h3 class="ov-rules-list-title">规则列表</h3>
              <span class="ov-rules-list-count">${accessRuleCount} 条规则</span>
            </div>
            <div class="ov-rules-list-body">
              ${accessRuleCount === 0
                ? `<div class="ov-rules-empty">
                    <span class="ov-rules-empty-title">暂无访问控制规则</span>
                    <span class="ov-rules-empty-copy">在左侧填写路径后保存，可创建隐藏路径或密码保护规则。</span>
                  </div>`
                : `
                  <div class="ov-rules-table-wrap">
                    <table class="ov-rules-table">
                      <thead>
                        <tr>
                          <th scope="col">路径</th>
                          <th scope="col">类型</th>
                          <th scope="col">备注</th>
                          <th scope="col"></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${(hiddenPaths || []).map(item => {
                          const path = String(item?.path || item?.folder || "/");
                          const note = item?.note || "";
                          return `
                            <tr>
                              <td class="ov-td-mono">${safeText(path)}</td>
                              <td>${components.renderBadge({ label: "隐藏", className: "ov-badge-purple" })}</td>
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
                              <td>${components.renderBadge({ label: showName ? "密码(显示)" : "密码(隐藏)", className: "ov-badge-accent" })}</td>
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

  function getTrashPreviewName(item) {
    return item?.name || String(item?.original_key || item?.path || "").split("/").filter(Boolean).pop() || "未命名项目";
  }

  function getTrashPreviewPath(item) {
    const path = item?.original_key || item?.path || item?.name || "";
    return path ? `/${String(path).replace(/^\/+/, "")}` : "/";
  }

  function renderTrashPreview(items = [], loading = false, error = "") {
    const previewItems = (items || []).slice(0, 5);
    return `
      <div class="ov-trash-preview">
        <div class="ov-trash-preview-head">
          <span class="ov-trash-preview-title">最近回收站文件</span>
          <span class="ov-trash-preview-count">${loading ? "加载中" : `${(items || []).length} 项`}</span>
        </div>
        <div class="ov-trash-preview-list">
          ${loading
            ? `<div class="ov-trash-preview-empty">正在读取回收站...</div>`
            : error
              ? `<div class="ov-trash-preview-empty">${safeText(error)}</div>`
              : previewItems.length === 0
                ? `<div class="ov-trash-preview-empty">回收站为空</div>`
                : previewItems.map((item) => {
                    const name = getTrashPreviewName(item);
                    const path = getTrashPreviewPath(item);
                    const kind = item?.kind === "folder" ? "文件夹" : "文件";
                    const size = item?.kind === "folder" ? "目录" : formatBytes(Number(item?.size || item?.rawSize || 0));
                    const trashedAt = Number(item?.trashed_at || item?.trashedAt || item?.time || 0);
                    return `
                      <div class="ov-trash-preview-item">
                        <div class="ov-trash-preview-main">
                          <span class="ov-trash-preview-name">${safeText(name)}</span>
                          <span class="ov-trash-preview-path">${safeText(path)}</span>
                        </div>
                        <div class="ov-trash-preview-meta">
                          <span>${kind}</span>
                          <span>${safeText(size)}</span>
                          <span>${trashedAt ? escapeHtml(formatTime(trashedAt)) : "-"}</span>
                        </div>
                      </div>
                    `;
                  }).join("")}
        </div>
      </div>
    `;
  }

  return {
    renderStorageSection,
    renderAdminStorageSection: renderStorageSection
  };
}
