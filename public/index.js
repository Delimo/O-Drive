import { createApiLayer } from './js/api/index.js';
import { createServices } from './js/services/index.js';
import { createStateSelectors } from './js/state/selectors.js';
import { createThunks } from './js/state/thunks/index.js';
import { createModalRenderers } from './js/render/modal.js';
import { createHomeRenderers } from './js/render/home.js';
import { createPageRenderers } from './js/render/pages/index.js';
import { createSharedRenderers } from './js/render/shared.js';
import { createUploadsRenderer } from './js/render/uploads.js';
import { registerAppEvents } from './js/events/index.js';
import { formatBytes, formatTime, formatRelative, humanSort, humanView } from './js/utils/format.js';
import { normalizeKey, encodeRouteKey } from './js/utils/path.js';
import { inferKind, iconForKind as iconForKindBase, iconClass, isProtectedEntry, canPreview } from './js/utils/guards.js';
import { escapeHtml, humanError, splitUploadTarget } from './js/utils/text.js';
import { renderMarkdown, isMarkdownName } from './js/utils/markdown.js';
import { icons, fileTypeIcons } from './js/ui/icons.js';
import { createRootStore } from './js/state/store.js';
import { createDeferredAction, syncHomeUrl as syncHomeUrlHelper, openDownload as openDownloadHelper, readDroppedEntries } from './js/utils/helpers.js';
import { cleanupAudioContext } from './js/state/thunks/index.js';
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

async function copyText(value, successText = '已复制') {
  try {
    await navigator.clipboard.writeText(value);
    dispatchToast('success', successText);
    return true;
  } catch (_) {
    dispatchToast('error', '复制失败');
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

const { renderAdminPage: adminRenderer, renderSharePage: shareRenderer } = createPageRenderers({
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
  const selected = page === 'home' ? getSelectedEntry(state) : null;
  const html = `
    ${renderHeader(state)}
    ${renderMain(state)}
    ${
      page === 'home'
        ? `
          <div class="details-drawer-wrap ${selected ? 'is-open' : ''}">
            <div class="details-drawer-backdrop" data-action="clear-selected"></div>
            <aside class="details-drawer ${selected ? 'is-open' : ''}">
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
        `
        : ''
    }
    <div data-region="modal"></div>
    <div data-region="toast"></div>
    <div data-region="drop-overlay"></div>
    ${page === 'home' ? '<div data-region="uploads"></div>' : ''}
  `;
  const next = root.cloneNode(false);
  next.innerHTML = html;
  morphdom(root, next, { childrenOnly: true });
}

function renderModal() {
  const state = store.getState();
  const el = root.querySelector('[data-region="modal"]');
  if (el) renderRegion(el, modalRenderer(state));
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

function renderHeader(state) {
  const { role } = state.app;
  const searchValue = page === 'home' ? state.explorer.queryDraft : '';

  return `
    <header class="header-card mb-4 flex-shrink-0 flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
      <a href="/" class="brand-link flex items-center gap-3 text-lg font-bold text-slate-900 tracking-tight">
        <svg class="w-8 h-8 text-[#b9c6d2]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
        </svg>
        <span class="text-xl font-bold text-slate-800">O-Drive</span>
      </a>
      <div class="flex items-center gap-3">
        ${page === 'home' ? `
          <div class="search-bar relative">
            <span class="absolute inset-y-0 left-3 flex items-center text-slate-400">🔍</span>
            <input type="search" value="${escapeHtml(searchValue)}" placeholder="搜索文件..." data-role="search-input" aria-label="搜索文件" class="w-44 pl-9 pr-3 py-1.5 text-sm bg-[#fafbfc] border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-slate-300 transition-all">
          </div>
        ` : ''}
        <button class="header-icon-btn header-theme-btn" data-action="toggle-theme" aria-label="切换主题"><span class="icon">${icons.sun}</span><span class="icon">${icons.moon}</span></button>
        ${role === 'admin' ? `
        <div class="relative" data-component="notifications">
          <button class="header-icon-btn notif-bell" data-action="toggle-notifications" aria-label="通知">
            <span class="icon">${icons.bell}</span>
            <span class="notif-dot${state.admin.notificationsUnread ? '' : ' notif-hidden'}" data-role="notif-count"></span>
          </button>
          <div class="notif-dropdown${state.admin.notifOpen ? ' notif-open' : ''}" data-role="notif-dropdown">
            <div class="notif-dropdown-head">
              <span class="notif-dropdown-title">通知</span>
              <button class="px-3 py-1 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors" data-action="mark-all-notifications-read" ${state.admin.notificationsUnread ? '' : 'disabled'}>全部已读</button>
            </div>
            <div class="notif-dropdown-body">
              ${state.admin.notifications.length
                ? state.admin.notifications.map(n => `
                  <div class="notif-item ${n.read ? '' : 'notif-item-unread'}" data-notif-id="${n.id}">
                    <div class="notif-item-main">
                      <div class="notif-item-msg">${escapeHtml(n.message)}</div>
                      <div class="notif-item-time">${formatRelative(n.created_at)}</div>
                    </div>
                    ${n.read ? '' : `<button class="notif-item-dismiss" data-action="mark-notification-read" data-notif-id="${n.id}" aria-label="标记已读">${icons.close}</button>`}
                  </div>
                `).join('')
                : `<div class="notif-empty">暂无通知</div>`
              }
            </div>
          </div>
        </div>
        ` : ''}
        <div class="flex items-center gap-2">
          ${
            page === 'admin'
              ? `<a class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" href="/">返回云盘</a>`
              : `${role === 'admin' ? `<a class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" href="/admin">管理</a>` : ''}${role === 'admin'
                  ? `<button class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" data-action="logout">退出</button>`
                  : `<button class="px-4 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors" data-action="open-login">登录</button>`}`
          }
        </div>
      </div>
    </header>
  `;
}
function renderMain(state) {
  if (page === 'admin') return adminRenderer(state);
  if (page === 'share') return shareRenderer(state);
  return homeRenderer(state);
}

function navigateToExplorerPath(path = '') {
  store.dispatch(actions.explorer.setTrashMode(false));
  store.dispatch(actions.explorer.setPath(path));
  store.dispatch(actions.explorer.setQuery(''));
  store.dispatch(actions.explorer.setQueryDraft(''));
  store.dispatch(thunks.loadExplorer());
}

let notifPollTimer = null;
function startNotificationPolling(store, thunks) {
  if (notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(() => {
    store.dispatch(thunks.loadNotifications());
  }, 30000);
}

function subscribeSlice(selector, fn) {
  let prev = selector(store.getState());
  return store.subscribe(() => {
    const next = selector(store.getState());
    if (next !== prev) {
      prev = next;
      fn();
    }
  });
}

const unsubscribers = [
  subscribeSlice(
    s => page === 'home' ? s.explorer : page === 'admin' ? s.admin : page === 'share' ? s.share : null,
    render,
  ),
  ...(page === 'home' ? [
    subscribeSlice(s => s.admin.notifOpen, render),
    subscribeSlice(s => s.admin.notificationsUnread, render),
    subscribeSlice(s => s.admin.notifications, render),
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
store.dispatch(thunks.loadRole()).then(async () => {
  if (page === 'home') {
    await store.dispatch(thunks.loadExplorer());
  } else if (page === 'admin') {
    if (store.getState().app.role === 'admin') {
      await Promise.all([
        store.dispatch(thunks.loadAdminStats()),
        store.dispatch(thunks.loadAdminShares()),
        store.dispatch(thunks.loadAdminHealth()),
        store.dispatch(thunks.loadAdminLogs(1)),
        store.dispatch(thunks.loadAdminQuota()),
        store.dispatch(thunks.loadAdminProtectedPaths()),
        store.dispatch(thunks.loadAdminHiddenPaths()),
        store.dispatch(thunks.loadAdminStorageConfig()),
        store.dispatch(thunks.loadAdminWebhooks()),
        store.dispatch(thunks.loadAdminWebhookDeliveries()),
        store.dispatch(thunks.loadMaintenanceSnapshot()),
        store.dispatch(thunks.loadTasks()),
        store.dispatch(thunks.loadNotifications()),
      ]);
      startNotificationPolling(store, thunks);
    }
  } else if (page === 'share') {
    await store.dispatch(thunks.loadShare());
  }
});

window.addEventListener('beforeunload', () => {
  cleanupAudioContext();
  destroyEvents();
  unsubscribe();
  if (notifPollTimer) clearInterval(notifPollTimer);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) cleanupAudioContext();
});

