import { AdminActions, getInitialAdminTab } from './admin-actions.js';
import { api } from './api.js';

window.AdminActions = AdminActions;

function readArgs(el) {
  const raw = el.dataset.args || '[]';
  try {
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-admin-action]');
  if (!target) return;
  event.preventDefault();
  const action = target.dataset.adminAction;
  const args = readArgs(target);
  switch (action) {
    case 'switch-tab': return AdminActions.switchTab(args[0]);
    case 'change-page': return AdminActions.changePage(Number(args[0] || 0));
    case 'apply-log-filters': return AdminActions.applyLogFilters();
    case 'reset-log-filters': return AdminActions.resetLogFilters();
    case 'add-hidden': return AdminActions.saveAccessRule();
    case 'remove-hidden': return AdminActions.removeHidden(args[0]);
    case 'add-protected': return AdminActions.saveAccessRule();
    case 'set-access-preset': return AdminActions.setAccessPreset(args[0]);
    case 'focus-access-editor': return AdminActions.focusAccessEditor();
    case 'save-access-rule': return AdminActions.saveAccessRule();
    case 'refresh-access-rules': return AdminActions.loadAccessRules();
    case 'remove-protected': return AdminActions.removeProtected(args[0]);
    case 'refresh-health': return Promise.all([AdminActions.loadHealth(), AdminActions.loadMaintenance()]);
    case 'refresh-maintenance': return AdminActions.loadMaintenance();
    case 'maintenance-action': return AdminActions.runMaintenanceAction(args[0]);
    case 'set-quota': return AdminActions.setQuota();
    case 'switch-storage-view': return AdminActions.switchStorageView(args[0]);
    case 'new-storage-space': return AdminActions.newStorageSpace();
    case 'focus-storage-binding': return AdminActions.focusStorageBinding();
    case 'edit-storage-space': return AdminActions.editStorageSpace(args[0]);
    case 'toggle-storage-secret': return AdminActions.toggleStorageSecret();
    case 'add-storage-space': return AdminActions.addStorageSpace();
    case 'test-storage-space': return AdminActions.testStorageSpace(args[0] || '');
    case 'save-storage-policy': return AdminActions.saveStoragePolicy();
    case 'remove-storage-space': return AdminActions.removeStorageSpace(args[0]);
    case 'add-storage-binding': return AdminActions.addStorageBinding();
    case 'remove-storage-binding': return AdminActions.removeStorageBinding(args[0]);
    case 'refresh-shares': return AdminActions.loadShares();
    case 'apply-share-filters': return AdminActions.applyShareFilters();
    case 'reset-share-filters': return AdminActions.resetShareFilters();
    case 'copy-share': return AdminActions.copyShare(args[0]);
    case 'delete-share': return AdminActions.deleteShare(args[0]);
    case 'cleanup-shares': return AdminActions.cleanupShares();
    case 'add-webhook': return AdminActions.addWebhook();
    case 'focus-webhook-editor': return AdminActions.focusWebhookEditor();
    case 'edit-webhook': return AdminActions.editWebhook(Number(args[0] || 0));
    case 'remove-webhook': return AdminActions.removeWebhook(Number(args[0] || 0));
    case 'test-webhook': return AdminActions.testWebhook(Number(args[0] || 0));
    case 'refresh-webhooks': return AdminActions.loadWebhooks();
    case 'refresh-webhook-deliveries': return AdminActions.loadWebhookDeliveries();
    case 'refresh-tasks': return AdminActions.loadTasks();
  }
});

document.querySelector('.tab-shell')?.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll('.admin-tab-btn')];
  const currentIndex = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
  let nextIndex = currentIndex < 0 ? 0 : currentIndex;
  if (event.key === 'ArrowRight') nextIndex = (nextIndex + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (nextIndex - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  const next = tabs[nextIndex];
  const targetTab = next?.dataset.args ? JSON.parse(next.dataset.args || '[]')[0] : '';
  if (!targetTab) return;
  event.preventDefault();
  next.focus();
  AdminActions.switchTab(targetTab);
});

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-submit-action]');
  if (!form) return;
  event.preventDefault();
  switch (form.dataset.submitAction) {
    case 'add-hidden':
    case 'add-protected':
    case 'save-access-rule':
      return AdminActions.saveAccessRule();
  }
});

const startYear = 2026;
const currentYear = new Date().getFullYear();
const yearDisp = document.getElementById('year-display');
if (yearDisp) yearDisp.textContent = currentYear > startYear ? `${startYear} - ${currentYear}` : startYear;

await api.getRole();
AdminActions.switchTab(getInitialAdminTab(), { persist: false });

setInterval(() => {
  if (document.body.dataset.adminTab === 'overview') AdminActions.loadTasks();
}, 3000);

window.addEventListener('hashchange', () => {
  AdminActions.switchTab(getInitialAdminTab(), { persist: false });
});
