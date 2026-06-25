export function createWebhookRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  const EVENT_LABELS = {
    "file.uploaded": { label: "上传", desc: "文件写入完成" },
    "file.deleted": { label: "删除", desc: "移入回收站" },
    "file.purged": { label: "彻底删除", desc: "回收站永久清除" },
    "file.moved": { label: "移动", desc: "路径位置变更" },
    "file.copied": { label: "复制", desc: "生成副本" },
    "file.renamed": { label: "重命名", desc: "名称变更" },
    "folder.created": { label: "新建文件夹", desc: "目录创建" },
    "download.burst": { label: "下载异常提醒", desc: "短时间下载过多" },
    "login.burst": { label: "登录异常", desc: "连续失败登录" },
    "share.expired": { label: "分享链接到期", desc: "分享失效或耗尽" },
  };

  const EVENT_ORDER = Object.keys(EVENT_LABELS);

  function getEventMeta(eventKey) {
    return EVENT_LABELS[eventKey] || {
      label: eventKey || "未知事件",
      desc: "自定义事件",
    };
  }

  function renderEventChips(events = [], limit = 4) {
    if (!events.length) {
      return `<span class="ov-webhook-chip ov-webhook-chip-all">全部事件</span>`;
    }
    const visible = events.slice(0, limit);
    const overflow = events.length - visible.length;
    return [
      ...visible.map((eventKey) => {
        const meta = getEventMeta(eventKey);
        return `<span class="ov-webhook-chip">${escapeHtml(meta.label)}</span>`;
      }),
      overflow > 0
        ? `<span class="ov-webhook-chip ov-webhook-chip-muted">+${overflow}</span>`
        : "",
    ].join("");
  }

  function renderPreviewBlock(label, value, mono = false) {
    return `
      <div class="ov-webhook-preview-block">
        <span class="ov-webhook-preview-label">${escapeHtml(label)}</span>
        <div class="ov-webhook-preview-value${mono ? " ov-webhook-preview-value-mono" : ""}">${value}</div>
      </div>
    `;
  }

  function renderPreviewSection(primaryWebhook) {
    if (!primaryWebhook) {
      return `
        <div class="ov-webhook-preview-empty">
          <div class="ov-webhook-preview-empty-copy">
            <h3 class="ov-webhook-preview-empty-title">还没有配置 Webhook</h3>
            <p class="ov-webhook-preview-empty-desc">先创建一条规则，随后可以在右侧进行测试投递、编辑和删除。</p>
          </div>
          <button class="btn btn-primary" type="button" data-action="show-add-webhook">新增规则</button>
        </div>
      `;
    }

    const headersText = primaryWebhook.headers && Object.keys(primaryWebhook.headers).length
      ? JSON.stringify(primaryWebhook.headers, null, 2)
      : '{\n  "X-Source": "o-drive"\n}';
    const bodyText = String(primaryWebhook.body || "").trim() || (
      primaryWebhook.msgtype === "text"
        ? "事件：{event}\n路径：{{data.path}}\n时间：{timestamp}"
        : primaryWebhook.msgtype === "markdown"
          ? "## O-Drive 通知\n- 事件：{event}\n- 路径：{{data.path}}\n- 时间：{timestamp}"
          : '{\n  "event": "{event}",\n  "path": "{{data.path}}",\n  "time": "{timestamp}"\n}'
    );

    return `
      <div class="ov-webhook-preview-shell">
        <div class="ov-webhook-preview-grid">
          ${renderPreviewBlock("名称", safeText(primaryWebhook.name, "未命名规则"))}
          ${renderPreviewBlock("URL", escapeHtml(primaryWebhook.url || "-"), true)}
          ${renderPreviewBlock("发送方式", escapeHtml(primaryWebhook.method || "POST"))}
          ${renderPreviewBlock("消息格式", escapeHtml(primaryWebhook.msgtype || "json"))}
          ${renderPreviewBlock("Content-Type", escapeHtml(primaryWebhook.contentType || "application/json"), true)}
          ${renderPreviewBlock("状态", primaryWebhook.enabled === false ? "已停用" : "已启用")}
        </div>
        <div class="ov-webhook-preview-panes">
          ${renderPreviewBlock("Headers", `<pre>${escapeHtml(headersText)}</pre>`, true)}
          ${renderPreviewBlock("Body 模板", `<pre>${escapeHtml(bodyText)}</pre>`, true)}
        </div>
        <div class="ov-webhook-preview-events">
          <div class="ov-webhook-subhead">
            <span class="ov-webhook-subtitle">触发事件</span>
            <span class="ov-webhook-subcopy">${primaryWebhook.events?.length ? `${primaryWebhook.events.length} 项` : "全部事件"}</span>
          </div>
          <div class="ov-webhook-event-matrix">
            ${EVENT_ORDER.map((eventKey) => {
              const meta = getEventMeta(eventKey);
              const active = !primaryWebhook.events?.length || primaryWebhook.events.includes(eventKey);
              return `
                <div class="ov-webhook-event-card${active ? " is-active" : ""}">
                  <span class="ov-webhook-event-card-title">${escapeHtml(meta.label)}</span>
                  <span class="ov-webhook-event-card-desc">${escapeHtml(meta.desc)}</span>
                </div>
              `;
            }).join("")}
          </div>
        </div>
        <div class="ov-webhook-preview-actions">
          <button class="btn btn-primary" type="button" data-action="edit-webhook" data-id="${escapeHtml(primaryWebhook.id)}">编辑当前规则</button>
          <button class="btn" type="button" data-action="show-add-webhook">新增规则</button>
        </div>
      </div>
    `;
  }

  function renderWebhookCard(hook) {
    const name = safeText(hook.name, "未命名规则");
    const statusClass = hook.enabled === false ? "ov-webhook-status-off" : "ov-webhook-status-on";
    const statusLabel = hook.enabled === false ? "已停用" : "已启用";

    return `
      <article class="ov-webhook-rule-card">
        <div class="ov-webhook-rule-head">
          <div class="ov-webhook-rule-title-row">
            <div class="ov-webhook-rule-tags">
              <span class="ov-webhook-chip ov-webhook-chip-method">${escapeHtml(hook.method || "POST")}</span>
              <span class="ov-webhook-chip ov-webhook-chip-format">${escapeHtml(hook.msgtype || "json")}</span>
              <span class="ov-webhook-chip ${statusClass}">${statusLabel}</span>
            </div>
            <h3 class="ov-webhook-rule-name">${name}</h3>
          </div>
          <div class="ov-webhook-rule-actions">
            <button class="btn btn-sm" type="button" data-action="edit-webhook" data-id="${escapeHtml(hook.id)}">编辑</button>
            <button class="btn btn-sm" type="button" data-action="test-webhook" data-id="${escapeHtml(hook.id)}">测试发送</button>
            <button class="btn btn-danger btn-sm" type="button" data-action="confirm-delete-webhook" data-id="${escapeHtml(hook.id)}" data-name="${escapeHtml(hook.name || name)}">删除</button>
          </div>
        </div>
        <div class="ov-webhook-rule-url" title="${escapeHtml(hook.url || "")}">${escapeHtml(hook.url || "")}</div>
        <div class="ov-webhook-rule-meta">
          <span class="ov-webhook-rule-content-type">${escapeHtml(hook.contentType || "application/json")}</span>
          <div class="ov-webhook-rule-event-row">${renderEventChips(hook.events || [])}</div>
        </div>
      </article>
    `;
  }

  function renderDeliveryCard(delivery) {
    const eventMeta = getEventMeta(delivery.event);
    const ok = Boolean(delivery.ok);
    return `
      <article class="ov-webhook-delivery-card-item">
        <div class="ov-webhook-delivery-top">
          <div class="ov-webhook-delivery-title-wrap">
            <span class="ov-webhook-delivery-event">${escapeHtml(eventMeta.label)}</span>
            <span class="ov-webhook-delivery-endpoint">${safeText(delivery.endpoint, "未命名端点")}</span>
          </div>
          <span class="ov-webhook-delivery-status ${ok ? "ov-webhook-status-ok" : "ov-webhook-status-err"}">${escapeHtml(String(delivery.status || (ok ? 200 : 0) || "-"))}</span>
        </div>
        <div class="ov-webhook-delivery-url" title="${escapeHtml(delivery.url || delivery.endpoint || "")}">${escapeHtml(delivery.url || delivery.endpoint || "")}</div>
        <div class="ov-webhook-delivery-meta">
          <span>${delivery.created_at ? formatTime(delivery.created_at) : "-"}</span>
          <span>${delivery.duration_ms != null ? `${escapeHtml(String(delivery.duration_ms))} ms` : "-"}</span>
          ${delivery.error ? `<span class="ov-webhook-delivery-error">${escapeHtml(delivery.error)}</span>` : ""}
        </div>
      </article>
    `;
  }

  function renderWebhookSection(admin) {
    const {
      webhooksLoading, webhooksError, webhooks = [],
      webhookDeliveriesLoading, webhookDeliveries = []
    } = admin;

    if (webhooksLoading) {
      return renderEmptyStateCompact("载入中", "正在加载 Webhook 配置...", "");
    }

    const activeWebhooks = webhooks.filter((hook) => hook.enabled !== false);
    const primaryWebhook = webhooks[0] || null;
    const deliverySuccessCount = webhookDeliveries.filter((item) => item.ok).length;
    const deliveryFailureCount = webhookDeliveries.filter((item) => !item.ok).length;
    const topEvents = primaryWebhook?.events?.length ? primaryWebhook.events.slice(0, 3) : EVENT_ORDER.slice(0, 3);

    return `
      <div class="ov-webhook-page">
        <div class="ov-webhook-page-header">
          <div class="ov-webhook-page-title-group">
            <h2 class="ov-webhook-page-title">Webhook 通知</h2>
            <p class="ov-webhook-page-desc">管理文件操作、异常行为和分享链接到期的外部通知通道</p>
          </div>
          <div class="ov-webhook-page-pills">
            ${topEvents.map((eventKey) => `<span class="ov-webhook-chip ov-webhook-chip-header">${escapeHtml(getEventMeta(eventKey).label)}</span>`).join("")}
          </div>
        </div>

        <div class="ov-webhook-page-stats">
          <div class="ov-webhook-stat-card">
            <span class="ov-webhook-stat-label">规则总数</span>
            <strong class="ov-webhook-stat-value">${escapeHtml(String(webhooks.length))}</strong>
            <span class="ov-webhook-stat-meta">已启用 ${escapeHtml(String(activeWebhooks.length))} 条</span>
          </div>
          <div class="ov-webhook-stat-card">
            <span class="ov-webhook-stat-label">最近投递</span>
            <strong class="ov-webhook-stat-value">${escapeHtml(String(webhookDeliveries.length))}</strong>
            <span class="ov-webhook-stat-meta">成功 ${escapeHtml(String(deliverySuccessCount))} / 失败 ${escapeHtml(String(deliveryFailureCount))}</span>
          </div>
          <div class="ov-webhook-stat-card ov-webhook-stat-card-action">
            <span class="ov-webhook-stat-label">接入动作</span>
            <strong class="ov-webhook-stat-value">新增规则</strong>
            <button class="btn btn-primary btn-sm" type="button" data-action="show-add-webhook">添加 Webhook</button>
          </div>
        </div>

        <div class="ov-webhook-page-grid">
          <div class="ov-webhook-page-left">
            <section class="ov-webhook-config-card">
              <div class="ov-webhook-config-header">
                <div>
                  <span class="ov-webhook-config-title">规则预览</span>
                  <span class="ov-webhook-config-desc">沿用项目现有弹窗保存逻辑，这里展示当前规则结构和事件覆盖范围。</span>
                </div>
                ${primaryWebhook ? `<button class="btn btn-sm" type="button" data-action="edit-webhook" data-id="${escapeHtml(primaryWebhook.id)}">编辑当前</button>` : ""}
              </div>
              <div class="ov-webhook-config-body">
                ${renderPreviewSection(primaryWebhook)}
              </div>
            </section>
          </div>

          <div class="ov-webhook-page-right">
            <section class="ov-webhook-list-card">
              <div class="ov-webhook-list-header">
                <div class="ov-webhook-list-title-group">
                  <span class="ov-webhook-list-title">已配置 Webhook</span>
                  <span class="ov-webhook-list-count">${webhooks.length} 条</span>
                </div>
                <button class="btn btn-sm" type="button" data-action="refresh-admin-webhooks">刷新</button>
              </div>
              <div class="ov-webhook-list-body">
                ${webhooksError
                  ? components.renderErrorCard({ icon: "", error: webhooksError, onRetry: "refresh-admin-webhooks" })
                  : webhooks.length === 0
                  ? `<div class="ov-empty-inline">无配置的 Webhook 回调点</div>`
                  : `<div class="ov-webhook-list">
                      ${webhooks.map((hook) => renderWebhookCard(hook)).join("")}
                    </div>`
                }
              </div>
            </section>

            <section class="ov-webhook-delivery-card">
              <div class="ov-webhook-delivery-header">
                <div class="ov-webhook-delivery-title-group">
                  <span class="ov-webhook-delivery-title">最近投递</span>
                  <span class="ov-webhook-delivery-count">显示 ${webhookDeliveries.length} / 保留 200 条</span>
                </div>
                <button class="btn btn-sm" type="button" data-action="refresh-admin-webhook-deliveries">刷新</button>
              </div>
              <div class="ov-webhook-delivery-body">
                ${webhookDeliveriesLoading
                  ? `<div class="ov-empty-inline">加载中...</div>`
                  : webhookDeliveries.length === 0
                    ? `<div class="ov-empty-inline">暂无投递记录</div>`
                    : `<div class="ov-webhook-delivery-list">
                        ${webhookDeliveries.slice(0, 20).map((delivery) => renderDeliveryCard(delivery)).join("")}
                      </div>`
                }
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  }

  return { renderWebhookSection };
}
