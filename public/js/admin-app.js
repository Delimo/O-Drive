import { adminState } from './admin-state.js';
import { AdminActions } from './admin-actions.js';
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
  const action = target.dataset.adminAction;
  const args = readArgs(target);
  switch (action) {
    case 'switch-tab': return AdminActions.switchTab(args[0]);
    case 'change-page': return AdminActions.changePage(Number(args[0] || 0));
    case 'add-hidden': return AdminActions.addHidden();
    case 'remove-hidden': return AdminActions.removeHidden(args[0]);
    case 'add-protected': return AdminActions.addProtected();
    case 'remove-protected': return AdminActions.removeProtected(args[0]);
    case 'refresh-health': return AdminActions.loadHealth();
    case 'refresh-maintenance': return AdminActions.loadMaintenance();
    case 'maintenance-action': return AdminActions.runMaintenanceAction(args[0]);
    case 'set-quota': return AdminActions.setQuota();
    case 'fill-quota': return AdminActions.fillQuota(Number(args[0] || 0));
    case 'add-webhook': return AdminActions.addWebhook();
    case 'edit-webhook': return AdminActions.editWebhook(Number(args[0] || 0));
    case 'remove-webhook': return AdminActions.removeWebhook(Number(args[0] || 0));
    case 'test-webhook': return AdminActions.testWebhook(Number(args[0] || 0));
    case 'refresh-webhooks': return AdminActions.loadWebhooks();
  }
});

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-submit-action]');
  if (!form) return;
  event.preventDefault();
  switch (form.dataset.submitAction) {
    case 'add-hidden': return AdminActions.addHidden();
    case 'add-protected': return AdminActions.addProtected();
  }
});

const startYear = 2026;
const currentYear = new Date().getFullYear();
const yearDisp = document.getElementById('year-display');
if (yearDisp) yearDisp.textContent = currentYear > startYear ? `${startYear} - ${currentYear}` : startYear;

await api.getRole();
AdminActions.loadStats();
