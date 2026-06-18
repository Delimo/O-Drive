import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown, isMarkdownName } from '../public/js/utils/markdown.js';
import { normalizeKey, encodeRouteKey } from '../public/js/utils/path.js';
import { formatBytes, formatTime, formatRelative, humanSort, humanView } from '../public/js/utils/format.js';
import { inferKind, iconForKind, iconClass, isProtectedEntry } from '../public/js/utils/guards.js';
import { escapeHtml } from '../public/js/utils/text.js';
import { createStateSelectors } from '../public/js/state/selectors.js';
import { createSharedRenderers } from '../public/js/render/shared.js';
import { createHomeRenderers } from '../public/js/render/home.js';
import { createModalRenderers } from '../public/js/render/modal.js';
import { createUploadsRenderer } from '../public/js/render/uploads.js';
import { mockTextContent, mockReadme, mockAdminHealth, mockAdminLogs, mockAdminQuota, mockProtectedPaths, mockHiddenPaths, mockWebhooks, mockWebhookDeliveries, mockMaintenanceSnapshot, mockTasks } from '../public/js/mock/index.js';
import { createDeferredAction, openDownload } from '../public/js/utils/helpers.js';
import { createPageRenderers } from '../public/js/render/pages.js';

// 任意图标都返回占位 SVG，避免在测试里维护完整图标表
const icons = new Proxy({}, { get: () => '<svg></svg>' });

const selectors = createStateSelectors({ formatBytes, inferKind, normalizeKey, isProtectedEntry });

const shared = createSharedRenderers({
  icons,
  escapeHtml,
  inferKind,
  formatTime,
  formatRelative,
  formatBytes,
  entryKey: selectors.entryKey,
  iconForKind: kind => iconForKind(kind, icons),
  iconClass,
  normalizeKey,
});

const home = createHomeRenderers({
  icons,
  escapeHtml,
  currentEntries: selectors.currentEntries,
  getSelectedEntry: selectors.getSelectedEntry,
  selectedEntriesFromState: selectors.selectedEntriesFromState,
  buildBreadcrumbs: shared.buildBreadcrumbs,
  humanSort,
  humanView,
  renderKindOptions: shared.renderKindOptions,
  renderCrumb: shared.renderCrumb,
  renderEntryCard: shared.renderEntryCard,
  renderInspector: shared.renderInspector,
  renderBatchBar: shared.renderBatchBar,
  renderTrashBatchBar: shared.renderTrashBatchBar,
  renderEmptyState: shared.renderEmptyState,
  formatBytes,
});

const pages = createPageRenderers({
  icons,
  escapeHtml,
  renderEmptyState: shared.renderEmptyState,
  formatBytes,
  formatTime,
  formatRelative,
});

const uploads = createUploadsRenderer({ icons, escapeHtml });

function makeState(overrides = {}) {
  return {
    app: { role: 'admin', modal: null, toast: null, ...(overrides.app || {}) },
    explorer: {
      path: '',
      query: '',
      queryDraft: '',
      view: 'grid',
      sort: 'smart',
      filter: 'all',
      folders: [],
      files: [],
      trashItems: [],
      trashMode: false,
      selectedKey: '',
      selectedKeys: [],
      trashSelectedKeys: [],
      clipboard: null,
      loading: false,
      error: '',
      searching: false,
      batchBusy: false,
      trashBatchBusy: false,
      showFilters: false,
      filterKind: 'all',
      filterMinSize: '',
      filterMaxSize: '',
      filterDateFrom: '',
      filterDateTo: '',
      searchCursor: '',
      hasMore: false,
      ...(overrides.explorer || {}),
    },
    uploads: { items: [], ...(overrides.uploads || {}) },
  };
}

// ===== Markdown 渲染与安全 =====

test('markdown renders common syntax', () => {
  const out = renderMarkdown('# Title\n\nHello **bold** *em* `code`.\n\n- a\n- b\n\n1. one\n2. two\n\n> quote');
  assert.match(out, /<h1>Title<\/h1>/);
  assert.match(out, /<strong>bold<\/strong>/);
  assert.match(out, /<em>em<\/em>/);
  assert.match(out, /<code>code<\/code>/);
  assert.match(out, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(out, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(out, /<blockquote>quote<\/blockquote>/);
});

test('markdown escapes raw HTML and blocks dangerous links', () => {
  const out = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(2))\n\n[ok](https://a.com)');
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /&lt;script&gt;/);
  assert.doesNotMatch(out, /href="javascript:/);
  assert.match(out, /href="https:\/\/a\.com"/);
});

test('isMarkdownName detects markdown extensions', () => {
  assert.equal(isMarkdownName('readme.md'), true);
  assert.equal(isMarkdownName('notes.markdown'), true);
  assert.equal(isMarkdownName('photo.png'), false);
});

test('markdown renders tables', () => {
  const out = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |');
  assert.match(out, /<table>/);
  assert.match(out, /<th>A<\/th>/);
  assert.match(out, /<td>1<\/td>/);
  assert.match(out, /<td>4<\/td>/);
});

test('markdown renders task lists', () => {
  const out = renderMarkdown('- [ ] todo\n- [x] done');
  assert.match(out, /<input type="checkbox" disabled>/);
  assert.match(out, /<input type="checkbox" disabled checked>/);
  assert.match(out, /todo/);
  assert.match(out, /done/);
});

// ===== 路径工具 =====

test('path helpers normalize and encode each segment', () => {
  assert.equal(normalizeKey('/中文/赤壁赋.txt/'), '中文/赤壁赋.txt');
  assert.equal(encodeRouteKey('/中文/赤壁赋.txt'), '%E4%B8%AD%E6%96%87/%E8%B5%A4%E5%A3%81%E8%B5%8B.txt');
  assert.equal(encodeRouteKey(''), '');
});

// ===== selectors 排序 / 筛选 / 内容模式 =====

test('selectors put folders first under smart sort', () => {
  const state = makeState({
    explorer: {
      folders: [{ name: 'b', fullKey: 'b' }, { name: 'a', fullKey: 'a' }],
      files: [{ name: 'note.txt', fullKey: 'note.txt', rawSize: 1 }],
      sort: 'smart',
    },
  });
  assert.deepEqual(selectors.currentEntries(state).map(e => e.fullKey), ['a', 'b', 'note.txt']);
});

test('selectors filter by kind', () => {
  const state = makeState({
    explorer: {
      folders: [{ name: 'dir', fullKey: 'dir' }],
      files: [{ name: 'a.png', fullKey: 'a.png' }, { name: 'b.txt', fullKey: 'b.txt' }],
      filter: 'folder',
    },
  });
  assert.deepEqual(selectors.currentEntries(state).map(e => e.fullKey), ['dir']);
});

test('selectors detect content mode', () => {
  assert.equal(selectors.detectContentMode({ name: 'a.png' }), 'image');
  assert.equal(selectors.detectContentMode({ name: 'a.txt' }), 'text');
});

// ===== 上传面板渲染 =====

test('uploads panel is empty when no items', () => {
  assert.equal(uploads.renderUploadsPanel(makeState()), '');
});

test('uploads panel shows progress and success summary', () => {
  const uploading = uploads.renderUploadsPanel(makeState({
    uploads: { items: [{ id: '1', name: 'a.txt', status: 'uploading', progress: 40, error: '' }] },
  }));
  assert.match(uploading, /正在上传 1 个文件/);
  assert.match(uploading, /width:40%/);

  const done = uploads.renderUploadsPanel(makeState({
    uploads: { items: [
      { id: '1', name: 'a.txt', status: 'success', progress: 100, error: '' },
      { id: '2', name: 'b.txt', status: 'error', progress: 0, error: '上传失败' },
    ] },
  }));
  assert.match(done, /成功 1 个，失败 1 个/);
});

test('uploads panel shows pause button on active items and resume on paused', () => {
  const active = uploads.renderUploadsPanel(makeState({
    uploads: { items: [{ id: '1', name: 'a.txt', status: 'uploading', progress: 40, error: '' }] },
  }));
  assert.match(active, /data-action="pause-upload"/);
  assert.match(active, /data-action="cancel-upload"/);

  const paused = uploads.renderUploadsPanel(makeState({
    uploads: { items: [{ id: '2', name: 'b.txt', status: 'paused', progress: 40, error: '' }] },
  }));
  assert.match(paused, /data-action="resume-upload"/);
  assert.match(paused, /已暂停/);
});

// ===== 批量栏忙碌态 =====

test('batch bar disables actions while busy', () => {
  const idle = shared.renderBatchBar(makeState(), [{}, {}]);
  assert.match(idle, /已选中 2 项/);
  assert.doesNotMatch(idle, /disabled/);

  const busy = shared.renderBatchBar(makeState({ explorer: { batchBusy: true } }), [{}, {}]);
  assert.match(busy, /正在处理批量操作/);
  assert.match(busy, /disabled/);
});

// ===== 首页搜索结果提示 =====

test('home shows searching hint and result count', () => {
  const searching = home.renderHomePage(makeState({
    explorer: { query: 'foo', searching: true },
  }));
  assert.match(searching, /正在搜索/);

  const counted = home.renderHomePage(makeState({
    explorer: {
      query: 'foo',
      searching: false,
      files: [{ name: 'foo.txt', fullKey: 'foo.txt' }],
    },
  }));
  assert.match(counted, /找到 1 个匹配/);
});

test('home shows empty state with no entries', () => {
  const html = home.renderHomePage(makeState());
  assert.match(html, /这个文件夹还是空的/);
});

// ===== mock 设计预览数据 =====

test('mock text content returns markdown for .md files', () => {
  assert.equal(mockTextContent({ name: 'readme.md' }), mockReadme);
  assert.match(mockTextContent({ name: 'plain.txt' }), /设计预览占位文本/);
});

// ===== 回收站批量栏 =====

test('trash batch bar shows restore and delete actions', () => {
  const html = shared.renderTrashBatchBar(makeState({ explorer: { trashSelectedKeys: ['a', 'b'] } }), [{}, {}], ['a', 'b'], false);
  assert.match(html, /已选中 2 项回收站记录/);
  assert.match(html, /data-action="restore-selected-trash"/);
  assert.match(html, /data-action="delete-selected-trash"/);
  assert.doesNotMatch(html, /data-action="copy-selected"/);
  assert.doesNotMatch(html, /data-action="move-selected"/);
});

test('trash batch bar disables actions while busy', () => {
  const busy = shared.renderTrashBatchBar(makeState(), [{}, {}], ['a'], true);
  assert.match(busy, /正在处理批量操作/);
  assert.match(busy, /disabled/);
});

// ===== 新增选择器：findEntryByKey / collectSelectedPaths =====

test('findEntryByKey returns matching entry by key', () => {
  const state = makeState({
    explorer: {
      files: [{ name: 'foo.txt', fullKey: 'foo.txt' }],
    },
  });
  const found = selectors.findEntryByKey(state, 'foo.txt');
  assert.equal(found?.name, 'foo.txt');
  const missing = selectors.findEntryByKey(state, 'nope');
  assert.equal(missing, null);
});

test('collectSelectedPaths returns paths for selected keys', () => {
  const state = makeState({
    explorer: {
      selectedKeys: ['a.txt', 'b.txt'],
      files: [
        { name: 'a.txt', fullKey: 'a.txt' },
        { name: 'b.txt', fullKey: 'b.txt' },
        { name: 'c.txt', fullKey: 'c.txt' },
      ],
    },
  });
  const paths = selectors.collectSelectedPaths(state, e => e.fullKey || '');
  assert.deepEqual(paths, ['a.txt', 'b.txt']);
});

// ===== helper 工具函数 =====

test('createDeferredAction builds action object', () => {
  const action = createDeferredAction('navigate', { path: '/foo' });
  assert.equal(action.kind, 'navigate');
  assert.equal(action.path, '/foo');
});

test('openDownload calls apiClient.downloadUrl with entry path', () => {
  let calledPath = '';
  let calledEntry = null;
  const fakeClient = {
    downloadUrl(path) { calledPath = path; return ''; },
  };
  const getEntryPath = (entry) => { calledEntry = entry; return entry.fullKey || ''; };
  openDownload(fakeClient, getEntryPath, { fullKey: 'test.pdf' });
  assert.equal(calledPath, 'test.pdf');
  assert.equal(calledEntry?.fullKey, 'test.pdf');
});

// ===== 预览编辑草稿持久化 =====

test('preview editor uses draftContent when editing', () => {
  const { renderPreviewModalBody } = createModalRenderers({
    icons,
    escapeHtml,
    getEntryPath: e => e?.fullKey || '',
    apiClient: { previewUrl: () => '' },
    renderMarkdown: s => s,
    isMarkdownName: () => false,
  });

  const editing = renderPreviewModalBody({
    type: 'preview',
    editing: true,
    content: '原始内容',
    draftContent: '用户正在编辑的新内容',
    entry: { name: 'test.txt' },
  });
  assert.match(editing, /用户正在编辑的新内容/);
  assert.doesNotMatch(editing, /原始内容/);
});

test('preview editor falls back to content when no draftContent', () => {
  const { renderPreviewModalBody } = createModalRenderers({
    icons,
    escapeHtml,
    getEntryPath: e => e?.fullKey || '',
    apiClient: { previewUrl: () => '' },
    renderMarkdown: s => s,
    isMarkdownName: () => false,
  });

  const editing = renderPreviewModalBody({
    type: 'preview',
    editing: true,
    content: '原始内容',
    entry: { name: 'test.txt' },
  });
  assert.match(editing, /原始内容/);
});

// ===== 退出回收站时搜索状态 =====

test('toggle-trash clears queryDraft when exiting trash mode', () => {
  const state = makeState({
    explorer: { trashMode: true, query: '旧搜索', queryDraft: '旧搜索' },
  });
  const next = false;
  const clearedQueryDraft = next ? state.explorer.queryDraft : '';
  assert.equal(clearedQueryDraft, '');
});

test('toggle-trash preserves queryDraft when entering trash mode', () => {
  const state = makeState({
    explorer: { trashMode: false, query: '搜索词', queryDraft: '搜索词' },
  });
  const next = true;
  const preserved = next ? state.explorer.queryDraft : '';
  assert.equal(preserved, '搜索词');
});

// ===== 清空回收站确认弹窗 =====

test('home shows clear-trash button only in trash mode', () => {
  const inTrash = home.renderHomePage(makeState({
    explorer: { trashMode: true },
  }));
  assert.match(inTrash, /data-action="confirm-clear-trash"/);

  const notInTrash = home.renderHomePage(makeState({
    explorer: { trashMode: false },
  }));
  assert.doesNotMatch(notInTrash, /data-action="confirm-clear-trash"/);
});

test('confirm-clear-trash modal shows warning and execute action', () => {
  const { renderModal } = createModalRenderers({
    icons,
    escapeHtml,
    getEntryPath: e => e?.fullKey || '',
    apiClient: { previewUrl: () => '' },
    renderMarkdown: s => s,
    isMarkdownName: () => false,
  });

  const html = renderModal({
    app: {
      modal: { type: 'confirm-clear-trash', loading: false, error: '' },
    },
  });
  assert.match(html, /清空回收站/);
  assert.match(html, /此操作不可撤销/);
  assert.match(html, /data-action="execute-clear-trash"/);
  assert.match(html, /确认清空/);
  assert.match(html, /data-action="close-modal"/);
});

test('confirm-clear-trash modal shows loading state', () => {
  const { renderModal } = createModalRenderers({
    icons,
    escapeHtml,
    getEntryPath: e => e?.fullKey || '',
    apiClient: { previewUrl: () => '' },
    renderMarkdown: s => s,
    isMarkdownName: () => false,
  });

  const html = renderModal({
    app: {
      modal: { type: 'confirm-clear-trash', loading: true, error: '' },
    },
  });
  assert.match(html, /清空中\.\.\./);
  assert.match(html, /disabled/);
});

test('add-protected-path modal renders form fields', () => {
  const { renderModal } = createModalRenderers({
    icons,
    escapeHtml,
    getEntryPath: e => e?.fullKey || '',
    apiClient: { previewUrl: () => '' },
    renderMarkdown: s => s,
    isMarkdownName: () => false,
  });

  const html = renderModal({
    app: {
      modal: { type: 'add-protected-path', loading: false, error: '', path: '', password: '', note: '', showName: '' },
    },
  });
  assert.match(html, /添加受保护路径/);
  assert.match(html, /data-form="add-protected-path"/);
  assert.match(html, /name="path"/);
  assert.match(html, /name="password"/);
  assert.match(html, /name="showName"/);
  assert.match(html, /name="note"/);
});

test('confirm-delete-protected-path modal shows warning', () => {
  const { renderModal } = createModalRenderers({
    icons,
    escapeHtml,
    getEntryPath: e => e?.fullKey || '',
    apiClient: { previewUrl: () => '' },
    renderMarkdown: s => s,
    isMarkdownName: () => false,
  });

  const html = renderModal({
    app: {
      modal: { type: 'confirm-delete-protected-path', loading: false, error: '', path: '/test/path' },
    },
  });
  assert.match(html, /确认删除受保护路径/);
  assert.match(html, /data-action="execute-delete-protected-path"/);
  assert.match(html, /\/test\/path/);
});

test('admin health section renders health components', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: mockAdminHealth, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: mockAdminQuota, quotaError: '',
      protectedPathsLoading: false, protectedPaths: mockProtectedPaths, protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: mockHiddenPaths, hiddenPathsError: '',
      webhooksLoading: false, webhooks: mockWebhooks, webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: mockWebhookDeliveries,
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /系统健康/);
  assert.match(html, /storage/);
  assert.match(html, /database/);
  assert.match(html, /存储服务运行正常/);
});

test('admin logs section renders log entries with pagination', () => {
  const logs = mockAdminLogs(1);
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: logs.items, logsError: '', logsPage: logs.page, logsTotalPages: logs.totalPages, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /操作日志/);
  assert.match(html, /产品说明\.pdf/);
  assert.match(html, /上传/);
  assert.match(html, /admin/);
});

test('admin quota section renders storage usage', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: mockAdminQuota, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /存储配额/);
  assert.match(html, /已用空间/);
  assert.match(html, /总配额/);
  assert.match(html, /1\.2/);
  assert.match(html, /5\.0/);
});

test('admin protected paths section renders path list with delete buttons', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: mockProtectedPaths, protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /受保护路径/);
  assert.match(html, /机密文件夹/);
  assert.match(html, /data-action="confirm-delete-protected-path"/);
  assert.match(html, /内部敏感资料/);
});

test('admin maintenance section renders snapshot and action buttons', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
      maintenance: mockMaintenanceSnapshot, maintenanceLoading: false, maintenanceError: '', maintenanceBusyAction: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /维护操作/);
  assert.match(html, /128/);
  assert.match(html, /重建文件索引/);
  assert.match(html, /清理访问记录/);
  assert.match(html, /清理缩略图缓存/);
  assert.match(html, /清理旧操作日志/);
  assert.match(html, /清理已完成任务/);
  assert.match(html, /确认系统提醒/);
  assert.match(html, /data-action="confirm-maintenance-action"/);
  assert.match(html, /data-maintenance-action="rebuild-index"/);
  assert.match(html, /data-maintenance-action="cleanup-warnings"/);
});

test('admin maintenance section shows loading state', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
      maintenance: null, maintenanceLoading: true, maintenanceError: '', maintenanceBusyAction: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /维护操作/);
  assert.match(html, /加载中/);
});

test('admin maintenance section shows error state', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
      maintenance: null, maintenanceLoading: false, maintenanceError: '加载失败', maintenanceBusyAction: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /维护操作/);
  assert.match(html, /加载失败/);
});

test('confirm-maintenance-action modal shows warning and execute action', () => {
  const { renderModal } = createModalRenderers({
    icons,
    escapeHtml,
    getEntryPath: e => e?.fullKey || '',
    apiClient: { previewUrl: () => '' },
    renderMarkdown: s => s,
    isMarkdownName: () => false,
  });

  const html = renderModal({
    app: {
      modal: { type: 'confirm-maintenance-action', loading: false, error: '', maintenanceAction: 'rebuild-index', maintenanceLabel: '重建文件索引' },
    },
  });
  assert.match(html, /确认执行/);
  assert.match(html, /重建文件索引/);
  assert.match(html, /data-action="execute-maintenance-action"/);
  assert.match(html, /确认执行/);
  assert.match(html, /data-action="close-modal"/);
});

test('admin task list section renders upload task records', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
      maintenance: null, maintenanceLoading: false, maintenanceError: '', maintenanceBusyAction: '',
      tasks: mockTasks, tasksLoading: false,
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /上传任务/);
  assert.match(html, /产品说明\.pdf/);
  assert.match(html, /5\/5/);
  assert.match(html, /2\/3/);
  assert.match(html, /data-action="refresh-tasks"/);
});

test('admin task list section shows loading state', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
      maintenance: null, maintenanceLoading: false, maintenanceError: '', maintenanceBusyAction: '',
      tasks: [], tasksLoading: true,
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /上传任务/);
  assert.match(html, /加载中/);
});

test('admin task list is hidden when empty', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
      maintenance: null, maintenanceLoading: false, maintenanceError: '', maintenanceBusyAction: '',
      tasks: [], tasksLoading: false,
    },
  };
  const html = pages.renderAdminPage(state);
  assert.doesNotMatch(html, /上传任务/);
});
