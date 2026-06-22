export function createStorageRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyState,
  renderEmptyStateCompact,
  components,
}) {
  function renderAdminStorageSection(admin) {
    const {
      storageConfig,
      storageConfigLoading,
      storageConfigError,
      storageConfigSaving,
    } = admin;

    if (storageConfigError) {
      return components.renderErrorCard({
        icon: icons.stats,
        error: storageConfigError,
        onRetry: "refresh-admin-storage-config",
      });
    }

    if (storageConfigLoading || !storageConfig) {
      return renderEmptyState("加载中", "正在加载存储空间配置...", icons.stats);
    }

    const r2 = storageConfig.r2 || {};
    const spaces = storageConfig.spaces || [];
    const bindings = storageConfig.bindings || [];
    const usagePercent = r2.usedPercent || 0;
    const usageBarColor =
      usagePercent >= 90
        ? "var(--danger)"
        : usagePercent >= 75
          ? "var(--warning)"
          : "var(--primary)";

    return `
      <div class="admin-grid">
        <div class="admin-card span-6">
          <div class="mini-stat">
            <div class="mini-stat-label">${escapeHtml(r2.name || "Cloudflare R2")}</div>
            <div class="mini-stat-value">${escapeHtml(r2.usedFormatted || "0")} / ${escapeHtml(r2.quotaFormatted || "未设置")}</div>
            <div style="margin:8px 0;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(usagePercent, 100)}%;background:${usageBarColor};border-radius:3px;transition:width .3s;"></div>
            </div>
            <div class="mini-stat-meta">已用 ${usagePercent}%</div>
          </div>
          <div class="btn-row" style="margin-top:8px;">
            <button class="btn toolbar-btn" type="button" data-action="show-edit-storage-quota" ${storageConfigSaving ? "disabled" : ""}>${icons.edit}<span>编辑配额</span></button>
          </div>
        </div>

        <div class="admin-card span-6">
          <div class="mini-stat">
            <div class="mini-stat-label">溢出策略</div>
            <div class="mini-stat-value">${storageConfig.overflowEnabled ? "已启用" : "已禁用"}</div>
            <div class="mini-stat-meta">阈值：${storageConfig.overflowThresholdPercent || 85}%</div>
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:24px;">
        <h3 style="margin:0;font-size:18px;font-weight:700;">S3 存储空间</h3>
        <div class="btn-row">
          <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-storage-space" ${storageConfigSaving ? "disabled" : ""}>${icons.plus}<span>添加空间</span></button>
        </div>
      </div>
      ${
        spaces.length === 0
          ? renderEmptyState(
              "暂无 S3 空间",
              "还没有配置任何外部存储空间。",
              icons.stats,
            )
          : `
            <div class="latest-list">
              ${spaces
                .map((item) => {
                  const pct = item.usedPercent || 0;
                  const barColor =
                    pct >= 90
                      ? "var(--danger)"
                      : pct >= 75
                        ? "var(--warning)"
                        : "var(--primary)";
                  return `
                  <article class="latest-item">
                    <div class="status-bar" style="margin-bottom:4px;">
                      <div class="status-main">
                        <span class="status-dot" style="background:${item.enabled ? "var(--primary)" : "var(--muted)"}"></span>
                        <span>${safeText(item.name)}</span>
                        <span class="toolbar-tag">${safeText(item.bucket)}</span>
                        ${!item.enabled ? '<span class="toolbar-tag tag-expired">已禁用</span>' : ""}
                        ${item.overflowTarget ? '<span class="toolbar-tag tag-unlimited">溢出目标</span>' : ""}
                      </div>
                      <div class="btn-row">
                        <button class="btn toolbar-btn" type="button" data-action="test-storage-space" data-id="${escapeHtml(item.id)}" ${storageConfigSaving ? "disabled" : ""}>${icons.eye}<span>测试</span></button>
                        <button class="btn btn-danger" type="button" data-action="confirm-delete-storage-space" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" ${storageConfigSaving ? "disabled" : ""}>${icons.trash}<span>删除</span></button>
                      </div>
                    </div>
                    <div style="font-size:13px;color:var(--muted);">
                      ${escapeHtml(item.usedFormatted || "0")} / ${escapeHtml(item.quotaFormatted || "未设置")}
                      <span style="margin:0 8px;">·</span>
                      <span style="color:${barColor};">${pct}%</span>
                      <span style="margin:0 8px;">·</span>
                      ${escapeHtml(item.endpoint || "N/A")}
                    </div>
                  </article>
                `;
                })
                .join("")}
            </div>
          `
      }

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:24px;">
        <h3 style="margin:0;font-size:18px;font-weight:700;">路径绑定</h3>
        <div class="btn-row">
          <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-storage-binding" ${storageConfigSaving ? "disabled" : ""}>${icons.plus}<span>添加绑定</span></button>
        </div>
      </div>
      ${
        bindings.length === 0
          ? renderEmptyState(
              "暂无路径绑定",
              "还没有配置任何路径与存储空间的绑定。",
              icons.link,
            )
          : `
            <div class="latest-list">
              ${bindings
                .map((item) => {
                  const storageName =
                    item.storageId === "r2"
                      ? "Cloudflare R2"
                      : spaces.find((s) => s.id === item.storageId)?.name ||
                        item.storageId;
                  return `
                  <article class="latest-item">
                    <div class="status-bar" style="margin-bottom:4px;">
                      <div class="status-main">
                        <span class="status-dot"></span>
                        <span>${safeText(item.path)}</span>
                        <span class="toolbar-tag">${escapeHtml(storageName)}</span>
                      </div>
                      <button class="btn btn-danger" type="button" data-action="confirm-delete-storage-binding" data-path="${escapeHtml(item.path)}" ${storageConfigSaving ? "disabled" : ""}>
                        ${icons.trash}<span>删除</span>
                      </button>
                    </div>
                  </article>
                `;
                })
                .join("")}
            </div>
          `
      }
    `;
  }

  function renderStorageSection(admin) {
    const {
      storageConfig,
      storageConfigLoading,
      storageConfigError,
      storageConfigSaving,
    } = admin;

    if (storageConfigError) {
      return `<div class="empty-state-compact"><p class="empty-copy">${escapeHtml(storageConfigError)}</p></div>`;
    }

    if (storageConfigLoading || !storageConfig) {
      return renderEmptyStateCompact(
        "加载中",
        "正在加载存储空间配置...",
        icons.stats,
      );
    }

    const r2 = storageConfig.r2 || {};
    const spaces = storageConfig.spaces || [];
    const bindings = storageConfig.bindings || [];
    const usagePercent = r2.usedPercent || 0;
    const usageBarColor =
      usagePercent >= 90
        ? "var(--danger)"
        : usagePercent >= 75
          ? "var(--warning)"
          : "var(--primary)";

    return `
      <div class="admin-section-compact">
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>Cloudflare R2</h3>
            <button class="btn toolbar-btn" type="button" data-action="show-edit-storage-quota" ${storageConfigSaving ? "disabled" : ""}>${icons.edit}<span>编辑配额</span></button>
          </div>
          <div class="sys-status-card" style="margin:0;">
            <div class="env-item">
              <div class="env-item-head">
                <span class="env-item-name">${escapeHtml(r2.name || "Cloudflare R2")}</span>
                <span class="env-status env-status-ok">正常</span>
              </div>
              <div class="env-item-desc">${escapeHtml(r2.usedFormatted || "0")} / ${escapeHtml(r2.quotaFormatted || "未设置")} · 已用 ${usagePercent}%</div>
              <div style="margin:8px 0 0;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
                <div style="height:100%;width:${Math.min(usagePercent, 100)}%;background:${usageBarColor};border-radius:3px;transition:width .3s;"></div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>S3 存储空间</h3>
            <button class="btn btn-primary toolbar-btn" type="button" data-action="show-add-storage-space" ${storageConfigSaving ? "disabled" : ""}>${icons.plus}<span>添加空间</span></button>
          </div>
          ${
            spaces.length === 0
              ? renderEmptyStateCompact(
                  "暂无 S3 空间",
                  "还没有配置任何外部存储空间。",
                  icons.stats,
                )
              : `
                <div class="latest-list-compact">
                  ${spaces
                    .map((item) => {
                      const pct = item.usedPercent || 0;
                      const barColor =
                        pct >= 90
                          ? "var(--danger)"
                          : pct >= 75
                            ? "var(--warning)"
                            : "var(--primary)";
                      return `
                      <article class="latest-item-compact">
                        <div class="status-bar">
                          <div class="status-main">
                            <span class="status-dot" style="background:${item.enabled ? "var(--primary)" : "var(--muted)"}"></span>
                            <span>${safeText(item.name)}</span>
                            <span class="toolbar-tag">${safeText(item.bucket)}</span>
                            ${!item.enabled ? '<span class="toolbar-tag tag-expired">已禁用</span>' : ""}
                            ${item.overflowTarget ? '<span class="toolbar-tag tag-unlimited">溢出目标</span>' : ""}
                          </div>
                          <div class="btn-row">
                            <button class="btn toolbar-btn" type="button" data-action="test-storage-space" data-id="${escapeHtml(item.id)}" ${storageConfigSaving ? "disabled" : ""}>${icons.eye}<span>测试</span></button>
                            <button class="btn btn-danger" type="button" data-action="confirm-delete-storage-space" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" ${storageConfigSaving ? "disabled" : ""}>${icons.trash}<span>删除</span></button>
                          </div>
                        </div>
                        <div class="latest-copy">
                          ${escapeHtml(item.usedFormatted || "0")} / ${escapeHtml(item.quotaFormatted || "未设置")}
                          <span style="margin:0 6px;">·</span>
                          <span style="color:${barColor};">${pct}%</span>
                          <span style="margin:0 6px;">·</span>
                          ${escapeHtml(item.endpoint || "N/A")}
                        </div>
                      </article>
                    `;
                    })
                    .join("")}
                </div>
              `
          }
        </section>

        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>溢出策略</h3>
          </div>
          <div class="sys-status-card" style="margin:0;">
            <div class="env-item">
              <div class="env-item-head">
                <span class="env-item-name">${storageConfig.overflowEnabled ? "已启用" : "已禁用"}</span>
                <span class="toolbar-tag">阈值 ${storageConfig.overflowThresholdPercent || 85}%</span>
              </div>
              <div class="env-item-desc">R2 空间满时自动写入指定的 S3 溢出目标</div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  return {
    renderAdminStorageSection,
    renderStorageSection,
  };
}
