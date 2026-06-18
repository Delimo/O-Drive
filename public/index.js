import { createApiLayer } from './js/api/index.js';
import { createServices } from './js/services/index.js';
import { createStateSelectors } from './js/state/selectors.js';
import { createThunks } from './js/state/thunks.js';
import { createModalRenderers } from './js/render/modal.js';
import { createHomeRenderers } from './js/render/home.js';
import { createPageRenderers } from './js/render/pages.js';
import { createSharedRenderers } from './js/render/shared.js';
import { createUploadsRenderer } from './js/render/uploads.js';
import { registerAppEvents } from './js/events/index.js';
import { formatBytes, formatTime, formatRelative, humanSort, humanView } from './js/utils/format.js';
import { normalizeKey, encodeRouteKey } from './js/utils/path.js';
import { inferKind, iconForKind as iconForKindBase, iconClass, isProtectedEntry } from './js/utils/guards.js';
import { escapeHtml, humanError, splitUploadTarget } from './js/utils/text.js';
import { renderMarkdown, isMarkdownName } from './js/utils/markdown.js';
import { icons } from './js/ui/icons.js';
import { createRootStore } from './js/state/store.js';
import { createDeferredAction, syncHomeUrl as syncHomeUrlHelper, openDownload as openDownloadHelper } from './js/utils/helpers.js';
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

const iconForKind = (kind) => iconForKindBase(kind, icons);

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

const { apiClient, request, authApi, fileApi, trashApi, shareApi, adminApi } = createApiLayer({
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
});

const thunks = createThunks({
  actions,
  authApi,
  trashApi,
  fileApi,
  adminApi,
  shareApi,
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
} = createSharedRenderers({
  icons,
  escapeHtml,
  inferKind,
  formatTime,
  formatRelative,
  formatBytes,
  entryKey,
  iconForKind,
  iconClass,
  normalizeKey,
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
});

const { renderAdminPage: adminRenderer, renderSharePage: shareRenderer } = createPageRenderers({
  icons,
  escapeHtml,
  renderEmptyState: sharedRenderEmptyState,
  formatBytes,
  formatTime,
  formatRelative,
});

const { renderUploadsPanel } = createUploadsRenderer({
  icons,
  escapeHtml,
});

registerAppEvents({
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
});

function render() {
  const state = store.getState();
  const selected = page === 'home' ? getSelectedEntry(state) : null;
  const html = `
    <div class="app-shell">
      <div class="workspace">
        ${renderHeader(state)}
        ${renderMain(state)}
      </div>
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
                  <button class="details-close" data-action="clear-selected">×</button>
                </div>
                <div class="details-drawer-body">
                  ${sharedRenderInspector(selected, state)}
                </div>
              </aside>
            </div>
          `
          : ''
      }
      ${modalRenderer(state)}
      ${toastRenderer(state)}
      ${page === 'home' ? renderUploadsPanel(state) : ''}
    </div>
  `;
  const next = root.cloneNode(false);
  next.innerHTML = html;
  morphdom(root, next, { childrenOnly: true });
}

function renderHeader(state) {
  const { role } = state.app;
  const searchValue = page === 'home' ? state.explorer.queryDraft : '';
  const searchDisabled = page !== 'home';
  const searchPlaceholder = page === 'home' ? '搜索文件...' : page === 'admin' ? '' : '当前页面无需搜索';

  return `
    <header class="topbar glass-card">
      <a class="brand" href="/">
        <span class="brand-badge">${icons.cloud}</span>
        <span>
          <h1 class="brand-name">O-Drive</h1>
        </span>
      </a>
      <div class="header-right">
        ${page === 'home' ? `
          <label class="search-box">
            <span class="search-icon" aria-hidden="true">${icons.search}</span>
            <input
              type="search"
              value="${escapeHtml(searchValue)}"
              placeholder="${escapeHtml(searchPlaceholder)}"
              data-role="search-input"
              ${searchDisabled ? 'disabled' : ''}
            >
          </label>
        ` : ''}
        <div class="header-actions">
          ${
            page === 'admin'
              ? `<a class="btn header-btn" href="/">返回云盘</a>`
              : `${page !== 'admin' ? `<a class="btn header-btn" href="/admin">管理</a>` : ''}${role === 'admin'
                  ? `<button class="btn header-btn" data-action="logout">退出</button>`
                  : `<button class="btn header-btn" data-action="open-login">登录</button>`}`
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

store.subscribe(render);
render();

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
      ]);
    }
  } else if (page === 'share') {
    await store.dispatch(thunks.loadShare());
  }
});

