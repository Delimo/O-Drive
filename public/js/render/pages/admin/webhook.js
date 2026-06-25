export function createWebhookRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, components
}) {

  const EVENT_OPTIONS = [
    { key: "file.uploaded", label: "上传", desc: "文件写入完成" },
    { key: "file.deleted", label: "删除", desc: "移入回收站" },
    { key: "file.purged", label: "彻底删除", desc: "回收站永久清除" },
    { key: "file.moved", label: "移动", desc: "路径位置变更" },
    { key: "file.copied", label: "复制", desc: "生成副本" },
    { key: "file.renamed", label: "重命名", desc: "名称变更" },
    { key: "folder.created", label: "新建文件夹", desc: "目录创建" },
    { key: "download.burst", label: "下载异常提醒", desc: "短时间下载过多" },
    { key: "login.burst", label: "登录异常", desc: "连续失败登录" },
    { key: "share.expired", label: "分享链接到期", desc: "分享失效或耗尽" },
  ];

  const EVENT_LABELS = {};
  EVENT_OPTIONS.forEach(e => { EVENT_LABELS[e.key] = e.label; });

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
          <div class="ov-webhook-page-pills">
            <button class="ov-webhook-chip ov-webhook-chip-header" type="button">文件事件</button>
            <button class="ov-webhook-chip" type="button">异常提醒</button>
            <button class="ov-webhook-chip" type="button">分享到期</button>
          </div>
        </div>

        <div class="ov-webhook-page-grid">
          <div class="ov-webhook-page-left">
            <div class="ov-webhook-config-card">
              <div class="ov-webhook-config-header">
                <div>
                  <span class="ov-webhook-config-title">通知配置</span>
                  <span class="ov-webhook-config-desc">当前编辑内容会保存为一条 Webhook 规则</span>
                </div>
              </div>
              <div class="ov-webhook-config-body">
                <div class="ov-webhook-preview-shell">
                  <div class="ov-webhook-preview-grid">
                    <div class="ov-webhook-preview-block">
                      <span class="ov-webhook-preview-label">发送目标</span>
                      <div style="display:flex;flex-direction:column;gap:8px;">
                        <input class="input" type="text" placeholder="名称（可选）">
                        <input class="input" type="url" placeholder="URL *" required>
                        <input class="input" type="text" value="json" placeholder="消息格式">
                      </div>
                    </div>
                    <div class="ov-webhook-preview-block">
                      <span class="ov-webhook-preview-label">Method / Content-Type</span>
                      <div style="display:flex;flex-direction:column;gap:8px;">
                        <input class="input" type="text" value="POST">
                        <input class="input" type="text" value="application/json">
                      </div>
                    </div>
                  </div>

                  <div class="ov-webhook-preview-panes">
                    <div class="ov-webhook-preview-block">
                      <span class="ov-webhook-preview-label">Headers</span>
                      <textarea class="input" rows="3" placeholder='{"X-Token": "..."}' style="resize:vertical;"></textarea>
                    </div>
                    <div class="ov-webhook-preview-block">
                      <span class="ov-webhook-preview-label">Body</span>
                      <textarea class="input" rows="3" placeholder='{"event":"{event}","path":"{{data.path}}"}' style="resize:vertical;"></textarea>
                    </div>
                  </div>

                  <div class="ov-webhook-preview-events">
                    <div class="ov-webhook-subhead">
                      <span class="ov-webhook-subtitle">触发事件</span>
                    </div>
                    <div class="ov-webhook-event-chips">
                      ${EVENT_OPTIONS.map(({ key, label, desc }) => `
                        <label class="ov-webhook-event-chip">
                          <input type="checkbox" name="events" value="${escapeHtml(key)}" checked>
                          <span class="ov-webhook-event-chip-label">${escapeHtml(label)}</span>
                          <span class="ov-webhook-event-chip-desc">${escapeHtml(desc)}</span>
                        </label>
                      `).join("")}
                    </div>
                  </div>

                  <div class="ov-webhook-preview-actions">
                    <button class="btn btn-primary" type="button" data-action="show-add-webhook">保存</button>
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
                        const eventLabels = events.map(e => EVENT_LABELS[e] || e).join("、");
                        return `
                          <div class="ov-webhook-rule-card">
                            <div class="ov-webhook-rule-head">
                              <div class="ov-webhook-rule-title-row">
                                <div class="ov-webhook-rule-tags">
                                  <span class="ov-webhook-chip ov-webhook-chip-method">${escapeHtml(hook.method || "POST")}</span>
                                  <span class="ov-webhook-chip ov-webhook-chip-format">格式 ${escapeHtml(hook.msgtype || "json")}</span>
                                </div>
                                <span class="ov-webhook-rule-name">${escapeHtml(hook.name || "未命名")}</span>
                              </div>
                              <div class="ov-webhook-rule-actions">
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
                            <div class="ov-webhook-rule-url">${escapeHtml(hook.url || "")}</div>
                            <div class="ov-webhook-rule-meta">
                              <span class="ov-webhook-rule-content-type">${escapeHtml(hook.contentType || "application/json")}</span>
                              <div class="ov-webhook-rule-event-row">
                                ${events.length > 0
                                  ? events.slice(0, 3).map(e => `<span class="ov-webhook-chip">${escapeHtml(EVENT_LABELS[e] || e)}</span>`).join("")
                                  : `<span class="ov-webhook-chip">全部事件</span>`
                                }
                              </div>
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
                          <div class="ov-webhook-delivery-card-item">
                            <div class="ov-webhook-delivery-top">
                              <div class="ov-webhook-delivery-title-wrap">
                                <span class="ov-webhook-delivery-event">${escapeHtml(del.event || "")}</span>
                                <span class="ov-webhook-delivery-endpoint">${escapeHtml(del.endpoint || "")}</span>
                              </div>
                              <span class="ov-webhook-delivery-status ${del.ok ? "ov-webhook-status-ok" : "ov-webhook-status-err"}">${del.status || "-"}</span>
                            </div>
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
      </div>
    `;
  }

  return { renderWebhookSection };
}
