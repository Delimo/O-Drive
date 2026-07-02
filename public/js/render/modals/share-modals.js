export function createShareModalRenderers({
  icons,
  escapeHtml,
  getEntryPath,
  renderFormFeedback,
  renderOptionalFormFeedback,
}) {
  function renderShareModal(modal) {
    const values = modal.values || {};
    const entries = Array.isArray(modal.entries) && modal.entries.length
      ? modal.entries
      : modal.entry
        ? [modal.entry]
        : [];
    const isBundleShare = modal.targetType === "bundle" || entries.length > 1;
    const isFolderShare =
      !isBundleShare && (modal.targetType === "folder" || modal.entry?.kind === "folder");
    const targetLabel = isBundleShare ? `${entries.length} 项内容` : isFolderShare ? "文件夹" : "文件";
    const titleLabel = isBundleShare ? "批量分享" : `分享${targetLabel}`;
    const downloadLabel = isBundleShare
      ? "允许下载集合 ZIP 和单项文件"
      : isFolderShare ? "允许下载文件夹 ZIP" : "允许下载文件";
    const previewLabel = isBundleShare
      ? "允许浏览文件夹与预览单个文件"
      : isFolderShare ? "允许浏览文件夹内容" : "允许在线预览";
    const entryNames = entries.slice(0, 4).map((entry) => entry?.name || getEntryPath(entry)).filter(Boolean);
    const extraCount = Math.max(0, entries.length - entryNames.length);
    const targetCopy = isBundleShare
      ? `你正在为 ${entries.length} 个项目生成一个对外分享地址，包含文件和文件夹时会以集合方式展示。`
      : `你正在为${targetLabel}「${escapeHtml(modal.entry?.name || `当前${targetLabel}`)}」生成对外分享地址，可控制有效期、下载次数与访问密码。`;
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="share-title" data-stop-close="true">
          <h3 id="share-title" class="modal-title">${escapeHtml(titleLabel)}</h3>
          <p class="modal-copy">${targetCopy}</p>
          ${isBundleShare ? `<div class="helper-text">已选：${entryNames.map((name) => escapeHtml(name)).join("、")}${extraCount ? ` 等 ${entries.length} 项` : ""}</div>` : ""}
          <form class="modal-form" data-form="share">
            <div class="form-grid">
              <input class="inline-input" name="expiresInDays" type="number" min="0" max="3650" placeholder="有效期天数" value="${escapeHtml(values.expiresInDays || "7")}">
              <input class="inline-input" name="maxDownloads" type="number" min="0" max="1000000" placeholder="最大下载次数，0 为不限" value="${escapeHtml(values.maxDownloads || "0")}">
              <input class="inline-input" name="password" type="text" placeholder="访问密码，可留空" value="${escapeHtml(values.password || "")}">
              <label class="check-row"><input type="checkbox" name="allowPreview" ${values.allowPreview !== false ? "checked" : ""}>${previewLabel}</label>
              <label class="check-row"><input type="checkbox" name="allowDownload" ${values.allowDownload !== false ? "checked" : ""}>${downloadLabel}</label>
            </div>
            ${renderFormFeedback(modal.error, "创建成功后会自动复制分享链接到剪贴板。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit">生成分享</button>
              <button class="btn" type="button" data-action="close-modal">取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderReactivateShareModal(modal) {
    const values = modal.values || {};
    const shareName = modal.shareName || "此分享";
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="reactivate-share-title" data-stop-close="true">
          <h3 id="reactivate-share-title" class="modal-title">重新启用分享</h3>
          <p class="modal-copy">为"${escapeHtml(shareName)}"设置新的有效期。原链接、密码和访问权限会继续保留。</p>
          <form class="modal-form" data-form="reactivate-share">
            <input class="inline-input" name="expiresInDays" type="number" min="0" max="3650" placeholder="有效期天数，0 为长期有效" value="${escapeHtml(values.expiresInDays || "7")}">
            ${renderFormFeedback(modal.error, "仅能重新启用仍在 7 天保留期内、且尚未被清理的过期分享。")}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-primary" type="submit" ${modal.loading ? "disabled" : ""}>${modal.loading ? "启用中..." : "重新启用"}</button>
              <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderConfirmDeleteShareModal(modal) {
    const shareName = modal.shareName || "此分享";
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title" data-stop-close="true">
          <h3 id="confirm-delete-title" class="modal-title">确认删除分享</h3>
          <p class="modal-copy">你确定要删除分享"${escapeHtml(shareName)}"吗？</p>
          <div class="attention-item" data-level="warning" style="margin:16px 0;">
            <h3 class="attention-title">此操作不可撤销</h3>
            <div class="attention-copy">删除后，分享链接将立即失效，所有访问者将无法再通过此链接访问文件。</div>
          </div>
          ${renderOptionalFormFeedback(modal.error, modal.loading ? "正在删除分享，请稍候..." : "", "margin:12px 0;")}
          <div class="btn-row" style="margin-top:6px;">
            <button class="btn btn-danger" type="button" data-action="execute-delete-share" data-key="${escapeHtml(modal.token || "")}" ${modal.loading ? "disabled" : ""}>
              ${icons.trash}
              <span>${modal.loading ? "删除中..." : "确认删除"}</span>
            </button>
            <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderConfirmCleanupExpiredModal(modal) {
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-cleanup-title" data-stop-close="true">
          <h3 id="confirm-cleanup-title" class="modal-title">清理过期分享</h3>
          <p class="modal-copy">你确定要清理所有已过期的分享记录吗？</p>
          <div class="attention-item" data-level="warning" style="margin:16px 0;">
            <h3 class="attention-title">此操作不可撤销</h3>
            <div class="attention-copy">清理后，所有已过期的分享记录将被永久删除，相关链接将立即失效。</div>
          </div>
          ${renderOptionalFormFeedback(modal.error, modal.loading ? "正在清理过期分享，请稍候..." : "", "margin:12px 0;")}
          <div class="btn-row" style="margin-top:6px;">
            <button class="btn btn-danger" type="button" data-action="execute-cleanup-expired-shares" ${modal.loading ? "disabled" : ""}>
              <span>${modal.loading ? "清理中..." : "确认清理"}</span>
            </button>
            <button class="btn" type="button" data-action="close-modal" ${modal.loading ? "disabled" : ""}>取消</button>
          </div>
        </div>
      </div>
    `;
  }

  return {
    share: renderShareModal,
    "reactivate-share": renderReactivateShareModal,
    "confirm-delete-share": renderConfirmDeleteShareModal,
    "confirm-cleanup-expired": renderConfirmCleanupExpiredModal,
  };
}
