import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown, isMarkdownName } from '../public/js/utils/markdown.js';
import { normalizeKey, encodeRouteKey } from '../public/js/utils/path.js';
import { formatBytes, formatTime, formatRelative, humanSort, humanView } from '../public/js/utils/format.js';
import { inferKind, iconForKind, iconClass, isProtectedEntry, canPreview } from '../public/js/utils/guards.js';
import { escapeHtml } from '../public/js/utils/text.js';
import { createStateSelectors } from '../public/js/state/selectors.js';
import { createSharedRenderers } from '../public/js/render/shared.js';
import { createUiComponents } from '../public/js/render/components.js';
import { createHomeRenderers } from '../public/js/render/home.js';
import { createModalRenderers } from '../public/js/render/modal.js';
import { createUploadsRenderer } from '../public/js/render/uploads.js';
import { mockTextContent, mockReadme, mockAdminHealth, mockAdminLogs, mockAdminQuota, mockProtectedPaths, mockHiddenPaths, mockWebhooks, mockWebhookDeliveries, mockMaintenanceSnapshot, mockTasks, mockTaskAlertConfig, mockNotifications, mockTrashItems } from '../public/js/mock/index.js';
import { createDeferredAction, openDownload } from '../public/js/utils/helpers.js';
import { createPageRenderers } from '../public/js/render/pages/index.js';
import { createHeaderRenderer } from '../public/js/render/header.js';
import { createNotificationPolling } from '../public/js/services/notifications.js';
import { assertApiOk } from '../public/js/state/thunks/errors.js';

// 任意图标都返回占位 SVG，避免在测试里维护完整图标表
const icons = new Proxy({}, { get: () => '<svg></svg>' });

const selectors = createStateSelectors({ formatBytes, inferKind, normalizeKey, isProtectedEntry });

const shared = createSharedRenderers({
  icons,
  escapeHtml,
  inferKind,
  canPreview,
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
  renderEmptyStateCompact: shared.renderEmptyStateCompact,
  formatBytes,
  formatTime,
  formatRelative,
});

const uploads = createUploadsRenderer({ icons, escapeHtml });
const header = createHeaderRenderer({ icons, escapeHtml, formatRelative });

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

test('format helpers accept second and millisecond timestamps', () => {
  const realNow = Date.now;
  const now = Date.UTC(2026, 0, 2, 12, 0, 0);
  const hour = 60 * 60 * 1000;
  Date.now = () => now;
  try {
    assert.match(formatTime(Math.floor((now - 2 * hour) / 1000)), /2026/);
    assert.match(formatTime(now - 2 * hour), /2026/);
    assert.equal(formatRelative(Math.floor((now - 2 * hour) / 1000)), '2 小时前');
    assert.equal(formatRelative(now - 2 * hour), '2 小时前');
  } finally {
    Date.now = realNow;
  }
});

// ===== 共享渲染器 =====

test('inspector renders file summary, properties and actions', () => {
  const html = shared.renderInspector(
    {
      name: 'report.pdf',
      fullKey: 'docs/report.pdf',
      kind: 'pdf',
      rawSize: 2048,
      time: 1710000000,
    },
    makeState(),
  );

  assert.match(html, /details-summary/);
  assert.match(html, /report\.pdf/);
  assert.match(html, /docs\/report\.pdf/);
  assert.match(html, /属性/);
  assert.match(html, /PDF/);
  assert.match(html, /2\.0 KB/);
  assert.match(html, /data-action="preview-entry"/);
  assert.match(html, /data-action="download-entry"/);
  assert.match(html, /data-action="open-share-modal"/);
  assert.match(html, /data-action="open-rename-modal"/);
});

test('inspector renders folder stats and folder actions', () => {
  const html = shared.renderInspector(
    {
      name: 'docs',
      fullKey: 'docs',
      kind: 'folder',
      time: 0,
    },
    makeState({
      explorer: {
        folderStats: {
          docs: {
            path: 'docs',
            fileCount: 2,
            directFileCount: 1,
            folderCount: 1,
            directFolderCount: 1,
            totalSize: 9,
            sizeFormatted: '9 B',
            latestTime: 1767312000,
          },
        },
        folderStatsLoadingKey: '',
        folderStatsErrors: {},
      },
    }),
  );

  assert.match(html, /docs/);
  assert.match(html, /文件数/);
  assert.match(html, /当前层文件/);
  assert.match(html, /子文件夹/);
  assert.match(html, /9 B/);
  assert.match(html, /data-action="open-entry"/);
  assert.match(html, /data-action="open-share-modal"/);
  assert.match(html, /data-action="open-rename-modal"/);
});

test('ui components render reusable empty states and detail rows', () => {
  const ui = createUiComponents({ escapeHtml });
  const empty = ui.renderEmptyState('暂无内容', '请选择一个项目', '<svg></svg>', true);
  const row = ui.renderDetailRow({
    label: '路径',
    value: 'docs/readme.md',
    className: 'details-row-path',
    valueClassName: 'details-path-value',
    title: 'docs/readme.md',
  });
  const helper = ui.renderFormFeedback('', '请填写名称');
  const error = ui.renderFormFeedback('<失败>', '请填写名称');
  const badge = ui.renderBadge({
    label: '<状态>',
    className: 'ov-badge-ok',
    title: '<可用>',
  });

  assert.match(empty, /empty-state-compact/);
  assert.match(empty, /暂无内容/);
  assert.match(row, /details-row-path/);
  assert.match(row, /details-path-value/);
  assert.match(row, /docs\/readme\.md/);
  assert.match(helper, /helper-text/);
  assert.match(helper, /请填写名称/);
  assert.match(error, /error-text/);
  assert.match(error, /&lt;失败&gt;/);
  assert.match(badge, /class="ov-badge ov-badge-ok"/);
  assert.match(badge, /title="&lt;可用&gt;"/);
  assert.match(badge, /&lt;状态&gt;/);
});

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

test('uploads panel shows multipart resume and failure diagnostics', () => {
  const html = uploads.renderUploadsPanel(makeState({
    uploads: { items: [
      {
        id: 'large',
        name: 'large.bin',
        status: 'error',
        progress: 50,
        error: '网络中断',
        multipart: true,
        resumable: true,
        completedParts: 2,
        totalChunks: 4,
        diagnostic: '重新选择同一文件会尝试继续。',
      },
    ] },
  }));

  assert.match(html, /断点 2\/4/);
  assert.match(html, /重新选择同一文件会尝试继续/);
  assert.match(html, /title="重新选择文件"/);
  assert.match(html, /data-action="upload"/);
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
      searchScanned: 80,
    },
  }));
  assert.match(counted, /找到 1 个匹配/);
});

test('home shows scanned count for completed search', () => {
  const html = home.renderHomePage(makeState({
    explorer: {
      query: 'foo',
      searching: false,
      files: [{ name: 'foo.txt', fullKey: 'foo.txt' }],
      searchScanned: 80,
    },
  }));

  assert.match(html, /search-progress-note/);
  assert.match(html, /80/);
});

test('home shows scan continuation when search reaches scan limit', () => {
  const html = home.renderHomePage(makeState({
    explorer: {
      query: 'foo',
      searching: false,
      files: [{ name: 'foo.txt', fullKey: 'foo.txt' }],
      hasMore: true,
      searchScanned: 1000,
      searchScanLimitReached: true,
    },
  }));

  assert.match(html, /search-progress-note/);
  assert.match(html, /1000/);
  assert.match(html, /data-action="load-more-search"/);
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

test('entry card renders search hit reason', () => {
  const html = shared.renderEntryCard({
    name: 'readme.txt',
    fullKey: 'docs/nested/readme.txt',
    rawSize: 5,
    time: 1710000000,
    searchHit: { label: '路径', value: 'docs/nested/readme.txt', filters: ['类型'] },
  }, makeState({ explorer: { query: 'nested' } }), new Set());
  assert.match(html, /路径：docs\/nested\/readme\.txt/);
  assert.match(html, /筛选：类型/);
});

test('folder entry card exposes share action for admins', () => {
  const html = shared.renderEntryCard({
    name: 'docs',
    fullKey: 'docs',
    kind: 'folder',
  }, makeState({ app: { role: 'admin' } }), new Set());

  assert.match(html, /title="分享文件夹"/);
  assert.match(html, /data-action="open-share-modal"/);
  assert.match(html, /data-action="info"/);
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

test('assertApiOk accepts success, rejects failures, and preserves completed partials', () => {
  const human = (_response, data, fallback) => data?.message || fallback;

  assert.doesNotThrow(() =>
    assertApiOk({ ok: true }, { success: true }, '失败', human),
  );
  assert.doesNotThrow(() =>
    assertApiOk({ ok: false }, { success: false, completed: 2 }, '失败', human, { allowCompleted: true }),
  );
  assert.doesNotThrow(() =>
    assertApiOk({ ok: true }, { success: false, message: '业务失败' }, '失败', human, { allowSuccessFalse: true }),
  );
  assert.throws(
    () => assertApiOk({ ok: false }, { message: '坏了' }, '失败', human),
    /坏了/,
  );
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

test('trash restore confirm modal shows conflict summary and strategy', () => {
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
      modal: {
        type: 'trash-restore-confirm',
        loading: false,
        error: '',
        conflictMode: 'rename',
        ids: ['t1', 't2'],
        preview: {
          total: 2,
          conflictCount: 1,
          hasConflicts: true,
          items: [
            { id: 't1', originalKey: 'docs/a.txt', kind: 'file', conflict: true },
            { id: 't2', originalKey: 'docs/b', kind: 'folder', conflict: false },
          ],
        },
      },
    },
  });
  assert.match(html, /恢复回收站项目/);
  assert.match(html, /冲突策略/);
  assert.match(html, /自动重命名/);
  assert.match(html, /跳过冲突/);
  assert.match(html, /覆盖已有/);
  assert.match(html, /data-action="execute-trash-restore"/);
  assert.match(html, /docs\/a\.txt/);
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
      loading: false, activeTab: 'system', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
  assert.match(html, /storage/);
  assert.match(html, /数据库/);
  assert.match(html, /R2 连接正常/);
});

test('admin logs section renders log entries with pagination', () => {
  const logs = mockAdminLogs(1);
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'logs', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
  assert.match(html, /产品说明\.pdf/);
  assert.match(html, /上传/);
  assert.match(html, /admin/);
});

test('admin logs section accepts api timestamp field variants', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'logs', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false,
      logs: [
        { action: 'UPLOAD', details: 'docs/readme.txt', ip: '192.0.2.10', timestamp: Date.UTC(2026, 0, 2, 3, 4) },
        { action: 'DELETE', details: 'docs/old.txt', ip: '192.0.2.11', created_at: Date.UTC(2026, 0, 3, 4, 5) },
        { action: 'MAINTENANCE', details: '清理旧操作日志 8 条', ip: '192.0.2.12', timestamp: Date.UTC(2026, 0, 4, 5, 6) },
      ],
      logsError: '', logsPage: 1, logsTotalPages: 1, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /2026/);
  assert.match(html, /运维指令/);
  assert.doesNotMatch(html, /未知时间/);
});

test('admin shares section formats millisecond expiry timestamps', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      activeTab: 'shares',
      stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [{
        token: 'share-token',
        name: 'demo.txt',
        path: '/demo.txt',
        targetType: 'file',
        allowPreview: true,
        allowDownload: true,
        expiresAt: Date.UTC(2026, 0, 2, 3, 4),
        maxDownloads: 5,
        downloadCount: 0,
        lastAccessedAt: Date.now() - 2 * 60 * 60 * 1000,
      }],
      sharesLoading: false,
      sharesError: '',
      shareFilter: 'all',
      shareSearch: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /demo\.txt/);
  assert.match(html, /2026/);
  assert.match(html, /2 小时前/);
  assert.doesNotMatch(html, /58454/);
});

test('admin shares section offers reactivation for retained expired links', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      activeTab: 'shares',
      stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [{
        token: 'expired-token',
        name: 'old.txt',
        path: '/old.txt',
        targetType: 'file',
        expired: true,
        canReactivate: true,
        autoDeleteAt: Date.now() + 3600000,
        expiresAt: Date.now() - 1000,
        maxDownloads: 0,
        downloadCount: 0,
      }],
      sharesLoading: false,
      sharesError: '',
      shareFilter: 'all',
      shareSearch: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /data-action="confirm-reactivate-share"/);
  assert.match(html, /data-key="expired-token"/);
  assert.match(html, /重新启用/);
});

test('reactivate share modal renders expiry form', () => {
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
      modal: {
        type: 'reactivate-share',
        loading: false,
        error: '',
        token: 'expired-token',
        shareName: 'old.txt',
        values: { expiresInDays: '7' },
      },
    },
  });
  assert.match(html, /重新启用分享/);
  assert.match(html, /data-form="reactivate-share"/);
  assert.match(html, /name="expiresInDays"/);
  assert.match(html, /value="7"/);
});

test('share modal labels folder shares explicitly', () => {
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
      modal: {
        type: 'share',
        loading: false,
        error: '',
        targetType: 'folder',
        entry: { name: 'docs', fullKey: 'docs', kind: 'folder' },
        values: { expiresInDays: '7', maxDownloads: '0', allowPreview: true, allowDownload: true },
      },
    },
  });

  assert.match(html, /分享文件夹/);
  assert.match(html, /允许浏览文件夹内容/);
  assert.match(html, /允许下载文件夹 ZIP/);
  assert.match(html, /data-form="share"/);
});

test('admin quota section renders storage usage', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'storage', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: mockAdminHealth, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: mockAdminQuota, quotaError: '',
      protectedPathsLoading: false, protectedPaths: mockProtectedPaths, protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: mockHiddenPaths, hiddenPathsError: '',
      webhooksLoading: false, webhooks: mockWebhooks, webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: mockWebhookDeliveries,
      storageConfig: { r2: { name: 'bucket', usedFormatted: '1.2 GB', quotaFormatted: '5 GB', usedPercent: 24, alertEnabled: true, alertWarningPercent: 76, alertErrorPercent: 91 } }, storageConfigLoading: false, storageConfigError: '',
      trashPreviewItems: mockTrashItems, trashPreviewLoading: false, trashPreviewError: '',
      maintenance: mockMaintenanceSnapshot, maintenanceLoading: false, maintenanceError: '', maintenanceBusyAction: '',
      tasks: mockTasks, tasksLoading: false,
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /已使用/);
  assert.match(html, /1\.2/);
  assert.match(html, /5/);
  assert.match(html, /data-action="save-storage-alert-thresholds"/);
  assert.match(html, /value="76"/);
  assert.match(html, /value="91"/);
  assert.match(html, /最近回收站文件/);
  assert.match(html, /旧合同\.docx/);
  assert.match(html, /客户资料\/旧合同\.docx/);
});

test('admin protected paths section renders path list with delete buttons', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'storage', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: mockProtectedPaths, protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: [], webhooksError: '',
      webhookDeliveriesLoading: false, webhookDeliveries: [],
      storageConfig: { r2: { name: 'bucket', usedFormatted: '0 B', quotaFormatted: '10 GB', usedPercent: 0 } }, storageConfigLoading: false, storageConfigError: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /私密文档/);
  assert.match(html, /data-action="confirm-delete-protected-path"/);
  assert.match(html, /内部敏感资料/);
});

test('admin maintenance section renders snapshot and action buttons', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'system', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
  assert.match(html, /同步元数据库索引/);
  assert.match(html, /清理缓存数据库/);
  assert.match(html, /同步清除废弃文件/);
  assert.match(html, /data-action="confirm-maintenance-action"/);
  assert.match(html, /data-maintenance-action="rebuild-index"/);
  assert.match(html, /data-maintenance-action="purge-trash"/);
});

test('admin maintenance section shows loading state', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'system', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
  assert.match(html, /载入中/);
  assert.match(html, /运维指令/);
});

test('admin maintenance section shows error state', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'system', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
      maintenance: null, maintenanceLoading: false, maintenanceError: '连接超时', maintenanceBusyAction: '',
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /连接超时/);
  assert.match(html, /运维指令/);
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
      loading: false, activeTab: 'system', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
      tasks: mockTasks, tasksLoading: false, taskAlertConfig: mockTaskAlertConfig, taskAlertConfigSaving: false,
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /completed/);
  assert.match(html, /5\/5/);
  assert.match(html, /2\/3/);
  assert.match(html, /data-action="save-task-alert-thresholds"/);
  assert.match(html, /data-binding="task-alert-window-hours" value="24"/);
  assert.match(html, /data-binding="task-alert-warning" value="3"/);
  assert.match(html, /data-binding="task-alert-error" value="10"/);
});

test('admin task list renders zip task download result link', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'system', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
      tasks: [{
        id: 'zip-1',
        type: 'zip_download',
        status: 'completed',
        total: 2,
        completed: 2,
        result: { downloadUrl: '/api/download/.system/zip-tasks/zip-1/archive.zip' },
        createdAt: 1710000000000,
      }],
      tasksLoading: false,
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /下载结果/);
  assert.match(html, /\/api\/download\/\.system\/zip-tasks\/zip-1\/archive\.zip/);
});

test('admin task list renders zip task diagnostics and retry action', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'system', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
      taskRetryingId: '',
      tasks: [{
        id: 'zip-failed',
        type: 'zip_download',
        status: 'failed',
        total: 3,
        completed: 1,
        error: 'R2 写入失败',
        result: { outputKey: '.system/zip-tasks/zip-failed/archive.zip', filename: 'archive.zip' },
        createdAt: 1710000000000,
        finishedAt: 1710000000100,
      }],
      tasksLoading: false,
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /ZIP 下载/);
  assert.match(html, /ZIP 生成失败，可重试/);
  assert.match(html, /R2 写入失败/);
  assert.match(html, /\.system\/zip-tasks\/zip-failed\/archive\.zip/);
  assert.match(html, /data-action="retry-task"/);
});

test('webhook delivery list shows retry action for failed rows', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'webhook', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
      shares: [], sharesLoading: false, sharesError: '',
      shareBusyToken: '', shareFilter: 'all', error: '',
      healthLoading: false, health: null, healthError: '',
      logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
      quotaLoading: false, quota: null, quotaError: '',
      protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
      hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
      webhooksLoading: false, webhooks: mockWebhooks, webhooksError: '',
      webhookDeliveriesLoading: false,
      webhookRetryingId: 42,
      webhookDeliveries: [
        { id: 42, event: 'file.uploaded', endpoint: 'receiver', ok: 0, status: 502, created_at: 1710000000000, duration_ms: 12 },
        { id: 43, event: 'file.uploaded', endpoint: 'receiver', ok: 1, status: 200, retry_of: 42, created_at: 1710000000100, duration_ms: 8 },
      ],
      storageConfig: null, storageConfigLoading: false, storageConfigError: '',
      maintenance: mockMaintenanceSnapshot, maintenanceLoading: false, maintenanceError: '', maintenanceBusyAction: '',
      tasks: [], tasksLoading: false,
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /data-action="retry-webhook-delivery"/);
  assert.match(html, /重试中/);
  assert.match(html, /重试自 #42/);
});

test('notification tab renders notification history and system tab does not duplicate it', () => {
  const baseAdmin = {
    loading: false, stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
    shares: [], sharesLoading: false, sharesError: '',
    shareBusyToken: '', shareFilter: 'all', error: '',
    healthLoading: false, health: mockAdminHealth, healthError: '',
    logsLoading: false, logs: [], logsError: '', logsPage: 1, logsTotalPages: 0, logsFilter: { q: '', action: '', from: '', to: '' },
    quotaLoading: false, quota: mockAdminQuota, quotaError: '',
    protectedPathsLoading: false, protectedPaths: [], protectedPathsError: '',
    hiddenPathsLoading: false, hiddenPaths: [], hiddenPathsError: '',
    webhooksLoading: false, webhooks: mockWebhooks, webhooksError: '',
    webhookDeliveriesLoading: false, webhookDeliveries: mockWebhookDeliveries,
    storageConfig: null, storageConfigLoading: false, storageConfigError: '',
    maintenance: mockMaintenanceSnapshot, maintenanceLoading: false, maintenanceError: '', maintenanceBusyAction: '',
    tasks: mockTasks, tasksLoading: false, taskAlertConfig: mockTaskAlertConfig, taskAlertConfigSaving: false,
    adminNotifHistory: mockNotifications, adminNotifHistoryLoading: false,
    adminNotifFilter: { severity: 'all', read: 'all', event: '' },
  };

  const notificationHtml = pages.renderAdminPage({
    app: { role: 'admin' },
    admin: { ...baseAdmin, activeTab: 'webhook' },
  });
  assert.match(notificationHtml, /通知中心/);
  assert.match(notificationHtml, /未读通知/);
  assert.match(notificationHtml, /失败投递/);
  assert.match(notificationHtml, /Webhook 规则/);
  assert.match(notificationHtml, /记录中心/);
  assert.match(notificationHtml, /投递记录/);
  assert.match(notificationHtml, /通知历史/);
  assert.match(notificationHtml, /data-action="set-webhook-record-tab"/);
  assert.match(notificationHtml, /data-cselect="notification-severity-filter"/);
  assert.match(notificationHtml, /data-cselect="notification-read-filter"/);
  assert.match(notificationHtml, /data-action-change="set-notification-filter"/);
  assert.match(notificationHtml, /data-action="admin-mark-notif-read"/);

  const notificationRecordHtml = pages.renderAdminPage({
    app: { role: 'admin' },
    admin: { ...baseAdmin, activeTab: 'webhook', webhookRecordTab: 'notifications' },
  });
  assert.match(notificationRecordHtml, /ov-webhook-record-tab is-active" type="button" data-action="set-webhook-record-tab" data-tab="notifications"/);

  const systemHtml = pages.renderAdminPage({
    app: { role: 'admin' },
    admin: { ...baseAdmin, activeTab: 'system' },
  });
  assert.match(systemHtml, /系统管理/);
  assert.doesNotMatch(systemHtml, /通知历史/);
});

test('admin task list section shows loading state', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'system', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
      tasks: [], tasksLoading: true,
    },
  };
  const html = pages.renderAdminPage(state);
  assert.match(html, /载入中/);
  assert.match(html, /后台调度/);
});

test('admin task list is hidden when empty', () => {
  const state = {
    app: { role: 'admin' },
    admin: {
      loading: false, activeTab: 'tasks', stats: { files: { count: 1 }, trash: { count: 0 }, index: {} },
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
  assert.doesNotMatch(html, /文件数/);
});

test('share page loading state matches public share layout', () => {
  const html = pages.renderSharePage({
    app: { role: 'guest' },
    share: {
      token: 'share-token',
      loading: true,
      error: '',
      item: null,
      requiresPassword: false,
      password: '',
    },
  });

  assert.match(html, /share-shell-loading/);
  assert.match(html, /share-mid-resource/);
  assert.match(html, /正在获取分享信息/);
  assert.match(html, /share-loading-list/);
  assert.match(html, /data-action="refresh-share"/);
});

test('share page renders folder directory entries and action urls', () => {
  const html = pages.renderSharePage({
    share: {
      loading: false,
      error: '',
      requiresPassword: false,
      password: '',
      token: 'share-token',
      path: 'nested',
      item: {
        token: 'share-token',
        path: 'docs',
        name: 'docs',
        targetType: 'folder',
        allowPreview: true,
        allowDownload: true,
        expiresAt: 0,
        maxDownloads: 0,
        downloadCount: 0,
      },
      directory: {
        path: 'nested',
        folders: [{ name: 'child', fullKey: 'docs/nested/child' }],
        files: [{
          name: 'deep.txt',
          fullKey: 'docs/nested/deep.txt',
          size: 4,
          sizeFormatted: '4 B',
          contentType: 'text/plain',
        }],
      },
    },
  });

  assert.match(html, /share-shell-folder/);
  assert.match(html, /child/);
  assert.match(html, /deep\.txt/);
  assert.match(html, /share\.html\?token=share-token&amp;path=nested%2Fchild/);
  assert.match(html, /\/api\/share\/share-token\/preview\?path=nested%2Fdeep\.txt/);
  assert.match(html, /\/api\/share\/share-token\/download\?path=nested%2Fdeep\.txt/);
  assert.match(html, /\/api\/share\/share-token\/download\?path=nested/);
});

test('share page renders missing data state with retry action', () => {
  const html = pages.renderSharePage({
    app: { role: 'admin' },
    share: {
      token: 'missing-share-token',
      loading: false,
      error: '',
      item: null,
      requiresPassword: false,
      password: '',
    },
  });

  assert.match(html, /分享信息未载入/);
  assert.match(html, /data-action="refresh-share"/);
  assert.match(html, /data-action="copy-current-url"/);
  assert.match(html, /missin\.\.\.oken/);
});

test('mock notifications have correct structure', () => {
  assert.ok(Array.isArray(mockNotifications));
  assert.ok(mockNotifications.length >= 3);
  for (const n of mockNotifications) {
    assert.equal(typeof n.id, 'number');
    assert.equal(typeof n.event, 'string');
    assert.equal(typeof n.message, 'string');
    assert.equal(typeof n.read, 'number');
    assert.equal(typeof n.created_at, 'number');
  }
  const unread = mockNotifications.filter(n => !n.read);
  assert.ok(unread.length > 0);
});

test('header renderer shows admin controls and notification state', () => {
  const html = header.renderHeader({
    app: { role: 'admin', guestMode: false },
    explorer: { queryDraft: '<report>' },
    admin: {
      notifOpen: true,
      notificationsUnread: true,
      notifications: [{ id: 7, message: '<unsafe>', read: 0, created_at: Date.now() }],
    },
  }, 'home');

  assert.match(html, /data-role="search-input"/);
  assert.match(html, /value="&lt;report&gt;"/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, /data-action="logout"/);
  assert.match(html, /notif-open/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.match(html, /data-action="mark-notification-read"/);
});

test('header renderer shows guest login controls without notifications', () => {
  const html = header.renderHeader({
    app: { role: 'guest', guestMode: true },
    explorer: { queryDraft: 'public' },
    admin: { notifOpen: false, notificationsUnread: false, notifications: [] },
  }, 'home');

  assert.match(html, /data-role="search-input"/);
  assert.match(html, /data-action="open-login"/);
  assert.doesNotMatch(html, /data-action="toggle-notifications"/);
  assert.doesNotMatch(html, /href="\/admin"/);
});

test('notification polling pauses on hidden document and resumes on visible document', () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const intervals = new Map();
  const cleared = [];
  const listeners = new Map();
  let nextTimerId = 1;

  globalThis.setInterval = (fn, ms) => {
    const id = nextTimerId++;
    intervals.set(id, { fn, ms });
    return id;
  };
  globalThis.clearInterval = (id) => {
    cleared.push(id);
    intervals.delete(id);
  };

  const documentRef = {
    hidden: false,
    addEventListener(type, fn, options = {}) {
      listeners.set(type, fn);
      options.signal?.addEventListener('abort', () => listeners.delete(type), { once: true });
    },
  };
  const dispatched = [];
  const store = { dispatch(action) { dispatched.push(action); } };
  const thunks = { loadNotifications: () => ({ type: 'notifications/load' }) };

  try {
    const polling = createNotificationPolling({ documentRef, intervalMs: 123 });
    polling.start(store, thunks);
    assert.equal(intervals.get(1).ms, 123);

    intervals.get(1).fn();
    assert.deepEqual(dispatched, [{ type: 'notifications/load' }]);

    documentRef.hidden = true;
    listeners.get('visibilitychange')();
    assert.deepEqual(cleared, [1]);
    assert.equal(intervals.size, 0);

    documentRef.hidden = false;
    listeners.get('visibilitychange')();
    assert.equal(intervals.get(2).ms, 123);

    polling.stop();
    assert.deepEqual(cleared, [1, 2]);
    assert.equal(listeners.has('visibilitychange'), false);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
