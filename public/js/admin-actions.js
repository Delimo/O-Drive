import { adminState } from './admin-state.js';
import { createAdminAccessActions } from './admin-access-actions.js';
import { createAdminLogActions } from './admin-log-actions.js';
import { createAdminOverviewActions } from './admin-overview-actions.js';
import { createAdminShareActions } from './admin-share-actions.js';
import { createAdminStorageActions } from './admin-storage-actions.js';
import { createAdminWebhookActions } from './admin-webhook-actions.js';
import { createAdminTaskActions } from './admin-task-actions.js';
import { createAdminHealthActions } from './admin-health-actions.js';
export const ADMIN_TABS = ['overview', 'health', 'logs', 'access', 'quota', 'shares', 'webhooks'];

export function getInitialAdminTab() {
  const tab = (window.location.hash || '').replace(/^#/, '');
  if (tab === 'privacy' || tab === 'protected') return 'access';
  return ADMIN_TABS.includes(tab) ? tab : 'overview';
}

function adminConfirm(title, body = '') {
  if (typeof window.showConfirm === 'function') return window.showConfirm(title, body);
  return Promise.resolve(confirm([title, body].filter(Boolean).join('\n\n')));
}

function removeLegacyQuotaShortcuts() {
  document.querySelectorAll('[data-admin-action="fill-quota"]').forEach(button => {
    const group = button.closest('.quota-preset-grid');
    if (group) group.remove();
    else button.remove();
  });
  document.querySelectorAll('.quota-preset-grid').forEach(group => group.remove());
}

export const AdminActions = {
  switchTab(id, options = {}) {
    removeLegacyQuotaShortcuts();
    const tabId = ADMIN_TABS.includes(id) ? id : 'overview';
    ADMIN_TABS.forEach(tab => {
      document.getElementById(`${tab}-tab`)?.classList.toggle('hidden', tabId !== tab);
      const button = document.getElementById(`btn-${tab}`);
      button?.classList.toggle('is-active', tabId === tab);
      button?.setAttribute('aria-selected', tabId === tab ? 'true' : 'false');
    });
    adminState.activeTab = tabId;
    document.body.dataset.adminTab = tabId;
    if (options.persist !== false && window.location.hash !== `#${tabId}`) {
      history.replaceState(null, '', `#${tabId}`);
    }

    if (tabId === 'overview') return Promise.all([this.loadStats(), this.loadTasks()]);
    if (tabId === 'health') return Promise.all([this.loadHealth(), this.loadMaintenance()]);
    if (tabId === 'logs') return this.loadLogs();
    if (tabId === 'access') return this.loadAccessRules();
    if (tabId === 'quota') {
      this.switchStorageView(adminState.storageView || 's3');
      return Promise.all([this.loadQuota(), this.loadStorage()]);
    }
    if (tabId === 'shares') return this.loadShares();
    if (tabId === 'webhooks') return Promise.all([this.loadWebhooks(), this.loadWebhookDeliveries()]);
    return this.loadStats();
  },

};

Object.assign(AdminActions, createAdminLogActions());
Object.assign(AdminActions, createAdminAccessActions({ adminConfirm }));
Object.assign(AdminActions, createAdminOverviewActions());
Object.assign(AdminActions, createAdminShareActions({ adminConfirm }));
Object.assign(AdminActions, createAdminStorageActions({ adminConfirm }));
Object.assign(AdminActions, createAdminWebhookActions({ adminConfirm }));
Object.assign(AdminActions, createAdminTaskActions());
Object.assign(AdminActions, createAdminHealthActions({ adminConfirm }));
