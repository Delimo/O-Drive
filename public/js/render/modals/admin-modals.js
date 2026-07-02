export function createAdminModalRenderers({
  icons,
  escapeHtml,
  formatBytes,
  renderFormFeedback,
  renderOptionalFormFeedback,
  renderModalCustomSelect,
}) {
  function renderAddProtectedPathModal(modal) {
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-protected-title" data-stop-close="true">
          <h3 id="add-protected-title" class="modal-title">添加受保护路径</h3>
          <p class="modal-copy">设置需要密码才能访问的文件夹，增强数据安全。</p>
          <form class="modal-form" data-form="add-protected-path">
            <input class="inline-input" name="path" placeholder="路径，例如 /文档/私密" value="${escapeHtml(modal.path || "")}" required>
            <input class="inline-input" type="password" name="password" placeholder="访问密码" value="${escapeHtml(modal.password || "")}" required>
            <input class="inline-input" name="showName" placeholder="显示名称（可选）" value="${escapeHtml(modal.showName || "")}">
            <input class="inline-input" name="note" placeholder="备注说明（可选）" value="${escapeHtml(modal.note || "")}">
            ${renderFormFeedback(modal.error, "设置后，访问该路径需要输入密码。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "创建中..." : "创建"}</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderConfirmDeleteProtectedPathModal(modal) {
    const delPath = modal.path || "";
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-del-protected-title" data-stop-close="true">
          <h3 id="confirm-del-protected-title" class="modal-title">确认删除受保护路径</h3>
          <p class="modal-copy">你确定要删除路径"${escapeHtml(delPath)}"的访问保护吗？</p>
          <div class="attention-item" data-level="warning" style="margin:16px 0;">
            <h3 class="attention-title">此操作可恢复</h3>
            <div class="attention-copy">删除后，该路径将不再需要密码即可访问。如果需要重新保护，可以再次添加。</div>
          </div>
          ${renderOptionalFormFeedback(modal.error, modal.loading ? "正在删除，请稍候..." : "", "margin:12px 0;")}
          <div class="btn-row" style="margin-top:6px;">
            <button class="btn btn-danger" type="button" data-action="execute-delete-protected-path" data-path="${escapeHtml(delPath)}" ${modal.loading ? "disabled" : ""}>
              ${icons.trash}
              <span>${modal.loading ? "删除中..." : "确认删除"}</span>
            </button>
            <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderAddHiddenPathModal(modal) {
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="add-hidden-title" data-stop-close="true">
          <h3 id="add-hidden-title" class="modal-title">添加隐藏路径</h3>
          <p class="modal-copy">被隐藏的路径对游客不可见，但管理员仍可正常访问。</p>
          <form class="modal-form" data-form="add-hidden-path">
            <input class="inline-input" name="path" placeholder="例如 /.env 或 /config" value="${escapeHtml(modal.path || "")}" required>
            ${renderFormFeedback(modal.error, "输入相对于根目录的路径，支持文件和文件夹。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "添加中..." : "添加"}</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderConfirmDeleteHiddenPathModal(modal) {
    const delPath = modal.path || "";
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-del-hidden-title" data-stop-close="true">
          <h3 id="confirm-del-hidden-title" class="modal-title">确认取消隐藏路径</h3>
          <p class="modal-copy">你确定要取消路径"${escapeHtml(delPath)}"的隐藏状态吗？</p>
          <div class="attention-item" data-level="warning" style="margin:16px 0;">
            <h3 class="attention-title">此操作可恢复</h3>
            <div class="attention-copy">取消隐藏后，该路径将对游客重新可见。如果需要再次隐藏，可以重新添加。</div>
          </div>
          ${renderOptionalFormFeedback(modal.error, modal.loading ? "正在删除，请稍候..." : "", "margin:12px 0;")}
          <div class="btn-row" style="margin-top:6px;">
            <button class="btn btn-danger" type="button" data-action="execute-delete-hidden-path" data-path="${escapeHtml(delPath)}" ${modal.loading ? "disabled" : ""}>
              ${icons.trash}
              <span>${modal.loading ? "删除中..." : "确认取消隐藏"}</span>
            </button>
            <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderEditStorageQuotaModal(modal) {
    const quotaBytes = modal.r2QuotaBytes || 0;
    const quotaGB = quotaBytes / (1024 * 1024 * 1024);
    const quotaMB = quotaBytes / (1024 * 1024);
    const formattedQuota = formatBytes(quotaBytes);
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-quota-title" data-stop-close="true" style="width:480px;">
          <h3 id="edit-quota-title" class="modal-title">编辑 R2 存储配额</h3>
          <p class="modal-copy">设置 Cloudflare R2 的总存储容量上限。当前配额：<strong>${formattedQuota}</strong></p>
          <form class="modal-form" data-form="edit-storage-quota">
            <div style="display:flex;gap:8px;align-items:center;">
              <input class="inline-input" name="r2QuotaValue" type="number" min="0" step="any"
                     placeholder="输入数值"
                     value="${quotaGB >= 1 ? quotaGB.toFixed(2) : quotaMB.toFixed(2)}"
                     style="flex:1;">
              <div class="cselect" style="width:80px;flex-shrink:0;" data-cselect="quota-unit">
                <button class="cselect-trigger" type="button" tabindex="0" style="min-height:44px;padding:0 8px;">
                  <span class="cselect-value">${quotaGB >= 1 ? "GB" : "MB"}</span>
                  <svg class="cselect-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <div class="cselect-dropdown">
                  <div class="cselect-option ${quotaGB >= 1 ? "cselect-active" : ""}" data-value="GB">GB</div>
                  <div class="cselect-option ${quotaGB < 1 ? "cselect-active" : ""}" data-value="MB">MB</div>
                </div>
              </div>
              <input type="hidden" name="r2QuotaUnit" value="${quotaGB >= 1 ? "GB" : "MB"}">
            </div>
            ${renderFormFeedback(modal.error, "设置为 0 表示不限制。保存后对所有上传生效。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "保存中..." : "保存"}</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderWebhookModal(modal) {
    const isEdit = modal.type === "edit-webhook";
    const eventOptions = [
      "file.uploaded",
      "file.deleted",
      "file.renamed",
      "file.moved",
      "file.copied",
      "folder.created",
      "trash.restored",
      "admin.login_failure",
      "download.burst",
      "share.created",
      "share.deleted",
    ];
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" data-stop-close="true" style="width:560px;">
          <h3 class="modal-title">${isEdit ? "编辑" : "添加"} Webhook</h3>
          <p class="modal-copy">配置事件通知的投递端点。</p>
          <form class="modal-form" data-form="${isEdit ? "edit" : "add"}-webhook">
            <input class="inline-input" name="name" placeholder="名称" value="${escapeHtml(modal.name || "")}" required>
            <input class="inline-input" name="url" placeholder="Webhook URL" value="${escapeHtml(modal.url || "")}" required>
            <div class="webhook-modal-select-row">
              ${renderModalCustomSelect({
                id: "webhook-msgtype",
                inputName: "msgtype",
                value: modal.msgtype || "json",
                options: ["json", "text", "markdown"].map((value) => ({ value, label: value })),
                className: "webhook-modal-select",
              })}
              ${renderModalCustomSelect({
                id: "webhook-method",
                inputName: "method",
                value: modal.method || "POST",
                options: ["POST", "PUT", "PATCH", "GET", "DELETE"].map((value) => ({ value, label: value })),
                className: "webhook-modal-select",
              })}
            </div>
            <input class="inline-input" name="contentType" placeholder="Content-Type" value="${escapeHtml(modal.contentType || "application/json")}">
            <textarea class="inline-input" name="headers" placeholder="自定义 Headers (JSON)" rows="2" style="resize:vertical;">${escapeHtml(modal.headers || "")}</textarea>
            <textarea class="inline-input" name="body" placeholder="请求体模板（可选）" rows="2" style="resize:vertical;">${escapeHtml(modal.body || "")}</textarea>
            <input class="inline-input" name="events" placeholder="事件类型（逗号分隔）" value="${escapeHtml((modal.events || []).join(", "))}">
            <div style="font-size:12px;color:var(--muted);margin:-4px 0 8px;">可选事件：${eventOptions.join(", ")}</div>
            <label class="check-row"><input type="checkbox" name="enabled" ${modal.enabled !== false ? "checked" : ""}>启用</label>
            ${renderFormFeedback(modal.error, "支持事件变量：{{event}}、{{message}}、{{path}} 等。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "保存中..." : isEdit ? "保存" : "添加"}</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderConfirmDeleteWebhookModal(modal) {
    const whName = modal.name || modal.id || "";
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-del-wh-title" data-stop-close="true">
          <h3 id="confirm-del-wh-title" class="modal-title">确认删除 Webhook</h3>
          <p class="modal-copy">你确定要删除 Webhook"${escapeHtml(whName)}"吗？</p>
          <div class="attention-item" data-level="warning" style="margin:16px 0;">
            <h3 class="attention-title">此操作不可撤销</h3>
            <div class="attention-copy">删除后，该 Webhook 将立即停止投递事件通知。</div>
          </div>
          ${renderOptionalFormFeedback(modal.error, modal.loading ? "正在删除，请稍候..." : "", "margin:12px 0;")}
          <div class="btn-row" style="margin-top:6px;">
            <button class="btn btn-danger" type="button" data-action="execute-delete-webhook" ${modal.loading ? "disabled" : ""}>
              ${icons.trash}
              <span>${modal.loading ? "删除中..." : "确认删除"}</span>
            </button>
            <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderConfirmMaintenanceActionModal(modal) {
    const actionLabel = modal.maintenanceLabel || "此操作";
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-maint-title" data-stop-close="true">
          <h3 id="confirm-maint-title" class="modal-title">确认执行：${escapeHtml(actionLabel)}</h3>
          <p class="modal-copy">你确定要执行维护操作"${escapeHtml(actionLabel)}"吗？</p>
          <div class="attention-item" data-level="warning" style="margin:16px 0;">
            <h3 class="attention-title">此操作可能需要一定时间</h3>
            <div class="attention-copy">执行过程中请勿刷新页面。操作完成后会自动刷新维护快照。</div>
          </div>
          ${renderOptionalFormFeedback(modal.error, modal.loading ? "正在执行，请稍候..." : "", "margin:12px 0;")}
          <div class="btn-row" style="margin-top:6px;">
            <button class="btn btn-danger" type="button" data-action="execute-maintenance-action" ${modal.loading ? "disabled" : ""}>
              <span>${modal.loading ? "执行中..." : "确认执行"}</span>
            </button>
            <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
          </div>
        </div>
      </div>
    `;
  }

  return {
    "add-protected-path": renderAddProtectedPathModal,
    "confirm-delete-protected-path": renderConfirmDeleteProtectedPathModal,
    "add-hidden-path": renderAddHiddenPathModal,
    "confirm-delete-hidden-path": renderConfirmDeleteHiddenPathModal,
    "edit-storage-quota": renderEditStorageQuotaModal,
    "add-webhook": renderWebhookModal,
    "edit-webhook": renderWebhookModal,
    "confirm-delete-webhook": renderConfirmDeleteWebhookModal,
    "confirm-maintenance-action": renderConfirmMaintenanceActionModal,
  };
}
