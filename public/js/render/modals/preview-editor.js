export function createPreviewModalRenderers({
  icons,
  escapeHtml,
  getEntryPath,
  apiClient,
  renderMarkdown,
  isMarkdownName,
}) {
  function renderPreviewModalBody(modal) {
    if (modal.loading)
      return `<div class="empty-state"><div><div class="empty-orb">${icons.spinner}</div><h3 class="empty-title">正在准备预览</h3><p class="empty-copy">正在读取文件内容，请稍候。</p></div></div>`;
    if (modal.error)
      return `<div class="empty-state"><div><div class="empty-orb">${icons.lock}</div><h3 class="empty-title">预览失败</h3><p class="empty-copy">${escapeHtml(modal.error)}</p></div></div>`;
    const previewUrl = apiClient.previewUrl(getEntryPath(modal.entry));
    if (modal.contentMode === "image")
      return `<div class="preview-media-shell"><img src="${previewUrl}" alt="${escapeHtml(modal.entry?.name || "")}"></div>`;
    if (modal.contentMode === "video")
      return `<div class="preview-media-shell"><video src="${previewUrl}" controls autoplay playsinline></video></div>`;
    if (modal.contentMode === "audio")
      return `<div class="preview-media-shell"><audio src="${previewUrl}" controls autoplay style="width:min(560px,100%);"></audio></div>`;
    if (modal.contentMode === "pdf")
      return `<div class="preview-media-shell"><iframe src="${previewUrl}" title="${escapeHtml(modal.entry?.name || "")}"></iframe></div>`;
    if (modal.editing)
      return `<textarea class="preview-editor" id="preview-edit-area">${escapeHtml(modal.draftContent ?? modal.content ?? "")}</textarea>`;
    if (isMarkdownName(modal.entry?.name) && !modal.showRaw) {
      return `<div class="markdown-body">${renderMarkdown(modal.content || "")}</div>`;
    }
    return `<pre class="preview-text">${escapeHtml(modal.content || "")}</pre>`;
  }

  function renderPreviewModal(modal) {
    const showMarkdownToggle =
      isMarkdownName(modal.entry?.name) &&
      modal.contentMode === "text" &&
      !modal.loading &&
      !modal.error &&
      !modal.editing;
    return `
      <div class="modal-wrap" data-action="close-modal-backdrop">
        <div class="modal-card preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" data-stop-close="true">
          <div class="modal-header">
            <div class="modal-header-title">
              <h3 id="preview-title" class="modal-title">${escapeHtml(modal.entry?.name || "在线预览")}</h3>
              <p class="modal-copy">${escapeHtml(getEntryPath(modal.entry) || "")}</p>
            </div>
            <div class="modal-header-actions btn-row">
              ${modal.editable && modal.editing ? `<span class="preview-edit-meta" data-dirty="${modal.dirty ? "true" : "false"}">${modal.dirty ? "● 未保存" : "已是最新"}</span>` : ""}
              ${showMarkdownToggle ? `<button class="btn" data-action="toggle-markdown-raw">${modal.showRaw ? "渲染视图" : "查看原文"}</button>` : ""}
              ${modal.editable ? `<button class="btn" data-action="toggle-preview-edit">${modal.editing ? "退出编辑" : "编辑文本"}</button>` : ""}
              ${modal.editable && modal.editing ? `<button class="btn btn-primary" data-action="save-preview-edit"><span class="icon">${icons.save}</span>保存</button>` : ""}
              <button class="btn" data-action="close-modal"><span class="icon">${icons.close}</span>关闭</button>
            </div>
          </div>
          <div class="preview-modal-body">
            ${renderPreviewModalBody(modal)}
          </div>
        </div>
      </div>
    `;
  }

  return {
    renderPreviewModal,
    renderPreviewModalBody,
  };
}
