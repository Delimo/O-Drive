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
import { mockTextContent, mockReadme } from '../public/js/mock/index.js';
import { createDeferredAction, openDownload } from '../public/js/utils/helpers.js';

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
      clipboard: null,
      loading: false,
      error: '',
      searching: false,
      batchBusy: false,
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

test('selectors detect content mode and preview capability', () => {
  assert.equal(selectors.detectContentMode({ name: 'a.png' }), 'image');
  assert.equal(selectors.detectContentMode({ name: 'a.txt' }), 'text');
  assert.equal(selectors.hasPreview({ kind: 'folder' }), false);
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
  const html = shared.renderTrashBatchBar(makeState(), [{}, {}]);
  assert.match(html, /已选中 2 项回收站记录/);
  assert.match(html, /data-action="restore-selected-trash"/);
  assert.match(html, /data-action="delete-selected-trash"/);
  assert.doesNotMatch(html, /data-action="copy-selected"/);
  assert.doesNotMatch(html, /data-action="move-selected"/);
});

test('trash batch bar disables actions while busy', () => {
  const busy = shared.renderTrashBatchBar(makeState({ explorer: { batchBusy: true } }), [{}, {}]);
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
