export function createAdminComponents({ icons, escapeHtml }) {
  function renderEmptyCard({ icon, title, description, action }) {
    const actionHtml = action
      ? `<div class="mt-3"><button class="btn toolbar-btn" type="button" data-action="${escapeHtml(action.action)}">${icon || icons.lock}<span>${escapeHtml(action.label)}</span></button></div>`
      : "";

    return `
      <div class="empty-state">
        <div class="empty-orb">${icon || icons.lock}</div>
        <p class="empty-copy">${escapeHtml(description || "")}</p>
        ${actionHtml}
      </div>
    `;
  }

  function renderLoadingCard({ icon, title, description }) {
    return `
      <div class="empty-state-compact">
        <div class="empty-orb">${icon || icons.loading}</div>
        <h3 class="empty-title">${escapeHtml(title || "加载中")}</h3>
        <p class="empty-copy">${escapeHtml(description || "")}</p>
      </div>
    `;
  }

  function renderErrorCard({ icon, error, onRetry }) {
    const retryHtml = onRetry
      ? `<div class="mt-3"><button class="btn toolbar-btn" type="button" data-action="${escapeHtml(onRetry)}">${icons.refresh}<span>重新加载</span></button></div>`
      : "";

    return `
      <div class="empty-state">
        <div class="empty-orb">${icon || icons.lock}</div>
        <p class="empty-copy">${escapeHtml(error)}</p>
        ${retryHtml}
      </div>
    `;
  }

  function renderSectionCard({ title, description, actions, content }) {
    const actionsHtml = actions
      ? `<div class="btn-row">${actions}</div>`
      : "";

    return `
      <div class="admin-card">
        <div class="section-header">
          <div>
            <h3 class="section-title">${escapeHtml(title)}</h3>
            ${description ? `<p class="section-desc">${escapeHtml(description)}</p>` : ""}
          </div>
          ${actionsHtml}
        </div>
        <div class="section-content">
          ${content}
        </div>
      </div>
    `;
  }

  function renderRefreshButton(action) {
    return `
      <button class="btn toolbar-btn" type="button" data-action="${escapeHtml(action)}">
        ${icons.refresh}<span>刷新</span>
      </button>
    `;
  }

  function renderStatusTag({ label, type }) {
    const typeClass = type ? `tag-${type}` : "";
    return `<span class="toolbar-tag ${typeClass}">${escapeHtml(label)}</span>`;
  }

  return {
    renderEmptyCard,
    renderLoadingCard,
    renderErrorCard,
    renderSectionCard,
    renderRefreshButton,
    renderStatusTag,
  };
}
