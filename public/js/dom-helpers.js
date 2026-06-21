import { escapeHtml } from './utils.js';

export function actionArgs(value) {
  return escapeHtml(JSON.stringify(value));
}

export function setHtml(idOrElement, html) {
  const el = typeof idOrElement === 'string' ? document.getElementById(idOrElement) : idOrElement;
  if (el) el.innerHTML = html;
  return el;
}

export function clearElement(idOrElement) {
  const el = typeof idOrElement === 'string' ? document.getElementById(idOrElement) : idOrElement;
  if (el) el.replaceChildren();
  return el;
}
