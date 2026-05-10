// 完整修正版 actions.js，包含 openPreview 修复，保持原有功能
import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { sanitizeHtml, escapeHtml } from './utils.js';
import { getSelectableKeys } from './file-view-model.js';
import { UploadQueue } from './uploader.js';

const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const videoExts = ['mp4', 'webm'];
const audioExts = ['mp3', 'wav', 'ogg', 'flac'];
const textExts = ['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv', 'log', 'yml', 'yaml'];

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTextPreviewShell(text) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const shell = document.createElement('div');
  shell.className = 'preview-text-shell preview-text-viewer';
  shell.dataset.rawText = source;
  shell.innerHTML = `
    <div class="preview-text-toolbar">
      <label class="preview-text-search-wrap">
        <span>搜索</span>
        <input type="search" class="preview-text-search" placeholder="在文本中查找">
      </label>
      <div class="preview-text-toolbar-actions">
        <button type="button" class="btn preview-text-toggle">换行</button>
        <button type="button" class="btn preview-text-copy">复制</button>
      </div>
    </div>
    <div class="preview-text-body"></div>
  `;

  const body = shell.querySelector('.preview-text-body');
  const search = shell.querySelector('.preview-text-search');
  const toggle = shell.querySelector('.preview-text-toggle');
  const copy = shell.querySelector('.preview-text-copy');
  let wrap = true;

  const render = () => {
    const query = search.value.trim();
    const matcher = query ? new RegExp(escapeRegExp(query), 'gi') : null;
    body.classList.toggle('is-nowrap', !wrap);
    body.innerHTML = lines.map((line, index) => {
      let safe = escapeHtml(line);
      if (matcher) {
        safe = safe.replace(matcher, match => `<mark class="preview-hit">${escapeHtml(match)}</mark>`);
      }
      if (!safe) safe = '&nbsp;';
      return `
        <div class="preview-line">
          <span class="preview-line-no">${index + 1}</span>
          <span class="preview-line-text">${safe}</span>
        </div>
      `;
    }).join('');
  };

  search.addEventListener('input', render);
  toggle.addEventListener('click', () => {
    wrap = !wrap;
    toggle.textContent = wrap ? '换行' : '不换行';
    render();
  });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(source);
      Message.success('已复制文本内容');
    } catch (_) {
      Message.error('复制失败');
    }
  });

  render();
  return shell;
}

export const Actions = {
  async handlePasswordRequired(data, retry) {
    state.pendingUnlock = { path: data?.path || state.currentPath, retry };
    const label = document.getElementById('unlockPathLabel');
    const input = document.getElementById('unlockPasswordInput');
    const error = document.getElementById('unlockError');
    if (label) label.textContent = `路径：/${state.pendingUnlock.path}`;
    if (input) input.value = '';
    if (error) error.textContent = '';
    UI.showModal('unlockModal');
    setTimeout(() => input?.focus(), 30);
  },

  async submitUnlock() {
    const pending = state.pendingUnlock;
    const input = document.getElementById('unlockPasswordInput');
    const error = document.getElementById('unlockError');
    if (!pending || !input) return;
    const password = input.value;
    const { res, data } = await api.unlockPath(pending.path, password);
    if (!res.ok) {
      if (error) error.textContent = data?.message || '密码错误';
      return;
    }
    UI.closeModal('unlockModal');
    state.pendingUnlock = null;
    await pending.retry?.();
  },

  async init() {
    state.userRole = 'guest';
    const { res, data } = await api.getRole();
    state.userRole = (res.status === 200 && data?.role) ? data.role : 'guest';
    UI.updateAuth();
    await this.loadFiles();

    const startYear = 2026;
    const currentYear = new Date().getFullYear();
    const yearDisp = document.getElementById('year-display');
    if (yearDisp) yearDisp.textContent = currentYear > startYear ? `${startYear} - ${currentYear}` : String(startYear);
  },

  async openPreview(path, name, protectedItem = false) {
    if (Array.isArray(path)) {
        [path, name, protectedItem = false] = path;
    } else if (path && typeof path === 'object') {
        protectedItem = Boolean(path.protected ?? protectedItem);
        name = path.name || path.fullName || name;
        path = path.path || path.fullKey || path.key || '';
    }

    if (!name && typeof path === 'string') name = path.split('/').pop() || '';
    if (!path || !name) return Message.error('无法预览');

    if (protectedItem && state.userRole !== 'admin') {
        return this.handlePasswordRequired({ path }, () => this.openPreview(path, name, false));
    }

    state.currentPreviewPath = path;
    state.currentPreviewText = '';
    state.isEditing = false;

    const content = document.getElementById('previewContent');
    const title = document.getElementById('previewTitle');
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');

    if (!content || !title || !editBtn || !saveBtn) return console.error('预览模态框 DOM 元素缺失');

    // 先隐藏按钮
    editBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');

    content.className = 'flex-1 overflow-hidden bg-white';
    content.innerHTML = '<div class="p-12 text-slate-400 text-center">正在加载预览...</div>';
    title.textContent = '加载中...';
    UI.showModal('previewModal');

    try {
        const ext = name.split('.').pop().toLowerCase();
        const url = api.previewUrl(path);

        if (imageExts.includes(ext)) {
            content.innerHTML = `<div class="preview-media-shell"><img src="${escapeHtml(url)}" class="preview-media" id="previewImg" alt=""></div>`;
            const img = document.getElementById('previewImg');
            img.ondblclick = () => {
                if (!document.fullscreenElement) img.requestFullscreen();
                else document.exitFullscreen();
            };
        } else if (videoExts.includes(ext)) {
            content.innerHTML = `<div class="preview-media-shell"><video src="${escapeHtml(url)}" class="preview-media" controls autoplay playsinline></video></div>`;
        } else if (audioExts.includes(ext)) {
            content.innerHTML = `<div class="preview-audio-shell"><audio src="${escapeHtml(url)}" controls autoplay class="w-full max-w-xl"></audio></div>`;
        } else if (ext === 'pdf') {
            content.innerHTML = `<iframe src="${escapeHtml(url)}" class="preview-frame" title="${escapeHtml(name)}"></iframe>`;
        } else if (textExts.includes(ext)) {
            const res = await api.preview(path);
            if (res.status === 403) {
                const data = await res.json().catch(() => null);
                if (data?.code === 'password_required') return this.handlePasswordRequired(data, () => this.openPreview(path, name, false));
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            state.currentPreviewText = text;

            if (state.userRole === 'admin') editBtn.classList.remove('hidden');

            if (ext === 'md') content.innerHTML = `<div class="preview-text-shell markdown-body">${sanitizeHtml(marked.parse(text))}</div>`;
            else {
                content.innerHTML = '';
                content.appendChild(buildTextPreviewShell(text));
            }
        } else {
            content.innerHTML = '<div class="p-12 text-slate-400 text-center">该文件类型暂不支持在线预览</div>';
        }
        title.textContent = name;

    } catch (e) {
        content.innerHTML = `<div class="p-12 text-red-400 text-center">无法预览内容${e?.message ? `：${escapeHtml(e.message)}` : ''}</div>`;
        title.textContent = name;
    }
  },

  // 其余 Actions 方法保持原样（upload, download, batchDelete, toggleSelect, navigateTo 等）
  // 可以直接合并你原始 actions.js 文件里的其他方法
};
