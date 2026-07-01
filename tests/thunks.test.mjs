import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore, combineReducers } from '../public/js/state/create-slice.js';
import { adminInitialState, createAdminSlice } from '../public/js/state/slices/admin-slice.js';
import { appInitialState, createAppSlice } from '../public/js/state/slices/app-slice.js';
import { createAdminThunks } from '../public/js/state/thunks/admin.js';
import { createMaintenanceThunks } from '../public/js/state/thunks/maintenance.js';

function createThunkHarness(extraDeps = {}, extraContext = {}) {
  const admin = createAdminSlice(adminInitialState);
  const app = createAppSlice(appInitialState);
  const store = createStore(
    combineReducers({
      admin: admin.reducer,
      app: app.reducer,
    }),
    {
      admin: adminInitialState,
      app: { ...appInitialState, page: 'admin' },
    },
  );

  const deps = {
    actions: {
      admin: admin.actions,
      app: app.actions,
    },
    dispatchToast() {},
    humanError(_response, data, fallback) {
      return data?.message || fallback;
    },
    getPage: () => 'admin',
    ...extraDeps,
  };
  const context = {
    mock: false,
    getThunks: () => ({}),
    ...extraContext,
  };

  return { store, deps, context };
}

test('admin thunk stores API failure messages from unified assertions', async () => {
  const { store, deps, context } = createThunkHarness({
    adminApi: {
      async quota() {
        return {
          response: { ok: false, status: 500 },
          data: { message: '配额接口异常' },
        };
      },
    },
  });
  const thunks = createAdminThunks(deps, context);

  await store.dispatch(thunks.loadAdminQuota());

  assert.equal(store.getState().admin.quotaLoading, false);
  assert.equal(store.getState().admin.quotaError, '配额接口异常');
  assert.equal(store.getState().admin.quota, null);
});

test('admin webhook test keeps business failure details for toast output', async () => {
  const toasts = [];
  const { store, deps, context } = createThunkHarness({
    adminApi: {
      async testWebhook() {
        return {
          response: { ok: true, status: 200 },
          data: { success: false, message: '投递失败' },
        };
      },
    },
    dispatchToast(type, message) {
      toasts.push({ type, message });
    },
  });
  const thunks = createAdminThunks(deps, context);

  await store.dispatch(thunks.testAdminWebhook('https://example.com/webhook'));

  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].type, 'error');
  assert.match(toasts[0].message, /投递失败/);
});

test('maintenance thunk reports unified API errors and clears busy action', async () => {
  const toasts = [];
  const { store, deps, context } = createThunkHarness({
    maintenanceApi: {
      async executeAction() {
        return {
          response: { ok: true, status: 200 },
          data: { success: false, message: '维护执行失败' },
        };
      },
    },
    dispatchToast(type, message) {
      toasts.push({ type, message });
    },
  });
  const thunks = createMaintenanceThunks(deps, context);

  await store.dispatch(thunks.executeMaintenanceAction('rebuild-index'));

  assert.equal(store.getState().admin.maintenanceBusyAction, '');
  assert.deepEqual(toasts, [{ type: 'error', message: '维护执行失败' }]);
});
