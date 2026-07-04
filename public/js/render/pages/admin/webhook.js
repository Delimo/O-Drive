export function createWebhookRenderer({
  safeText, escapeHtml, renderEmptyStateCompact, formatTime, formatRelative, components
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
  const EVENT_GROUPS = [
    { label: "文件变更", desc: "上传、移动、复制、重命名和删除", keys: ["file.uploaded", "file.moved", "file.copied", "file.renamed", "file.deleted", "file.purged", "folder.created"] },
    { label: "风险提醒", desc: "异常下载、登录异常和分享到期", keys: ["download.burst", "login.burst", "share.expired"] },
  ];
  const SEVERITY_LABELS = { info: "信息", warning: "警告", error: "错误" };

  function normalizeTimestamp(value) {
    if (!value) return 0;
    if (typeof value === "string" && !/^\d+$/.test(value)) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return num < 1000000000000 ? num * 1000 : num;
  }

  function renderWebhookSection(admin) {
    const {
      webhooksLoading, webhooks = [],
      webhookDeliveriesLoading, webhookDeliveries = [],
      webhookPolicy = { mode: "compat", allowlistEnabled: false, allowedHosts: [] },
      webhookRetryingId = 0,
      notificationsUnread = 0,
      adminNotifHistory = [], adminNotifHistoryLoading = false,
      adminNotifFilter = { severity: "all", read: "all", event: "" },
      webhookRecordTab = "deliveries",
    } = admin;
    const notifFilter = adminNotifFilter || { severity: "all", read: "all", event: "" };
    const recordTab = webhookRecordTab === "notifications" ? "notifications" : "deliveries";
    const unreadCount = Number(notificationsUnread || 0) || adminNotifHistory.filter(item => !item.read).length;
    const failedDeliveryCount = webhookDeliveries.filter(del => !del.ok).length;
    const enabledWebhookCount = webhooks.filter(hook => hook.enabled !== false).length;
    const allowedHosts = Array.isArray(webhookPolicy.allowedHosts) ? webhookPolicy.allowedHosts : [];
    const policyStrict = webhookPolicy.allowlistEnabled || webhookPolicy.mode === "allowlist";
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const deliveryTimes = webhookDeliveries.map(del => normalizeTimestamp(del.created_at || del.createdAt)).filter(Boolean);
    const todayDeliveryCount = deliveryTimes.filter(time => time >= todayStart.getTime()).length;
    const latestDeliveryTime = deliveryTimes.reduce((latest, time) => Math.max(latest, time), 0);

    function renderSoftEmpty(title, copy = "") {
      return `
        <div class="ov-webhook-soft-empty">
          <span>${escapeHtml(title)}</span>
          ${copy ? `<small>${escapeHtml(copy)}</small>` : ""}
        </div>
      `;
    }

    function renderEventGroups() {
      return `
        <div class="ov-webhook-event-groups">
          ${EVENT_GROUPS.map(group => `
            <div class="ov-webhook-event-group">
              <div class="ov-webhook-event-group-head">
                <span>${escapeHtml(group.label)}</span>
                <small>${escapeHtml(group.desc)}</small>
              </div>
              <div class="ov-webhook-event-token-row">
                ${group.keys.map(key => `<span class="ov-webhook-event-token">${escapeHtml(EVENT_LABELS[key] || key)}</span>`).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      `;
    }

    function renderWebhookList() {
      if (webhooksLoading) return renderSoftEmpty("正在加载 Webhook 配置...");
      if (webhooks.length === 0) return renderSoftEmpty("还没有 Webhook 规则", "新增后会在这里集中管理。");
      return `
        <div class="ov-webhook-list">
          ${webhooks.map(hook => {
            const events = hook.events || [];
            return `
              <div class="ov-webhook-rule-card">
                <div class="ov-webhook-rule-head">
                  <div class="ov-webhook-rule-title-row">
                    <div class="ov-webhook-rule-tags">
                      <span class="ov-webhook-chip ov-webhook-chip-method">${escapeHtml(hook.method || "POST")}</span>
                      <span class="ov-webhook-chip ov-webhook-chip-format">${escapeHtml(hook.msgtype || "json")}</span>
                      <span class="ov-webhook-chip ${hook.enabled === false ? "ov-webhook-status-off" : "ov-webhook-status-on"}">${hook.enabled === false ? "停用" : "启用"}</span>
                    </div>
                    <span class="ov-webhook-rule-name">${escapeHtml(hook.name || "未命名")}</span>
                  </div>
                  <div class="ov-webhook-rule-actions">
                    <button class="btn btn-sm" type="button"
                            data-action="edit-webhook" data-id="${escapeHtml(hook.id)}"
                            aria-label="编辑 webhook">编辑</button>
                    <button class="btn btn-sm" type="button"
                            data-action="test-webhook" data-id="${escapeHtml(hook.id)}"
                            aria-label="测试 webhook">测试</button>
                    <button class="btn btn-danger btn-sm" type="button"
                            data-action="confirm-delete-webhook"
                            data-id="${escapeHtml(hook.id)}"
                            data-name="${escapeHtml(hook.name)}"
                            aria-label="删除 webhook">删除</button>
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
                    ${events.length > 3 ? `<span class="ov-webhook-chip ov-webhook-chip-muted">+${events.length - 3}</span>` : ""}
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderDeliveryList() {
      if (webhookDeliveriesLoading) return renderSoftEmpty("正在加载投递记录...");
      if (webhookDeliveries.length === 0) return renderSoftEmpty("暂无投递记录", "Webhook 触发后会出现在这里。");
      return `
        <div class="ov-webhook-delivery-list">
          ${webhookDeliveries.slice(0, 8).map(del => {
            const retrying = Number(webhookRetryingId || 0) === Number(del.id || 0);
            const eventLabel = EVENT_LABELS[del.event] || del.event || "事件通知";
            const createdAt = del.created_at || del.createdAt;
            return `
              <div class="ov-webhook-delivery-card-item">
                <div class="ov-webhook-delivery-top">
                  <div class="ov-webhook-delivery-title-wrap">
                    <span class="ov-webhook-delivery-event">${escapeHtml(eventLabel)}</span>
                    <span class="ov-webhook-delivery-endpoint">${escapeHtml(del.endpoint || "")}</span>
                  </div>
                  <div class="ov-webhook-delivery-actions">
                    <span class="ov-webhook-delivery-status ${del.ok ? "ov-webhook-status-ok" : "ov-webhook-status-err"}">${escapeHtml(del.status || "-")}</span>
                    ${!del.ok ? `<button class="btn btn-small" type="button" data-action="retry-webhook-delivery" data-id="${escapeHtml(del.id || "")}" ${retrying ? "disabled" : ""}>${retrying ? "重试中..." : "重试"}</button>` : ""}
                  </div>
                </div>
                <div class="ov-webhook-delivery-meta">
                  <span>${createdAt ? formatTime(createdAt) : "-"}</span>
                  <span>${del.duration_ms ? del.duration_ms + "ms" : "-"}</span>
                  ${del.retry_of ? `<span>重试自 #${escapeHtml(del.retry_of)}</span>` : ""}
                </div>
                ${del.error ? `<div class="ov-webhook-delivery-error">${escapeHtml(del.error)}</div>` : ""}
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderNotificationHistory() {
      if (adminNotifHistoryLoading) return renderSoftEmpty("正在加载通知历史...");
      if (adminNotifHistory.length === 0) {
        return renderSoftEmpty("当前筛选下没有通知", "可以调整级别、状态或事件关键字。");
      }
      return `
        <div class="ov-webhook-notif-list">
          ${adminNotifHistory.map((item) => {
            const severity = item.severity || "info";
            const badgeClass = severity === "error" ? "ov-badge-error" : severity === "warning" ? "ov-badge-warning" : "ov-badge-info";
            const eventLabel = EVENT_LABELS[item.event] || item.event || "notification";
            return `
              <div class="ov-webhook-notif-item ${item.read ? "" : "is-unread"}">
                <div class="ov-webhook-notif-main">
                  <div class="ov-webhook-notif-head">
                    ${components.renderBadge({ label: SEVERITY_LABELS[severity] || severity, className: badgeClass })}
                    <span class="ov-webhook-notif-event">${escapeHtml(eventLabel)}</span>
                    <span class="ov-webhook-notif-time">${formatRelative(item.created_at || item.createdAt || 0)}</span>
                  </div>
                  <div class="ov-webhook-notif-message">${escapeHtml(item.message || "")}</div>
                  ${item.path ? `<div class="ov-webhook-notif-path">${escapeHtml(item.path)}</div>` : ""}
                </div>
                ${!item.read ? `<button class="btn btn-sm" type="button" data-action="admin-mark-notif-read" data-notif-id="${escapeHtml(item.id)}">标为已读</button>` : `<span class="ov-webhook-notif-read">已读</span>`}
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    return `
      <div class="ov-webhook-page">
        <div class="ov-webhook-page-header">
          <div class="ov-webhook-page-title-group">
            <h2 class="ov-webhook-page-title">通知中心</h2>
            <p class="ov-webhook-page-desc">管理 Webhook 通道、查看投递结果和系统通知历史</p>
          </div>
          <button class="btn btn-primary btn-sm" type="button" data-action="show-add-webhook">新建 Webhook</button>
        </div>

        <div class="ov-webhook-page-stats">
          <div class="ov-webhook-stat-card">
            <span class="ov-webhook-stat-label">未读通知</span>
            <strong class="ov-webhook-stat-value">${unreadCount}</strong>
            <span class="ov-webhook-stat-meta">${unreadCount > 0 ? "需要处理" : "全部已读"}</span>
          </div>
          <div class="ov-webhook-stat-card">
            <span class="ov-webhook-stat-label">失败投递</span>
            <strong class="ov-webhook-stat-value">${failedDeliveryCount}</strong>
            <span class="ov-webhook-stat-meta">${failedDeliveryCount > 0 ? "可重试失败记录" : "最近投递正常"}</span>
          </div>
          <div class="ov-webhook-stat-card">
            <span class="ov-webhook-stat-label">Webhook 规则</span>
            <strong class="ov-webhook-stat-value">${enabledWebhookCount}/${webhooks.length}</strong>
            <span class="ov-webhook-stat-meta">启用 / 总数</span>
          </div>
          <div class="ov-webhook-stat-card">
            <span class="ov-webhook-stat-label">今日投递</span>
            <strong class="ov-webhook-stat-value">${todayDeliveryCount}</strong>
            <span class="ov-webhook-stat-meta">${latestDeliveryTime ? `最近 ${formatRelative(latestDeliveryTime)}` : "暂无投递"}</span>
          </div>
          <div class="ov-webhook-stat-card">
            <span class="ov-webhook-stat-label">目标策略</span>
            <strong class="ov-webhook-stat-value">${policyStrict ? "白名单" : "兼容"}</strong>
            <span class="ov-webhook-stat-meta">${policyStrict ? `${allowedHosts.length} 个允许域名` : "兼容公网域名"}</span>
          </div>
        </div>

        <div class="ov-webhook-page-grid">
          <div class="ov-webhook-page-left">
            <div class="ov-webhook-list-card">
              <div class="ov-webhook-list-header">
                <div class="ov-webhook-list-title-group">
                  <span class="ov-webhook-list-title">Webhook 规则</span>
                  <span class="ov-webhook-list-count">${webhooks.length} 个</span>
                </div>
                <div class="ov-webhook-list-actions">
                  <button class="btn btn-sm" type="button" data-action="refresh-admin-webhooks">刷新</button>
                </div>
              </div>
              <div class="ov-webhook-list-body">
                ${renderWebhookList()}
              </div>
            </div>
            <div class="ov-webhook-config-card ov-webhook-event-card-shell">
              <div class="ov-webhook-config-header">
                <div>
                  <span class="ov-webhook-config-title">触发事件</span>
                  <span class="ov-webhook-config-desc">按事件类型订阅，避免一长串标签挤在一起</span>
                </div>
              </div>
              <div class="ov-webhook-config-body">
                ${renderEventGroups()}
              </div>
            </div>
          </div>

          <div class="ov-webhook-page-right">
            <div class="ov-webhook-record-card">
              <div class="ov-webhook-record-header">
                <div class="ov-webhook-record-title-group">
                  <span class="ov-webhook-record-title">记录中心</span>
                  <span class="ov-webhook-record-count">${recordTab === "notifications" ? `通知 ${adminNotifHistory.length} 条` : `投递 ${webhookDeliveries.length} 条`}</span>
                </div>
                <div class="ov-webhook-record-tools">
                  <div class="ov-webhook-record-tabs" role="tablist" aria-label="通知记录类型">
                    <button class="ov-webhook-record-tab ${recordTab === "deliveries" ? "is-active" : ""}" type="button" data-action="set-webhook-record-tab" data-tab="deliveries" role="tab" aria-selected="${recordTab === "deliveries"}">
                      投递记录
                      <span>${webhookDeliveries.length}</span>
                    </button>
                    <button class="ov-webhook-record-tab ${recordTab === "notifications" ? "is-active" : ""}" type="button" data-action="set-webhook-record-tab" data-tab="notifications" role="tab" aria-selected="${recordTab === "notifications"}">
                      通知历史
                      <span>${adminNotifHistory.length}</span>
                    </button>
                  </div>
                  <button class="btn btn-sm" type="button" data-action="${recordTab === "notifications" ? "refresh-admin-notifications" : "refresh-admin-webhook-deliveries"}">刷新</button>
                </div>
              </div>
              <div class="ov-webhook-record-panels">
                <section class="ov-webhook-record-panel ${recordTab === "deliveries" ? "is-active" : ""}" aria-label="投递记录">
                  <div class="ov-webhook-delivery-body">
                    ${renderDeliveryList()}
                  </div>
                </section>
                <section class="ov-webhook-record-panel ${recordTab === "notifications" ? "is-active" : ""}" aria-label="通知历史">
                  <div class="ov-webhook-notif-filters">
                    <label class="ov-webhook-notif-filter">
                      <span>级别</span>
                      ${components.renderCustomSelect({
                        id: "notification-severity-filter",
                        value: notifFilter.severity || "all",
                        options: [
                          { value: "all", label: "全部" },
                          { value: "info", label: "信息" },
                          { value: "warning", label: "警告" },
                          { value: "error", label: "错误" },
                        ],
                        actionChange: "set-notification-filter",
                        dataKey: "severity",
                        className: "ov-webhook-notif-select",
                      })}
                    </label>
                    <label class="ov-webhook-notif-filter">
                      <span>状态</span>
                      ${components.renderCustomSelect({
                        id: "notification-read-filter",
                        value: notifFilter.read || "all",
                        options: [
                          { value: "all", label: "全部" },
                          { value: "unread", label: "未读" },
                          { value: "read", label: "已读" },
                        ],
                        actionChange: "set-notification-filter",
                        dataKey: "read",
                        className: "ov-webhook-notif-select",
                      })}
                    </label>
                    <label class="ov-webhook-notif-filter ov-webhook-notif-filter-event">
                      <span>事件</span>
                      <input class="input" data-action-change="set-notification-filter" data-key="event" value="${escapeHtml(notifFilter.event || "")}" placeholder="如 zip.ready">
                    </label>
                  </div>
                  <div class="ov-webhook-notif-body">
                    ${renderNotificationHistory()}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return { renderWebhookSection };
}
