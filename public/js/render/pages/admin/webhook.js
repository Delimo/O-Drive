export function createWebhookRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, components
}) {

  function renderWebhookSection(admin) {
    const { webhooksLoading, webhooks = [] } = admin;

    if (webhooksLoading) {
      return renderEmptyStateCompact("载入中", "正在加载 Webhook 配置...", "");
    }

    return `
      <div class="ov-webhook-page">
        <div class="ov-webhook-page-header">
          <div class="ov-webhook-page-title-group">
            <h2 class="ov-webhook-page-title">Webhooks</h2>
            <p class="ov-webhook-page-desc">管理 Webhook 回调端点，用于接收系统事件通知</p>
          </div>
          <button class="btn btn-primary btn-sm" type="button" data-action="show-add-webhook">添加</button>
        </div>

        <div class="ov-webhook-page-content">
          ${webhooks.length === 0
            ? `<div class="ov-empty-inline">无配置的 Webhook 回调点</div>`
            : `<div class="ov-webhook-list">
                ${webhooks.map(hook => `
                  <div class="ov-webhook-item">
                    <div class="ov-webhook-info">
                      <span class="ov-webhook-name">${escapeHtml(hook.name)}</span>
                      <code class="ov-webhook-method">${escapeHtml(hook.method || "POST")}</code>
                    </div>
                    <div class="ov-webhook-actions">
                      <button class="btn btn-sm" type="button"
                              data-action="edit-webhook" data-id="${escapeHtml(hook.id)}">编辑</button>
                      <button class="btn btn-danger btn-sm" type="button"
                              data-action="confirm-delete-webhook"
                              data-id="${escapeHtml(hook.id)}"
                              data-name="${escapeHtml(hook.name)}">删除</button>
                    </div>
                  </div>
                `).join("")}
              </div>`
          }
        </div>
      </div>
    `;
  }

  return { renderWebhookSection };
}
