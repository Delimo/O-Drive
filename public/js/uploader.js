import { api } from './api.js';
import { UI } from './ui.js';
import { escapeHtml } from './utils.js';

const PART_SIZE = 8 * 1024 * 1024;
const MULTIPART_THRESHOLD = 16 * 1024 * 1024;
const FILE_CONCURRENCY = 2;
const PART_RETRIES = 3;
const CANCEL_MESSAGE = '已取消';
const RESUME_KEY = 'odrive.multipartUploads.v1';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createUploadItem(file, taskId) {
  const item = document.createElement('div');
  item.className = 'upload-item p-4 border-b border-border bg-white';
  item.dataset.taskId = taskId;
  item.innerHTML = `
    <div class="flex items-center justify-between gap-3 text-[12px] mb-2 text-slate-500">
      <span class="font-semibold text-slate-900 truncate">${escapeHtml(file.displayName || file.name)}</span>
      <span class="pct text-primary font-mono flex-shrink-0">0%</span>
    </div>
    <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div class="progress-fill h-full bg-primary w-0 transition-all duration-300"></div>
    </div>
    <div class="mt-3 flex items-center justify-between gap-2">
      <span class="status text-[11px] text-slate-500">等待中</span>
      <div class="flex gap-2">
        <button class="pause-btn upload-control" data-upload-action="pause">暂停</button>
        <button class="retry-btn upload-control hidden" data-upload-action="retry">重试</button>
        <button class="cancel-btn upload-control danger" data-upload-action="cancel">取消</button>
      </div>
    </div>
  `;
  return item;
}

function updateProgress(task, loaded, total, status) {
  const pct = total ? Math.round((loaded / total) * 100) : 0;
  task.item.querySelector('.progress-fill').style.width = `${pct}%`;
  task.item.querySelector('.pct').textContent = `${pct}%`;
  if (status) task.item.querySelector('.status').textContent = status;
}

function readResumeStore() {
  try {
    return JSON.parse(localStorage.getItem(RESUME_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function writeResumeStore(store) {
  localStorage.setItem(RESUME_KEY, JSON.stringify(store));
}

function taskFingerprint(task) {
  return [
    task.targetDir,
    task.uploadName || task.file.name,
    task.file.size,
    task.file.lastModified || 0,
    task.conflictMode || 'error',
  ].join('|');
}

function rememberMultipart(task) {
  if (!task.key || !task.uploadId) return;
  const store = readResumeStore();
  store[taskFingerprint(task)] = {
    key: task.key,
    uploadId: task.uploadId,
    parts: task.parts || [],
    updatedAt: Date.now(),
  };
  writeResumeStore(store);
}

function forgetMultipart(task) {
  const store = readResumeStore();
  delete store[taskFingerprint(task)];
  writeResumeStore(store);
}

async function uploadSmall(task) {
  const xhr = new XMLHttpRequest();
  task.xhr = xhr;
  const target = task.targetDir.replace(/^\/|\/$/g, '');
  const suffix = target ? `/${target}` : '';
  xhr.open('POST', `/api/files${suffix}?conflict=${encodeURIComponent(task.conflictMode || 'error')}`, true);
  const csrf = api.csrfHeaders();
  Object.entries(csrf).forEach(([key, value]) => xhr.setRequestHeader(key, value));
  xhr.upload.onprogress = e => {
    if (e.lengthComputable) updateProgress(task, e.loaded, e.total, '上传中');
  };

  const done = new Promise((resolve, reject) => {
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText || 'null'); } catch (_) {}
      if (xhr.status === 200) {
        task.skipped = Boolean(data?.skipped);
        task.renamed = Boolean(data?.renamed);
        resolve();
      } else {
        reject(new Error(data?.message || `HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.onabort = () => reject(new Error(CANCEL_MESSAGE));
  });

  const fd = new FormData();
  fd.append('file', task.file, task.uploadName || task.file.name);
  xhr.send(fd);
  await done;
}

async function waitIfPaused(task) {
  while (task.paused && !task.cancelled) {
    task.item.querySelector('.status').textContent = '已暂停';
    await sleep(300);
  }
  if (task.cancelled) throw new Error(CANCEL_MESSAGE);
}

async function uploadPartWithRetry(task, partNumber, chunk) {
  for (let attempt = 1; attempt <= PART_RETRIES; attempt++) {
    await waitIfPaused(task);
    try {
      const { res, data } = await api.multipartPart({
        key: task.key,
        uploadId: task.uploadId,
        partNumber,
        chunk,
      });
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      return data;
    } catch (e) {
      if (task.cancelled || attempt === PART_RETRIES) throw e;
      task.item.querySelector('.status').textContent = `重试第 ${partNumber} 片`;
      await sleep(800 * attempt);
    }
  }
}

async function uploadMultipart(task) {
  const saved = readResumeStore()[taskFingerprint(task)];
  if (saved?.key && saved?.uploadId && Array.isArray(saved.parts)) {
    task.key = saved.key;
    task.uploadId = saved.uploadId;
    task.parts = saved.parts;
    task.item.querySelector('.status').textContent = '继续未完成的上传';
  } else {
    const create = await api.multipartCreate({
      targetDir: task.targetDir,
      name: task.uploadName || task.file.name,
      type: task.file.type,
      size: task.file.size,
      conflict: task.conflictMode || 'error',
    });
    if (!create.res.ok) throw new Error(create.data?.message || '无法创建分片上传');
    if (create.data?.skipped) {
      task.skipped = true;
      return;
    }
    task.key = create.data.key;
    task.uploadId = create.data.uploadId;
    task.parts = [];
    task.renamed = Boolean(create.data?.renamed);
    rememberMultipart(task);
  }

  const partCount = Math.ceil(task.file.size / PART_SIZE);
  const completed = new Set((task.parts || []).map(part => Number(part.partNumber)));
  for (let i = 0; i < partCount; i++) {
    await waitIfPaused(task);
    const start = i * PART_SIZE;
    const end = Math.min(start + PART_SIZE, task.file.size);
    if (completed.has(i + 1)) {
      updateProgress(task, end, task.file.size, `已恢复 ${i + 1}/${partCount}`);
      continue;
    }
    const chunk = task.file.slice(start, end);
    task.item.querySelector('.status').textContent = `上传中 ${i + 1}/${partCount}`;
    const part = await uploadPartWithRetry(task, i + 1, chunk);
    task.parts.push(part);
    rememberMultipart(task);
    updateProgress(task, end, task.file.size);
  }

  const complete = await api.multipartComplete({
    key: task.key,
    uploadId: task.uploadId,
    parts: task.parts,
  });
  if (!complete.res.ok) throw new Error(complete.data?.message || '无法完成分片上传');
  forgetMultipart(task);
}

async function abortTask(task) {
  task.cancelled = true;
  task.xhr?.abort();
  if (task.key && task.uploadId) {
    try {
      await api.multipartAbort({ key: task.key, uploadId: task.uploadId });
    } catch (_) {}
    forgetMultipart(task);
  }
}

function collectSummary(tasks) {
  return {
    total: tasks.length,
    success: tasks.filter(t => t.state === 'success').length,
    failed: tasks.filter(t => t.state === 'failed').length,
    cancelled: tasks.filter(t => t.state === 'cancelled').length,
    running: tasks.filter(t => t.state === 'running').length,
    queued: tasks.filter(t => t.state === 'queued').length,
  };
}

export class UploadQueue {
  constructor({ onComplete } = {}) {
    this.queue = [];
    this.active = 0;
    this.tasks = [];
    this.tasksById = new Map();
    this.onComplete = onComplete;
    this.closeTimer = null;
    this.boundListEvents = false;
  }

  get summary() {
    return collectSummary(this.tasks);
  }

  renderSummary() {
    const summary = this.summary;
    const label = document.getElementById('uploadSummary');
    const retryBtn = document.getElementById('uploadRetryFailed');
    if (label) {
      label.textContent = `${summary.success}/${summary.total} 已完成`;
      if (summary.failed) label.textContent += ` · ${summary.failed} 失败`;
      else if (summary.cancelled) label.textContent += ` · ${summary.cancelled} 已取消`;
    }
    if (retryBtn) retryBtn.classList.toggle('hidden', summary.failed === 0);
  }

  bindListEvents(list) {
    if (this.boundListEvents || !list) return;
    this.boundListEvents = true;
    list.addEventListener('click', event => {
      const button = event.target.closest('[data-upload-action]');
      if (!button) return;
      const taskEl = button.closest('[data-task-id]');
      const task = taskEl ? this.tasksById.get(taskEl.dataset.taskId) : null;
      if (!task) return;
      const action = button.dataset.uploadAction;
      if (action === 'pause') {
        task.paused = !task.paused;
        button.textContent = task.paused ? '继续' : '暂停';
        return;
      }
      if (action === 'cancel') {
        abortTask(task);
        return;
      }
      if (action === 'retry') {
        this.retryTask(task);
      }
    });
  }

  scheduleAutoClose() {
    const { total, success, failed, cancelled } = this.summary;
    const settled = success + failed + cancelled;
    clearTimeout(this.closeTimer);
    if (total > 0 && settled === total && failed === 0) {
      this.closeTimer = setTimeout(() => UI.closeUploadManager(), 900);
    }
  }

  markSuccess(task) {
    task.state = 'success';
    const label = task.skipped ? '已跳过' : task.renamed ? '已自动重命名' : '完成';
    updateProgress(task, task.file.size, task.file.size, label);
    task.item.querySelector('.progress-fill').className = 'progress-fill h-full bg-emerald-500 w-full';
    task.item.querySelector('.pause-btn')?.remove();
    task.item.querySelector('.cancel-btn')?.remove();
    task.item.querySelector('.retry-btn')?.remove();
    task.item.classList.add('is-success');
  }

  markFailed(task, message) {
    task.state = 'failed';
    task.error = message;
    task.item.classList.add('is-error');
    task.item.querySelector('.status').textContent = message || '上传失败';
    task.item.querySelector('.pct').textContent = '失败';
    task.item.querySelector('.progress-fill').className = 'progress-fill h-full bg-red-500';
    task.item.querySelector('.pause-btn')?.remove();
    task.item.querySelector('.cancel-btn')?.remove();
    const retryBtn = task.item.querySelector('.retry-btn');
    if (retryBtn) {
      retryBtn.classList.remove('hidden');
      retryBtn.onclick = () => this.retryTask(task);
    }
  }

  markCancelled(task) {
    task.state = 'cancelled';
    task.item.classList.add('is-cancelled');
    task.item.querySelector('.status').textContent = CANCEL_MESSAGE;
    task.item.querySelector('.pct').textContent = '取消';
    task.item.querySelector('.progress-fill').className = 'progress-fill h-full bg-slate-300';
    task.item.querySelector('.pause-btn')?.remove();
    task.item.querySelector('.cancel-btn')?.remove();
    task.item.querySelector('.retry-btn')?.remove();
  }

  add(files, targetDir, options = {}) {
    const manager = document.getElementById('uploadManager');
    const list = document.getElementById('uploadList');
    if (!manager || !list) return;
    this.bindListEvents(list);
    manager.classList.remove('hidden');
    manager.classList.add('flex');

    [...files].forEach(file => {
      const uploadName = file.uploadName || file.name;
      const taskTargetDir = file.targetDir || targetDir;
      const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const task = {
        id: taskId,
        file,
        targetDir: taskTargetDir,
        uploadName,
        conflictMode: options.conflictMode || 'error',
        item: createUploadItem(file, taskId),
        paused: false,
        cancelled: false,
        state: 'queued',
        error: '',
        xhr: null,
        key: null,
        uploadId: null,
        parts: [],
        skipped: false,
        renamed: false,
      };
      this.tasksById.set(taskId, task);
      list.prepend(task.item);
      this.tasks.push(task);
      this.queue.push(task);
    });

    this.renderSummary();
    this.pump();
  }

  retryTask(task) {
    if (!task || task.state !== 'failed') return;
    task.paused = false;
    task.cancelled = false;
    task.error = '';
    task.key = null;
    task.uploadId = null;
    task.parts = [];
    task.skipped = false;
    task.renamed = false;
    task.state = 'queued';
    task.item.className = 'upload-item p-4 border-b border-border bg-white';
    task.item.innerHTML = createUploadItem(task.file, task.id).innerHTML;
    task.item.querySelector('.status').textContent = '重试中';
    this.queue.push(task);
    this.renderSummary();
    this.pump();
  }

  retryFailed() {
    this.tasks.filter(task => task.state === 'failed').forEach(task => this.retryTask(task));
  }

  pump() {
    while (this.active < FILE_CONCURRENCY && this.queue.length) {
      const task = this.queue.shift();
      if (!task || task.state !== 'queued') continue;
      this.active++;
      task.state = 'running';
      this.renderSummary();
      this.run(task).finally(() => {
        this.active--;
        this.renderSummary();
        this.scheduleAutoClose();
        this.pump();
      });
    }
    this.renderSummary();
    this.scheduleAutoClose();
  }

  async run(task) {
    try {
      task.item.querySelector('.status').textContent = '准备上传';
      if (task.file.size >= MULTIPART_THRESHOLD) await uploadMultipart(task);
      else await uploadSmall(task);
      this.markSuccess(task);
      this.onComplete?.(task);
    } catch (e) {
      if (task.cancelled || e.message === CANCEL_MESSAGE) this.markCancelled(task);
      else this.markFailed(task, e.message || '上传失败');
    }
  }
}
