import { createApiLayer } from './js/api/index.js';
import { createServices } from './js/services/index.js';
import { createStateSelectors } from './js/state/selectors.js';
import { createThunks } from './js/state/thunks/index.js';
import { createModalRenderers } from './js/render/modal.js';
import { createHomeRenderers } from './js/render/home.js';
import { createPageRenderers } from './js/render/pages/index.js';
import { createSharedRenderers } from './js/render/shared.js';
import { createUploadsRenderer } from './js/render/uploads.js';
import { createHeaderRenderer } from './js/render/header.js';
import { registerAppEvents } from './js/events/index.js';
import { formatBytes, formatTime, formatRelative, humanSort, humanView } from './js/utils/format.js';
import { normalizeKey, encodeRouteKey } from './js/utils/path.js';
import { inferKind, iconForKind as iconForKindBase, iconClass, isProtectedEntry, canPreview } from './js/utils/guards.js';
import { escapeHtml, humanError, splitUploadTarget } from './js/utils/text.js';
import { renderMarkdown, isMarkdownName } from './js/utils/markdown.js';
import { icons } from './js/ui/icons.js';
import { createRootStore } from './js/state/index.js';
import { createDeferredAction, syncHomeUrl as syncHomeUrlHelper, openDownload as openDownloadHelper, readDroppedEntries } from './js/utils/helpers.js';
import { cleanupAudioContext } from './js/state/thunks/index.js';
import { UI_TEXT } from './js/constants.js';
import { createNotificationPolling } from './js/services/notifications.js';
import morphdom from './js/vendor/morphdom.js';

const root = document.getElementById('app');
const page = document.body.dataset.page || 'home';

const { store, actions } = createRootStore({ page });

let searchTimer = null;
let toastTimer = null;

function dispatchToast(type, message) {
  if (!message) return;
  store.dispatch(actions.app.setToast({ type, message }));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    store.dispatch(actions.app.clearToast());
  }, 2600);
}

const svgIconNames = new Set([
  'folder','file','image','video','audio','pdf','archive','text','script','document','office',
  'js','css','html','xml','yaml','md','less','expression',
  'java','py','rb','php','rust','vbs',
  'doc','docx','ppt','pptx','xls','xlsx',
  'exe','apk','dll','deb','rpm','root','three3d',
]);

function svgUrl(name) {
  return svgIconNames.has(name) ? `/icons/file-type-${name}.svg` : '';
}

function iconForKind(kind, name) {
  if (name) {
    const ext = name.split('.').pop().toLowerCase();
    const extUrl = svgUrl(ext);
    if (extUrl) {
      const fallbackUrl = svgUrl(kind) || '/icons/file-type-file.svg';
      return `<img src="${extUrl}" alt="" aria-hidden="true" onerror="this.onerror=null;this.src='${fallbackUrl}'">`;
    }
  }
  const kindUrl = svgUrl(kind);
  if (kindUrl) {
    return `<img src="${kindUrl}" alt="" aria-hidden="true" onerror="this.onerror=null;this.src='/icons/file-type-file.svg'">`;
  }
  return iconForKindBase(kind, icons);
}

async function copyText(value, successText = UI_TEXT.clipboard.copied) {
  try {
    await navigator.clipboard.writeText(value);
    dispatchToast('success', successText);
    return true;
  } catch (_) {
    dispatchToast('error', UI_TEXT.clipboard.copyFailed);
    return false;
  }
}

async function ensureRemoteDirectoryTree(path) {
  const normalized = normalizeKey(path);
  if (!normalized) return;
  const parts = normalized.split('/').filter(Boolean);
  let current = '';
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const parent = current;
    current = current ? `${current}/${part}` : part;
    const existing = findCurrentEntryByPath(current);
    if (existing && inferKind(existing) === 'folder') continue;
    const { response, data } = await fileApi.createFolder(parent, part, 'r2');
    if (!response.ok && !/already exists/i.test(data?.message || '')) {
      throw new Error(humanError(response, data, `创建目录 ${current} 失败`));
    }
  }
}

function openProtectedUnlockModal(path, deferredAction, error = '') {
  store.dispatch(actions.app.setModal({
    type: 'unlock-path',
    loading: false,
    error,
    path,
    deferredAction,
  }));
}

const {
  currentEntries,
  getSelectedEntry,
  entryKey,
  getEntryPath,
  detectContentMode,
  findCurrentEntryByPath,
  findEntryByKey,
  collectSelectedPaths,
  selectedEntriesFromState,
  requiresProtectedUnlock,
} = createStateSelectors({
  formatBytes,
  inferKind,
  normalizeKey,
  isProtectedEntry,
});

const { apiClient, authApi, fileApi, trashApi, shareApi, adminApi, multipartApi, maintenanceApi, taskApi, notificationApi } = createApiLayer({
  fetchImpl: fetch,
  getState: () => store.getState(),
  encodeRouteKey,
  normalizeKey,
  FormDataImpl: FormData,
  HeadersImpl: Headers,
  XhrImpl: XMLHttpRequest,
});

const { previewService, uploadService } = createServices({
  detectContentMode,
  getState: () => store.getState(),
  getEntryPath,
  splitUploadTarget,
  ensureRemoteDirectoryTree,
  fileApi,
  multipartApi,
});

const thunks = createThunks({
  actions,
  authApi,
  trashApi,
  fileApi,
  adminApi,
  shareApi,
  maintenanceApi,
  taskApi,
  notificationApi,
  multipartApi,
  previewService,
  uploadService,
  normalizeKey,
  syncHomeUrl: (path, query) => syncHomeUrlHelper(page, path, query),
  dispatchToast,
  getEntryPath,
  requiresProtectedUnlock,
  openProtectedUnlockModal,
  createDeferredAction,
  humanError,
  copyText,
  getPage: () => page,
  openDownload: (entry) => openDownloadHelper(apiClient, getEntryPath, entry),
  findCurrentEntryByPath,
  getStore: () => store,
});

const { renderModal: modalRenderer, renderToast: toastRenderer } = createModalRenderers({
  icons,
  escapeHtml,
  getEntryPath,
  apiClient,
  renderMarkdown,
  isMarkdownName,
  formatBytes,
});

const {
  renderInspector: sharedRenderInspector,
  renderBatchBar: sharedRenderBatchBar,
  renderTrashBatchBar: sharedRenderTrashBatchBar,
  renderKindOptions: sharedRenderKindOptions,
  renderCrumb: sharedRenderCrumb,
  buildBreadcrumbs: sharedBuildBreadcrumbs,
  renderEntryCard: sharedRenderEntryCard,
  renderEmptyState: sharedRenderEmptyState,
  renderEmptyStateCompact: sharedRenderEmptyStateCompact,
} = createSharedRenderers({
  icons,
  escapeHtml,
  inferKind,
  canPreview,
  formatTime,
  formatRelative,
  formatBytes,
  entryKey,
  iconForKind,
  iconClass,
  normalizeKey,
  thumbnailUrl: apiClient.thumbnailUrl,
});

const { renderHomePage: homeRenderer } = createHomeRenderers({
  icons,
  escapeHtml,
  currentEntries,
  getSelectedEntry,
  selectedEntriesFromState,
  buildBreadcrumbs: sharedBuildBreadcrumbs,
  humanSort,
  humanView,
  renderKindOptions: sharedRenderKindOptions,
  renderCrumb: sharedRenderCrumb,
  renderEntryCard: sharedRenderEntryCard,
  renderInspector: sharedRenderInspector,
  renderBatchBar: sharedRenderBatchBar,
  renderTrashBatchBar: sharedRenderTrashBatchBar,
  renderEmptyState: sharedRenderEmptyState,
  formatBytes,
  inferKind,
  canPreview,
  formatTime,
  entryKey,
  iconForKind,
  iconClass,
  thumbnailUrl: apiClient.thumbnailUrl,
});

const { renderAdminPage: adminRenderer, renderSharePage: shareRenderer, bindCustomSelects, bindCustomDatePickers } = createPageRenderers({
  icons,
  escapeHtml,
  renderEmptyState: sharedRenderEmptyState,
  renderEmptyStateCompact: sharedRenderEmptyStateCompact,
  formatBytes,
  formatTime,
  formatRelative,
});

const { renderUploadsPanel } = createUploadsRenderer({
  icons,
  escapeHtml,
});

const { renderHeader } = createHeaderRenderer({
  icons,
  escapeHtml,
  formatRelative,
});

const notificationPolling = createNotificationPolling({
  documentRef: document,
});

const destroyEvents = registerAppEvents({
  documentRef: document,
  windowRef: window,
  store,
  actions,
  thunks,
  page,
  dispatchToast,
  navigateToExplorerPath,
  collectSelectedPaths: (state) => collectSelectedPaths(state, getEntryPath),
  findEntryByKey: (key) => findEntryByKey(store.getState(), key),
  getEntryPath,
  inferKind,
  canPreview,
  requiresProtectedUnlock,
  openProtectedUnlockModal,
  createDeferredAction,
  openDownload: (entry) => openDownloadHelper(apiClient, getEntryPath, entry),
  encodeRouteKey,
  copyText,
  setSearchTimer: value => {
    searchTimer = value;
  },
  getSearchTimer: () => searchTimer,
  syncHomeUrl: (path, query) => syncHomeUrlHelper(page, path, query),
  readDroppedEntries,
});

function renderRegion(container, htmlString) {
  const next = container.cloneNode(false);
  next.innerHTML = htmlString;
  morphdom(container, next, { childrenOnly: true });
}

function render() {
  const state = store.getState();
  const modalEl = root.querySelector('[data-region="modal"]');
  const savedModal = modalEl ? modalEl.innerHTML : '';
  const html = `
    <div data-region="header"></div>
    ${page === 'home' ? '<div data-region="explorer" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>' : renderMain(state)}
    ${page === 'home' ? '<div data-region="detail-drawer"></div>' : ''}
    <div data-region="modal">${savedModal}</div>
    <div data-region="toast"></div>
    <div data-region="drop-overlay"></div>
    ${page === 'home' ? '<div data-region="uploads"></div>' : ''}
  `;
  const next = root.cloneNode(false);
  next.innerHTML = html;
  morphdom(root, next, { childrenOnly: true });
  renderHeaderRegion();
  renderToast();
  renderDropOverlay();
  if (page === 'home') {
    renderExplorerRegion();
    renderDetailDrawerRegion();
    renderUploads();
  }
  if (page === 'admin') {
    bindCustomSelects(root);
    bindCustomDatePickers(root);
  }
}

function renderHeaderRegion() {
  const state = store.getState();
  const el = root.querySelector('[data-region="header"]');
  if (el) renderRegion(el, renderHeader(state, page));
}

function renderDetailDrawerRegion() {
  const state = store.getState();
  const selected = page === 'home' ? getSelectedEntry(state) : null;
  const el = root.querySelector('[data-region="detail-drawer"]');
  if (!el) return;
  const html = selected ? `
    <div class="details-drawer-wrap is-open">
      <div class="details-drawer-backdrop" data-action="clear-selected"></div>
      <aside class="details-drawer is-open">
        <div class="details-drawer-head">
          <div>
            <h3 class="details-panel-title">文件详细</h3>
          </div>
          <button class="details-close" data-action="clear-selected" aria-label="关闭详情面板">×</button>
        </div>
        <div class="details-drawer-body">
          ${sharedRenderInspector(selected, state)}
        </div>
      </aside>
    </div>
  ` : '';
  renderRegion(el, html);
}

function renderExplorerRegion() {
  const state = store.getState();
  const el = root.querySelector('[data-region="explorer"]');
  if (el && page === 'home') {
    renderRegion(el, homeRenderer(state));
    bindCustomSelects(root);
  }
}

function renderModal() {
  const state = store.getState();
  const el = root.querySelector('[data-region="modal"]');
  if (el) {
    renderRegion(el, modalRenderer(state));
    bindCustomSelects(el);
  }
}

function renderToast() {
  const state = store.getState();
  const el = root.querySelector('[data-region="toast"]');
  if (el) renderRegion(el, toastRenderer(state));
}

function renderUploads() {
  const state = store.getState();
  const el = root.querySelector('[data-region="uploads"]');
  if (el) renderRegion(el, renderUploadsPanel(state));
}

function renderDropOverlay() {
  const state = store.getState();
  const el = root.querySelector('[data-region="drop-overlay"]');
  if (!el) return;
  if (state.app.dragging) {
    el.innerHTML = '<div class="drop-overlay"><div class="drop-overlay-inner"><span class="drop-overlay-icon">⇧</span><span class="drop-overlay-text">松开上传</span></div></div>';
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function renderMain(state) {
  if (page === 'admin') return adminRenderer(state);
  if (page === 'share') return shareRenderer(state);
  return homeRenderer(state);
}

function navigateToExplorerPath(path = '') {
  store.dispatch(actions.explorer.startNavigation(normalizeKey(path)));
  store.dispatch(thunks.loadExplorer());
}

function shallowEqualValue(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((key) => Object.is(a[key], b[key]));
  }
  return false;
}

function selectAdminRenderState(state) {
  const admin = state.admin;
  const base = [admin.activeTab, admin.loading, admin.error, admin.statsLoadingHint];
  if (admin.activeTab === "overview") {
    return [...base, admin.stats];
  }
  if (admin.activeTab === "storage") {
    return [
      ...base,
      admin.storageConfig,
      admin.storageConfigLoading,
      admin.storageConfigError,
      admin.storageConfigSaving,
      admin.trashRetention,
      admin.trashRetentionLoading,
      admin.trashCleanupBusy,
      admin.trashPreviewItems,
      admin.trashPreviewLoading,
      admin.trashPreviewError,
      admin.protectedPaths,
      admin.protectedPathsLoading,
      admin.protectedPathsError,
      admin.hiddenPaths,
      admin.hiddenPathsLoading,
      admin.hiddenPathsError,
      admin.accessRuleDraft,
      admin.accessRuleSaving,
    ];
  }
  if (admin.activeTab === "shares") {
    return [
      ...base,
      admin.shares,
      admin.sharesLoading,
      admin.sharesError,
      admin.shareBusyToken,
      admin.shareFilter,
      admin.shareSearch,
      admin.sharePage,
    ];
  }
  if (admin.activeTab === "logs") {
    return [
      ...base,
      admin.logs,
      admin.logsLoading,
      admin.logsError,
      admin.logsPage,
      admin.logsTotalPages,
      admin.logsFilter,
    ];
  }
  if (admin.activeTab === "system") {
    return [
      ...base,
      admin.health,
      admin.healthLoading,
      admin.healthError,
      admin.quota,
      admin.quotaLoading,
      admin.quotaError,
      admin.maintenance,
      admin.maintenanceLoading,
      admin.maintenanceError,
      admin.maintenanceBusyAction,
      admin.tasks,
      admin.tasksLoading,
      admin.taskRetryingId,
      admin.taskAlertConfig,
      admin.taskAlertConfigSaving,
      admin.activeUploadTaskId,
    ];
  }
  if (admin.activeTab === "webhook") {
    return [
      ...base,
      admin.webhooks,
      admin.webhooksLoading,
      admin.webhooksError,
      admin.webhookDeliveries,
      admin.webhookDeliveriesLoading,
      admin.webhookRetryingId,
      admin.webhookRecordTab,
      admin.adminNotifHistory,
      admin.adminNotifHistoryLoading,
      admin.adminNotifFilter,
    ];
  }
  return base;
}

function subscribeSlice(selector, fn) {
  let prev = selector(store.getState());
  return store.subscribe(() => {
    const next = selector(store.getState());
    if (!shallowEqualValue(next, prev)) {
      prev = next;
      fn();
    }
  });
}

const unsubscribers = [
  ...(page === 'home' ? [
    subscribeSlice(s => s.app.role, renderHeaderRegion),
    subscribeSlice(s => s.app.guestMode, renderHeaderRegion),
    subscribeSlice(s => s.admin.notifOpen, renderHeaderRegion),
    subscribeSlice(s => s.admin.notificationsUnread, renderHeaderRegion),
    subscribeSlice(s => s.admin.notifications, renderHeaderRegion),
    subscribeSlice(s => {
      const selected = getSelectedEntry(s);
      const path = selected ? normalizeKey(getEntryPath(selected)) : "";
      const stats = path ? s.explorer.folderStats?.[path] : null;
      const error = path ? s.explorer.folderStatsErrors?.[path] || "" : "";
      return [
        s.explorer.selectedKey,
        path,
        s.explorer.folderStatsLoadingKey,
        error,
        stats?.fileCount,
        stats?.folderCount,
        stats?.directFileCount,
        stats?.totalSize,
        stats?.latestTime,
        stats?.truncated,
      ];
    }, renderDetailDrawerRegion),
    subscribeSlice(
      s => [
        s.explorer.folders,
        s.explorer.files,
        s.explorer.trashItems,
        s.explorer.sort,
        s.explorer.view,
        s.explorer.filter,
        s.explorer.loading,
        s.explorer.query,
        s.explorer.trashMode,
        s.explorer.searching,
        s.explorer.hasMore,
        s.explorer.selectedKeys,
        s.explorer.trashSelectedKeys,
        s.explorer.trashBatchBusy,
        s.explorer.clipboard,
        s.explorer.showFilters,
        s.explorer.filterKind,
        s.explorer.filterMinSize,
        s.explorer.filterMaxSize,
        s.explorer.filterDateFrom,
        s.explorer.filterDateTo,
        s.explorer.displayLimit,
      ],
      renderExplorerRegion,
    ),
  ] : []),
  ...(page === 'admin' ? [
    subscribeSlice(selectAdminRenderState, render),
  ] : []),
  ...(page === 'share' ? [
    subscribeSlice(s => s.app.role, render),
    subscribeSlice(s => s.share, render),
  ] : []),
  subscribeSlice(s => s.app.modal, renderModal),
  subscribeSlice(s => s.app.toast, renderToast),
  subscribeSlice(s => s.uploads, renderUploads),
  subscribeSlice(s => s.app.dragging, renderDropOverlay),
];

function unsubscribe() {
  unsubscribers.forEach(unsub => unsub());
}

render();
renderModal();
renderToast();
renderUploads();
renderDropOverlay();

store.dispatch(actions.app.setNow(Date.now()));
if (page === 'share') {
  store.dispatch(thunks.loadShare());
  store.dispatch(thunks.loadRole());
} else {
  store.dispatch(thunks.loadRole()).then(async () => {
    if (page === 'home') {
      await store.dispatch(thunks.loadExplorer());
    } else if (page === 'admin') {
      if (store.getState().app.role === 'admin') {
        await Promise.all([
          store.dispatch(thunks.loadAdminStats()),
          store.dispatch(thunks.loadNotifications()),
        ]);
        notificationPolling.start(store, thunks);
      } else {
        window.location.href = '/';
      }
    }
  });
}

window.addEventListener('beforeunload', () => {
  cleanupAudioContext();
  destroyEvents();
  unsubscribe();
  notificationPolling.stop();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) cleanupAudioContext();
});

