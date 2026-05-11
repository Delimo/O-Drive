import { state } from './state.js';
import { api } from './api.js';
import { UI, Message } from './ui.js';
import { sanitizeHtml, escapeHtml } from './utils.js';
import { renderMarkdown } from './markdown-renderer.js';
import { audioExts, imageExts, textExts, videoExts } from './file-types.js';

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let unlockCountdownTimer = null;

function formatRetryAfter(seconds) {
  const total = Math.max(1, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes ? `${minutes} 分 ${rest} 秒` : `${rest} 秒`;
}

function showUnlockCountdown(error, retryAfter) {
  clearInterval(unlockCountdownTimer);
  let remaining = Math.max(1, Number(retryAfter || 0));
  const render = () => {
    if (error) error.textContent = `密码错误次数过多，请 ${formatRetryAfter(remaining)} 后重试`;
  };
  render();
  unlockCountdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(unlockCountdownTimer);
      if (error) error.textContent = '现在可以重新尝试';
      return;
    }
    render();
  }, 1000);
}

function appendHighlighted(target, line, query) {
  if (!query) {
    target.textContent = line || '\u00a0';
    return;
  }
  const matcher = new RegExp(escapeRegExp(query), 'gi');
  let lastIndex = 0;
  let match;
  while ((match = matcher.exec(line)) !== null) {
    if (match.index > lastIndex) target.appendChild(document.createTextNode(line.slice(lastIndex, match.index)));
    const mark = document.createElement('mark');
    mark.className = 'preview-hit';
    mark.textContent = match[0];
    target.appendChild(mark);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) target.appendChild(document.createTextNode(line.slice(lastIndex)));
  if (!target.childNodes.length) target.textContent = '\u00a0';
}

function buildTextPreviewShell(text) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const shell = document.createElement('div');
  shell.className = 'preview-text-shell preview-text-viewer';
  shell.dataset.rawText = source;

  const toolbar = document.createElement('div');
  toolbar.className = 'preview-text-toolbar';
  const label = document.createElement('label');
  label.className = 'preview-text-search-wrap';
  const labelText = document.createElement('span');
  labelText.textContent = '搜索';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'preview-text-search';
  search.placeholder = '在文本中查找';
  label.append(labelText, search);

  const actions = document.createElement('div');
  actions.className = 'preview-text-toolbar-actions';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn preview-text-toggle';
  toggle.textContent = '换行';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn preview-text-copy';
  copy.textContent = '复制';
  actions.append(toggle, copy);
  toolbar.append(label, actions);

  const body = document.createElement('div');
  body.className = 'preview-text-body';
  shell.append(toolbar, body);
  let wrap = true;

  const render = () => {
    const query = search.value.trim();
    body.classList.toggle('is-nowrap', !wrap);
    body.replaceChildren();
    lines.forEach((line, index) => {
      const row = document.createElement('div');
      row.className = 'preview-line';
      const no = document.createElement('span');
      no.className = 'preview-line-no';
      no.textContent = String(index + 1);
      const textEl = document.createElement('span');
      textEl.className = 'preview-line-text';
      appendHighlighted(textEl, line, query);
      row.append(no, textEl);
      body.appendChild(row);
    });
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

export const PreviewActions = {
  async handlePasswordRequired(data, retry) {
    state.pendingUnlock = { path: data?.path || state.currentPath, retry };
    const label = document.getElementById('unlockPathLabel');
    const input = document.getElementById('unlockPasswordInput');
    const error = document.getElementById('unlockError');
    if (label) label.textContent = `路径：${state.pendingUnlock.path}`;
    if (input) input.value = '';
    clearInterval(unlockCountdownTimer);
    if (error) error.textContent = '';
    UI.showModal('unlockModal');
    setTimeout(() => input?.focus(), 30);
  },

  async submitUnlock() {
    const pending = state.pendingUnlock;
    const input = document.getElementById('unlockPasswordInput');
    const error = document.getElementById('unlockError');
    if (!pending || !input) return;
    const { res, data } = await api.unlockPath(pending.path, input.value);
    if (!res.ok) {
      if (res.status === 429 && data?.retryAfter) {
        showUnlockCountdown(error, data.retryAfter);
        return;
      }
      if (error) error.textContent = data?.message || '密码错误';
      return;
    }
    clearInterval(unlockCountdownTimer);
    UI.closeModal('unlockModal');
    state.pendingUnlock = null;
    await pending.retry?.();
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
    if (!path || !name) {
      Message.error('无法预览');
      return;
    }
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
    const url = api.previewUrl(path);
    const ext = name.split('.').pop().toLowerCase();

    const canEdit = state.userRole === 'admin';
    editBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');
    editBtn.hidden = true;
    saveBtn.hidden = true;
    editBtn.disabled = !canEdit;
    saveBtn.disabled = !canEdit;
    title.textContent = '加载中...';
    content.className = 'flex-1 overflow-hidden bg-white';
    content.innerHTML = '<div class="p-12 text-slate-400 text-center">正在加载预览...</div>';
    UI.showModal('previewModal');

    try {
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
        if (canEdit) {
          editBtn.classList.remove('hidden');
          editBtn.hidden = false;
        }
        if (ext === 'md') content.innerHTML = `<div class="preview-text-shell markdown-body">${sanitizeHtml(renderMarkdown(text))}</div>`;
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
    }
  },

  toggleEditMode() {
    if (state.userRole !== 'admin') return;
    const pre = document.getElementById('textContent') || document.querySelector('.markdown-body');
    const rawText = state.currentPreviewText || pre?.innerText || pre?.textContent || '';
    if (!pre && !rawText) return;
    const textarea = document.createElement('textarea');
    textarea.className = 'preview-edit-area';
    textarea.id = 'editArea';
    textarea.value = rawText;
    document.getElementById('previewContent').innerHTML = '';
    document.getElementById('previewContent').appendChild(textarea);
    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    editBtn.classList.add('hidden');
    editBtn.hidden = true;
    saveBtn.classList.remove('hidden');
    saveBtn.hidden = false;
  },

  async saveTextContent() {
    if (state.userRole !== 'admin') return;
    const { res } = await api.saveText(state.currentPreviewPath, document.getElementById('editArea').value);
    if (res.ok) {
      Message.success('已保存');
      UI.closePreview();
      await window.Actions?.loadFiles?.();
    } else {
      Message.error('失败');
    }
  },
};
