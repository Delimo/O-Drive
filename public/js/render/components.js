export function createUiComponents({ escapeHtml }) {
  function renderEmptyState(title, copy, icon, compact = false, extraHtml = "") {
    return `
      <div class="${compact ? "empty-state-compact" : "empty-state"}">
        <div>
          ${icon ? `<div class="empty-orb">${icon}</div>` : ""}
          ${title ? `<h3 class="empty-title">${escapeHtml(title)}</h3>` : ""}
          <p class="empty-copy">${escapeHtml(copy)}</p>
          ${extraHtml}
        </div>
      </div>
    `;
  }

  function renderDetailRow({
    label,
    value = "",
    valueHtml = "",
    noteHtml = "",
    className = "",
    valueClassName = "",
    title = "",
  }) {
    const safeValue = valueHtml || escapeHtml(value || "");
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `
      <div class="details-row${className ? ` ${className}` : ""}">
        <div class="details-row-label">${escapeHtml(label)}</div>
        <div class="details-row-value${valueClassName ? ` ${valueClassName}` : ""}"${titleAttr}>${safeValue}${noteHtml}</div>
      </div>
    `;
  }

  function renderFormFeedback(error, helperText, style = "") {
    const styleAttr = style ? ` style="${escapeHtml(style)}"` : "";
    return error
      ? `<div class="error-text"${styleAttr}>${escapeHtml(error)}</div>`
      : `<div class="helper-text"${styleAttr}>${escapeHtml(helperText || "")}</div>`;
  }

  return {
    renderEmptyState,
    renderDetailRow,
    renderFormFeedback,
  };
}
