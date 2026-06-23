export function createWebhooksRenderer({
  icons,
  safeText,
  escapeHtml,
  renderEmptyState,
  renderEmptyStateCompact,
  formatRelative,
  components,
}) {
  function renderAdminWebhooksSection(admin) {
    const { webhooks, webhooksLoading, webhooksError } = admin;

    if (webhooksError) {
      return `
        <div class="empty-state">
          <div class="empty-orb">${icons.link}</div>
          <p class="empty-copy">${escapeHtml(webhooksError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">重新加载</button></div>
        </div>
      `;
    }

    if (webhooksLoading) {
      return renderEmptyState("加载中", "正在加载 Webhook 配置...", icons.link);
    }

    return `
      ${
        webhooks.length === 0
          ? renderEmptyState(
              "暂无 Webhook",
              "还没有配置任何 Webhook。添加后可在文件操作或管理事件时收到通知。",
              icons.link,
            )
          : `
            <div class="latest-list">
              ${webhooks
                .map(
                  (item) => `
                <article class="latest-item">
                  <div class="status-bar" style="margin-bottom:4px;">
                    <div class="status-main">
                      <span class="status-dot" style="background:${item.enabled ? "var(--primary)" : "var(--muted)"}"></span>
                      <span>${safeText(item.name)}</span>
                      <span class="toolbar-tag">${safeText(item.msgtype)}</span>
                      <span class="toolbar-tag">${safeText(item.method)}</span>
                      ${!item.enabled ? '<span class="toolbar-tag tag-expired">已禁用</span>' : ""}
                    </div>
                    <div class="btn-row">
                      <button class="btn toolbar-btn" type="button" data-action="test-webhook" data-id="${escapeHtml(item.id)}">测试</button>
                      <button class="btn toolbar-btn" type="button" data-action="edit-webhook" data-id="${escapeHtml(item.id)}">编辑</button>
                      <button class="btn btn-danger" type="button" data-action="confirm-delete-webhook" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">删除</button>
                    </div>
                  </div>
                  <div style="font-size:13px;color:var(--muted);">
                    ${escapeHtml(item.url)}
                    <span style="margin:0 8px;">·</span>
                    ${(item.events || []).map((e) => `<span class="toolbar-tag">${escapeHtml(e)}</span>`).join(" ")}
                  </div>
                </article>
              `,
                )
                .join("")}
            </div>
          `
      }
    `;
  }

  function renderAdminWebhookDeliveriesSection(admin) {
    const { webhookDeliveries, webhookDeliveriesLoading } = admin;

    return `
      ${
        webhookDeliveriesLoading
          ? renderEmptyState("加载中", "正在加载投递记录...", icons.list)
          : webhookDeliveries.length === 0
            ? renderEmptyState(
                "暂无投递记录",
                "还没有任何 Webhook 投递记录。",
                icons.list,
              )
            : `
              <div class="latest-list">
                ${webhookDeliveries
                  .map((item) => {
                    const ok = item.ok === 1 || item.ok === true;
                    return `
                    <article class="latest-item">
                      <div class="status-bar" style="margin-bottom:4px;">
                        <div class="status-main">
                          <span class="status-dot" style="background:${ok ? "var(--primary)" : "var(--danger)"}"></span>
                          <span>${safeText(item.event)}</span>
                          <span class="toolbar-tag">${safeText(item.endpoint)}</span>
                          <span class="toolbar-tag ${ok ? "tag-unlimited" : "tag-expired"}">${ok ? "成功" : "失败"}</span>
                        </div>
                      </div>
                      <div style="font-size:13px;color:var(--muted);">
                        ${ok ? `<span>HTTP ${escapeHtml(String(item.status))}</span>` : `<span>${escapeHtml(item.error || "未知错误")}</span>`}
                        <span style="margin:0 8px;">·</span>
                        <span>${escapeHtml(item.duration_ms || 0)}ms</span>
                        <span style="margin:0 8px;">·</span>
                        <span>${escapeHtml(formatRelative(item.created_at) || "")}</span>
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

  function renderWebhookSection(admin) {
    const { webhooks, webhooksLoading, webhooksError } = admin;
    const { webhookDeliveries, webhookDeliveriesLoading } = admin;

    let webhooksHtml = "";
    if (webhooksError) {
      webhooksHtml = `
        <div class="empty-state">
          <div class="empty-orb">${icons.link}</div>
          <p class="empty-copy">${escapeHtml(webhooksError)}</p>
          <div style="margin-top:12px;"><button class="btn toolbar-btn" type="button" data-action="refresh-admin-webhooks">重新加载</button></div>
        </div>
      `;
    } else if (webhooksLoading) {
      webhooksHtml = renderEmptyStateCompact(
        "加载中",
        "正在加载 Webhook 配置...",
        icons.link,
      );
    } else if (webhooks.length === 0) {
      webhooksHtml = renderEmptyStateCompact(
        "暂无 Webhook",
        "还没有配置任何 Webhook。添加后可在文件操作或管理事件时收到通知。",
        icons.link,
      );
    } else {
      webhooksHtml = `
        <div class="latest-list-compact">
          ${webhooks
            .map(
              (item) => `
            <article class="latest-item-compact">
              <div class="status-bar">
                <div class="status-main">
                  <span class="status-dot" style="background:${item.enabled ? "var(--primary)" : "var(--muted)"}"></span>
                  <span>${safeText(item.name)}</span>
                  <span class="toolbar-tag">${safeText(item.msgtype)}</span>
                  <span class="toolbar-tag">${safeText(item.method)}</span>
                  ${!item.enabled ? '<span class="toolbar-tag tag-expired">已禁用</span>' : ""}
                </div>
                <div class="btn-row">
                  <button class="btn toolbar-btn" type="button" data-action="test-webhook" data-id="${escapeHtml(item.id)}">测试</button>
                  <button class="btn toolbar-btn" type="button" data-action="edit-webhook" data-id="${escapeHtml(item.id)}">编辑</button>
                  <button class="btn btn-danger" type="button" data-action="confirm-delete-webhook" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">删除</button>
                </div>
              </div>
              <div class="latest-copy">
                ${escapeHtml(item.url)}
                <span style="margin:0 6px;">·</span>
                ${(item.events || []).map((e) => `<span class="toolbar-tag">${escapeHtml(e)}</span>`).join(" ")}
              </div>
            </article>
          `,
            )
            .join("")}
        </div>
      `;
    }

    let deliveriesHtml = "";
    if (webhookDeliveriesLoading) {
      deliveriesHtml = renderEmptyStateCompact(
        "加载中",
        "正在加载投递记录...",
        icons.list,
      );
    } else if (webhookDeliveries.length === 0) {
      deliveriesHtml = renderEmptyStateCompact(
        "暂无投递记录",
        "还没有任何 Webhook 投递记录。",
        icons.list,
      );
    } else {
      deliveriesHtml = `
        <div class="latest-list-compact">
          ${webhookDeliveries
            .map((item) => {
              const ok = item.ok === 1 || item.ok === true;
              return `
              <article class="latest-item-compact">
                <div class="status-bar">
                  <div class="status-main">
                    <span class="status-dot" style="background:${ok ? "var(--primary)" : "var(--danger)"}"></span>
                    <span>${safeText(item.event)}</span>
                    <span class="toolbar-tag">${safeText(item.endpoint)}</span>
                    <span class="toolbar-tag ${ok ? "tag-unlimited" : "tag-expired"}">${ok ? "成功" : "失败"}</span>
                  </div>
                </div>
                <div class="latest-copy">
                  ${ok ? `<span>HTTP ${escapeHtml(String(item.status))}</span>` : `<span>${escapeHtml(item.error || "未知错误")}</span>`}
                  <span style="margin:0 6px;">·</span>
                  <span>${escapeHtml(item.duration_ms || 0)}ms</span>
                  <span style="margin:0 6px;">·</span>
                  <span>${escapeHtml(formatRelative(item.created_at) || "")}</span>
                </div>
              </article>
            `;
            })
            .join("")}
        </div>
      `;
    }

    return `
      <div class="admin-section-compact">
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>Webhook 配置</h3>
          </div>
          ${webhooksHtml}
        </section>
        <section>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <h3>投递记录</h3>
          </div>
          ${deliveriesHtml}
        </section>
      </div>
    `;
  }

  return {
    renderAdminWebhooksSection,
    renderAdminWebhookDeliveriesSection,
    renderWebhookSection,
  };
}
