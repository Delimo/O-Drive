import { escapeHtml } from './utils.js';

function actionAttrs(action = '', args = []) {
  if (!action) return '';
  return ` data-admin-action="${escapeHtml(action)}" data-args='${escapeHtml(JSON.stringify(args))}'`;
}

export function renderAdminEmptyState({
  title = '暂无内容',
  description = '',
  primaryAction = '',
  primaryLabel = '',
  primaryArgs = [],
  secondaryAction = '',
  secondaryLabel = '',
  secondaryArgs = [],
  secondaryHref = '',
  compact = false,
  tone = 'default',
} = {}) {
  const primary = primaryAction && primaryLabel
    ? `<button class="btn btn-primary admin-empty-button"${actionAttrs(primaryAction, primaryArgs)}>${escapeHtml(primaryLabel)}</button>`
    : '';
  const secondary = secondaryAction && secondaryLabel
    ? `<button class="btn admin-empty-button"${actionAttrs(secondaryAction, secondaryArgs)}>${escapeHtml(secondaryLabel)}</button>`
    : secondaryHref && secondaryLabel
      ? `<a class="btn admin-empty-button admin-empty-anchor" href="${escapeHtml(secondaryHref)}">${escapeHtml(secondaryLabel)}</a>`
      : '';
  return `
    <div class="admin-empty-state admin-empty-card ${compact ? 'is-compact' : ''} ${tone === 'loading' ? 'is-loading' : ''}">
      <div class="admin-empty-icon" aria-hidden="true"></div>
      <div class="admin-empty-action">
        <strong>${escapeHtml(title)}</strong>
        ${description ? `<span>${escapeHtml(description)}</span>` : ''}
      </div>
      ${primary || secondary ? `<div class="admin-empty-actions">${primary}${secondary}</div>` : ''}
    </div>
  `;
}

export function renderAdminLoadingState(title = '正在加载...', description = '请稍候') {
  return renderAdminEmptyState({ title, description, compact: true, tone: 'loading' });
}

export function setAdminStatusMessage(target, text = '', tone = 'muted') {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-hidden', !text);
  el.classList.toggle('is-visible', Boolean(text));
  el.classList.toggle('is-loading', tone === 'loading');
  el.classList.toggle('is-error', tone === 'error');
  el.classList.toggle('is-success', tone === 'success');
  el.classList.toggle('is-muted', tone === 'muted');
}

export function setAdminButtonBusy(button, busy, loadingText = '处理中...') {
  if (!button) return;
  if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent.trim();
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
  button.textContent = busy ? loadingText : (button.dataset.idleLabel || button.textContent);
}

export function buttonByAction(action, activeElement = document.activeElement) {
  if (activeElement?.dataset?.adminAction === action) return activeElement;
  return document.querySelector(`[data-admin-action="${action}"]`);
}
