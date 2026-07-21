export function createModalCustomSelectRenderer({ escapeHtml }) {
  return function renderModalCustomSelect({
    id,
    inputName = "",
    value,
    options,
    className = "",
    actionChange = "",
    dataKey = "",
  }) {
    const selected = options.find((option) => option.value === value) || options[0];
    const hiddenInput = inputName
      ? `<input type="hidden" name="${escapeHtml(inputName)}" value="${escapeHtml(selected?.value || "")}">`
      : "";
    const inputNameAttr = inputName ? ` data-input-name="${escapeHtml(inputName)}"` : "";
    return `
      ${hiddenInput}
      <div class="cselect modal-cselect ${className}" data-cselect="${escapeHtml(id)}"${inputNameAttr}
           data-action-change="${escapeHtml(actionChange || "")}"
           data-key="${escapeHtml(dataKey || "")}"
           data-value="${escapeHtml(selected?.value || "")}">
        <button class="cselect-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${escapeHtml(id)}-listbox">
          <span class="cselect-value">${escapeHtml(selected?.label || "")}</span>
          <svg class="cselect-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div class="cselect-dropdown" id="${escapeHtml(id)}-listbox" role="listbox">
          ${options.map((option) => `
            <div class="cselect-option ${option.value === selected?.value ? "cselect-active" : ""}" data-value="${escapeHtml(option.value)}" role="option" aria-selected="${option.value === selected?.value}" tabindex="-1">
              ${escapeHtml(option.label)}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  };
}
