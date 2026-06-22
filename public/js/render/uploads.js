export function createUploadsRenderer(deps) {
  const { icons, escapeHtml } = deps;

  function statusLabel(item) {
    if (item.status === "success") return "已完成";
    if (item.status === "error") return item.error || "上传失败";
    if (item.status === "cancelled") return "已取消";
    if (item.status === "cancelling") return "取消中...";
    if (item.status === "paused") return "已暂停";
    if (item.status === "uploading") return `${item.progress || 0}%`;
    return "排队中";
  }

  function renderUploadsPanel(state) {
    const items = state.uploads.items;
    if (!items.length) return "";

    const active = items.filter(
      (i) =>
        i.status === "pending" ||
        i.status === "uploading" ||
        i.status === "cancelling",
    ).length;
    const done = items.filter((i) => i.status === "success").length;
    const failed = items.filter((i) => i.status === "error").length;
    const cancelled = items.filter((i) => i.status === "cancelled").length;

    const title = active
      ? `正在上传 ${active} 个文件`
      : failed || cancelled
        ? `上传完成：成功 ${done} 个，失败 ${failed} 个${cancelled ? `，已取消 ${cancelled} 个` : ""}`
        : `上传完成：${done} 个文件`;

    return `
      <div class="upload-panel">
        <div class="upload-panel-head">
          <span class="upload-panel-title">${escapeHtml(title)}</span>
          <div class="upload-panel-tools">
            ${active ? "" : `<button class="upload-panel-btn" data-action="clear-finished-uploads" type="button">清除已完成</button>`}
            <button class="upload-panel-close" data-action="dismiss-uploads" type="button" aria-label="关闭上传面板">×</button>
          </div>
        </div>
        <div class="upload-panel-body">
          ${items
            .map(
              (item) => `
            <div class="upload-row" data-status="${escapeHtml(item.status)}">
              <div class="upload-row-icon">${item.status === "error" ? icons.lock : item.status === "success" ? icons.check : item.status === "cancelled" ? icons.close : icons.file}</div>
              <div class="upload-row-main">
                <div class="upload-row-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}${item.multipart ? '<span class="toolbar-tag" style="font-size:11px;">分片</span>' : ""}</div>
                <div class="upload-row-track">
                  <div class="upload-row-bar" style="width:${item.status === "success" ? 100 : item.progress || 0}%"></div>
                </div>
              </div>
              <div class="upload-row-status">${escapeHtml(statusLabel(item))}</div>
              <div class="upload-row-actions" style="display:flex;gap:4px;">
                ${
                  item.status === "uploading" || item.status === "pending"
                    ? `<button class="upload-row-btn" data-action="pause-upload" data-id="${escapeHtml(item.id)}" type="button" title="暂停">${icons.pause}</button><button class="upload-row-btn" data-action="cancel-upload" data-id="${escapeHtml(item.id)}" type="button" title="取消">${icons.close}</button>`
                    : ""
                }
                ${
                  item.status === "paused"
                    ? `<button class="upload-row-btn" data-action="resume-upload" data-id="${escapeHtml(item.id)}" type="button" title="继续">${icons.play}</button><button class="upload-row-btn" data-action="cancel-upload" data-id="${escapeHtml(item.id)}" type="button" title="取消">${icons.close}</button>`
                    : ""
                }
                ${
                  item.status === "cancelled"
                    ? `<button class="upload-row-btn" data-action="retry-upload" data-id="${escapeHtml(item.id)}" type="button" title="重试">${icons.refresh}</button><button class="upload-row-remove" data-action="dismiss-upload" data-key="${escapeHtml(item.id)}" type="button" aria-label="移除">×</button>`
                    : ""
                }
                ${
                  item.status === "error"
                    ? `<button class="upload-row-btn" data-action="retry-upload" data-id="${escapeHtml(item.id)}" type="button" title="重试">${icons.refresh}</button><button class="upload-row-remove" data-action="dismiss-upload" data-key="${escapeHtml(item.id)}" type="button" aria-label="移除">×</button>`
                    : ""
                }
                ${
                  item.status === "success"
                    ? `<button class="upload-row-remove" data-action="dismiss-upload" data-key="${escapeHtml(item.id)}" type="button" aria-label="移除">×</button>`
                    : ""
                }
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  return {
    renderUploadsPanel,
  };
}
