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

test('storage tab loads access control rule data', async () => {
  const calls = [];
  const tabThunks = {
    loadAdminStorageConfig: () => {
      calls.push('storage-config');
      return { type: 'noop/storage-config' };
    },
    loadTrashRetention: () => {
      calls.push('trash-retention');
      return { type: 'noop/trash-retention' };
    },
    loadAdminTrashPreview: () => {
      calls.push('trash-preview');
      return { type: 'noop/trash-preview' };
    },
    loadAdminProtectedPaths: () => {
      calls.push('protected-paths');
      return { type: 'noop/protected-paths' };
    },
    loadAdminHiddenPaths: () => {
      calls.push('hidden-paths');
      return { type: 'noop/hidden-paths' };
    },
  };
  const { store, deps, context } = createThunkHarness({}, {
    getThunks: () => tabThunks,
  });
  const thunks = createAdminThunks(deps, context);

  await store.dispatch(thunks.loadTabData('storage'));

  assert.deepEqual(calls, [
    'storage-config',
    'trash-retention',
    'trash-preview',
    'protected-paths',
    'hidden-paths',
  ]);
});

test('saveAccessRule creates hidden and protected rules from inline draft', async () => {
  const calls = [];
  const toasts = [];
  let thunks;
  const { store, deps, context } = createThunkHarness({
    adminApi: {
      async createHiddenPath(targetPath) {
        calls.push(['create-hidden', targetPath]);
        return { response: { ok: true, status: 200 }, data: { success: true } };
      },
      async createProtectedPath(path, password, note, showName) {
        calls.push(['create-protected', path, password, note, showName]);
        return { response: { ok: true, status: 200 }, data: { success: true } };
      },
      async hiddenPaths() {
        calls.push(['load-hidden']);
        return { response: { ok: true, status: 200 }, data: { list: ['/secret'] } };
      },
      async protectedPaths() {
        calls.push(['load-protected']);
        return {
          response: { ok: true, status: 200 },
          data: { list: [{ path: '/secret', note: 'private', showName: false }] },
        };
      },
    },
    dispatchToast(type, message) {
      toasts.push({ type, message });
    },
  }, {
    getThunks: () => thunks,
  });
  thunks = createAdminThunks(deps, context);
  store.dispatch(deps.actions.admin.setAccessRuleDraft({
    path: '/secret',
    hidden: true,
    showName: false,
    password: 'abcd',
    note: 'private',
  }));

  await store.dispatch(thunks.saveAccessRule());

  assert.deepEqual(calls, [
    ['create-hidden', '/secret'],
    ['create-protected', '/secret', 'abcd', 'private', false],
    ['load-hidden'],
    ['load-protected'],
  ]);
  assert.deepEqual(toasts, [{ type: 'success', message: '访问控制规则已保存' }]);
  assert.equal(store.getState().admin.accessRuleSaving, false);
  assert.deepEqual(store.getState().admin.accessRuleDraft, {
    path: '',
    hidden: false,
    showName: true,
    password: '',
    note: '',
  });
  assert.deepEqual(store.getState().admin.hiddenPaths, ['/secret']);
  assert.deepEqual(store.getState().admin.protectedPaths, [{ path: '/secret', note: 'private', showName: false }]);
});

test('saveAccessRule rejects empty inline draft before calling API', async () => {
  const toasts = [];
  const calls = [];
  const { store, deps, context } = createThunkHarness({
    adminApi: {
      async createHiddenPath() {
        calls.push('hidden');
      },
      async createProtectedPath() {
        calls.push('protected');
      },
    },
    dispatchToast(type, message) {
      toasts.push({ type, message });
    },
  });
  const thunks = createAdminThunks(deps, context);

  await store.dispatch(thunks.saveAccessRule());

  assert.deepEqual(calls, []);
  assert.deepEqual(toasts, [{ type: 'error', message: '请填写规则路径' }]);
  assert.equal(store.getState().admin.accessRuleSaving, false);
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
