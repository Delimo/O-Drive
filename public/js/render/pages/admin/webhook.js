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

  function renderWebhookSection(admin) {
    const {
      webhooksLoading, webhooks = [],
      webhookDeliveriesLoading, webhookDeliveries = []
    } = admin;

    if (webhooksLoading) {
      return renderEmptyStateCompact("载入中", "正在加载 Webhook 配置...", "");
    }

    return `
      <div class="ov-webhook-page">
        <div class="ov-webhook-page-header">
          <div class="ov-webhook-page-title-group">
            <h2 class="ov-webhook-page-title">Webhook 通知</h2>
            <p class="ov-webhook-page-desc">管理文件操作、异常行为和分享链接到期的外部通知通道</p>
          </div>
        </div>

        <div class="ov-webhook-page-grid">
          <div class="ov-webhook-page-left">
            <div class="ov-webhook-config-card">
              <div class="ov-webhook-config-header">
                <span class="ov-webhook-config-title">通知配置</span>
                <span class="ov-webhook-config-desc">当前编辑内容会保存为一条 Webhook 规则</span>
              </div>
              <div class="ov-webhook-config-body">
                <div class="ov-webhook-events-section">
                  <span class="ov-webhook-section-label">触发事件</span>
                  <div class="ov-webhook-events-grid">
                    ${Object.entries(EVENT_LABELS).map(([key, { label, desc }]) => `
                      <div class="ov-webhook-event-item">
                        <span class="ov-webhook-event-label">${escapeHtml(label)}</span>
                        <span class="ov-webhook-event-desc">${escapeHtml(desc)}</span>
                      </div>
                    `).join("")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="ov-webhook-page-right">
            <div class="ov-webhook-list-card">
              <div class="ov-webhook-list-header">
                <div class="ov-webhook-list-title-group">
                  <span class="ov-webhook-list-title">已配置 Webhook</span>
                  <span class="ov-webhook-list-count">${webhooks.length} 个</span>
                </div>
                <button class="btn btn-sm" type="button" data-action="refresh-admin-webhooks">刷新</button>
              </div>
              <div class="ov-webhook-list-body">
                ${webhooks.length === 0
                  ? `<div class="ov-empty-inline">无配置的 Webhook 回调点</div>`
                  : `<div class="ov-webhook-list">
                      ${webhooks.map(hook => {
                        const events = hook.events || [];
                        const eventLabels = events.map(e => EVENT_LABELS[e]?.label || e).join("、");
                        return `
                          <div class="ov-webhook-card">
                            <div class="ov-webhook-card-header">
                              <div class="ov-webhook-card-tags">
                                <span class="ov-webhook-tag ov-webhook-tag-method">${escapeHtml(hook.method || "POST")}</span>
                                <span class="ov-webhook-tag ov-webhook-tag-format">${escapeHtml(hook.msgtype || "json")}</span>
                              </div>
                              <span class="ov-webhook-card-name">${escapeHtml(hook.name || "未命名")}</span>
                            </div>
                            <div class="ov-webhook-card-url" title="${escapeHtml(hook.url || "")}">${escapeHtml(hook.url || "")}</div>
                            <div class="ov-webhook-card-meta">
                              <span class="ov-webhook-tag ov-webhook-tag-content">${escapeHtml(hook.contentType || "application/json")}</span>
                              <span class="ov-webhook-card-events">${eventLabels || "全部事件"}</span>
                            </div>
                            <div class="ov-webhook-card-actions">
                              <button class="btn btn-sm" type="button"
                                      data-action="edit-webhook" data-id="${escapeHtml(hook.id)}">编辑</button>
                              <button class="btn btn-sm" type="button"
                                      data-action="test-webhook" data-id="${escapeHtml(hook.id)}">测试发送</button>
                              <button class="btn btn-danger btn-sm" type="button"
                                      data-action="confirm-delete-webhook"
                                      data-id="${escapeHtml(hook.id)}"
                                      data-name="${escapeHtml(hook.name)}">删除</button>
                            </div>
                          </div>
                        `;
                      }).join("")}
                    </div>`
                }
              </div>
            </div>

            <div class="ov-webhook-delivery-card">
              <div class="ov-webhook-delivery-header">
                <div class="ov-webhook-delivery-title-group">
                  <span class="ov-webhook-delivery-title">最近投递</span>
                  <span class="ov-webhook-delivery-count">显示 ${webhookDeliveries.length} 条</span>
                </div>
                <button class="btn btn-sm" type="button" data-action="refresh-admin-webhook-deliveries">刷新</button>
              </div>
              <div class="ov-webhook-delivery-body">
                ${webhookDeliveriesLoading
                  ? `<div class="ov-empty-inline">加载中...</div>`
                  : webhookDeliveries.length === 0
                    ? `<div class="ov-empty-inline">暂无投递记录</div>`
                    : `<div class="ov-webhook-delivery-list">
                        ${webhookDeliveries.slice(0, 20).map(del => `
                          <div class="ov-webhook-delivery-item">
                            <div class="ov-webhook-delivery-row">
                              <span class="ov-webhook-delivery-event">${escapeHtml(del.event || "")}</span>
                              <span class="ov-webhook-delivery-status ${del.ok ? "ov-webhook-status-ok" : "ov-webhook-status-err"}">${del.status || "-"}</span>
                            </div>
                            <div class="ov-webhook-delivery-url" title="${escapeHtml(del.endpoint || "")}">${escapeHtml(del.endpoint || "")}</div>
                            <div class="ov-webhook-delivery-meta">
                              <span>${del.created_at ? formatTime(del.created_at) : "-"}</span>
                              <span>${del.duration_ms ? del.duration_ms + "ms" : "-"}</span>
                            </div>
                          </div>
                        `).join("")}
                      </div>`
                }
              </div>
            </div>
          </div>
        </div>

        <div class="ov-webhook-page-footer">
          <button class="btn btn-primary" type="button" data-action="show-add-webhook">添加 Webhook</button>
        </div>
      </div>
    `;
  }

  return { renderWebhookSection };
}
