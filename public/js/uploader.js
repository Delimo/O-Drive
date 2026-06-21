import { api } from './api.js';
import { UI } from './ui.js';
import { escapeHtml } from './utils.js';

const PART_SIZE = 8 * 1024 * 1024;
const MULTIPART_THRESHOLD = 16 * 1024 * 1024;
const FILE_CONCURRENCY = 2;
const PART_RETRIES = 3;
const SUCCESS_CLEAR_DELAY = 3000;
const CANCEL_MESSAGE = '已取消';
const RESUME_KEY = 'odrive.multipartUploads.v1';
const UPLOAD_WORKER_URL = '/upload-worker.js';

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
    storageId: task.storageId || '',
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
  if (task.cancelled) throw new Error(CANCEL_MESSAGE);
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
        task.storageId = data?.storageId || task.storageId || '';
        task.warning = data?.warning || task.warning || '';
        task.overflowed = Boolean(data?.overflowed);
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
  if (task.cancelled) throw new Error(CANCEL_MESSAGE);
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
    const controller = new AbortController();
    task.partController = controller;
    try {
      const { res, data } = await api.multipartPart({
        key: task.key,
        uploadId: task.uploadId,
        storageId: task.storageId,
        partNumber,
        chunk,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      if (task.cancelled) throw new Error(CANCEL_MESSAGE);
      return data;
    } catch (e) {
      if (task.cancelled || attempt === PART_RETRIES) throw e;
      task.item.querySelector('.status').textContent = `重试第 ${partNumber} 片`;
      await sleep(800 * attempt);
    } finally {
      if (task.partController === controller) task.partController = null;
    }
  }
}

async function uploadMultipart(task) {
  const saved = readResumeStore()[taskFingerprint(task)];
  if (saved?.key && saved?.uploadId && Array.isArray(saved.parts)) {
    task.key = saved.key;
    task.uploadId = saved.uploadId;
    task.storageId = saved.storageId || '';
    task.parts = saved.parts;
    task.item.querySelector('.status').textContent = '继续未完成的上传';
  } else {
    const create = await api.multipartCreate({
      targetDir: task.targetDir,
      name: task.uploadName || task.file.name,
      type: task.file.type,
      totalSize: task.file.size,
      conflict: task.conflictMode || 'error',
    });
    if (!create.res.ok) throw new Error(create.data?.message || '无法创建分片上传');
    if (create.data?.skipped) {
      task.skipped = true;
      return;
    }
    task.key = create.data.key;
    task.uploadId = create.data.uploadId;
    task.storageId = create.data.storageId || '';
    task.warning = create.data.warning || '';
    task.overflowed = Boolean(create.data?.overflowed);
    task.parts = [];
    task.renamed = Boolean(create.data?.renamed);
    rememberMultipart(task);
  }
  if (task.cancelled) {
    if (task.key && task.uploadId) {
      try { await api.multipartAbort({ key: task.key, uploadId: task.uploadId, storageId: task.storageId }); } catch (_) {}
      forgetMultipart(task);
    }
    throw new Error(CANCEL_MESSAGE);
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

  await waitIfPaused(task);
  const controller = new AbortController();
  task.completeController = controller;
  try {
    const complete = await api.multipartComplete({
      key: task.key,
      uploadId: task.uploadId,
      storageId: task.storageId,
      parts: task.parts,
    }, { signal: controller.signal });
    if (!complete.res.ok) throw new Error(complete.data?.message || '无法完成分片上传');
    if (task.cancelled) throw new Error(CANCEL_MESSAGE);
    forgetMultipart(task);
  } finally {
    if (task.completeController === controller) task.completeController = null;
  }
}

async function abortTask(task) {
  if (!task || task.state === 'cancelled' || task.state === 'success') return;
  task.cancelled = true;
  task.paused = false;
  task.item.querySelector('.status').textContent = '正在取消...';
  task.item.querySelector('.pct').textContent = '取消中';
  task.item.querySelector('.pause-btn')?.setAttribute('disabled', '');
  task.item.querySelector('.cancel-btn')?.setAttribute('disabled', '');
  task.partController?.abort();
  task.completeController?.abort();
  task.xhr?.abort();
  if (task.key && task.uploadId) {
    (async () => {
      try {
        await api.multipartAbort({ key: task.key, uploadId: task.uploadId, storageId: task.storageId });
      } catch (_) {}
      forgetMultipart(task);
    })();
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

async function getUploadWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(UPLOAD_WORKER_URL);
    const ready = await navigator.serviceWorker.ready;
    return ready.active || registration.active || null;
  } catch (_) {
    return null;
  }
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
    this.workerEventsBound = false;
    this.backgroundBatches = new Map();
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
        if (task.state === 'queued') {
          this.queue = this.queue.filter(item => item !== task);
          this.markCancelled(task);
          this.renderSummary();
          this.scheduleAutoClose();
        }
        return;
      }
      if (action === 'retry') {
        this.retryTask(task);
      }
    });
  }

  bindWorkerEvents() {
    if (this.workerEventsBound || !('serviceWorker' in navigator)) return;
    this.workerEventsBound = true;
    navigator.serviceWorker.addEventListener('message', event => {
      const data = event.data || {};
      if (!data.type || !String(data.type).startsWith('ODRIVE_UPLOAD_')) return;
      if (data.type === 'ODRIVE_UPLOAD_FILE_STATUS') this.applyWorkerFileStatus(data);
      if (data.type === 'ODRIVE_UPLOAD_BATCH_DONE') {
        this.backgroundBatches.delete(data.batchId);
        this.renderSummary();
        this.scheduleAutoClose();
        this.onComplete?.();
      }
    });
  }

  applyWorkerFileStatus(data) {
    const task = this.tasksById.get(data.fileId);
    if (!task) return;
    const pct = Number(data.progressPct || 0);
    const loaded = Math.round((task.file.size || 0) * Math.max(0, Math.min(100, pct)) / 100);
    if (data.status === 'running') {
      task.state = 'running';
      updateProgress(task, loaded, task.file.size, data.message || '上传中');
      task.item.querySelector('.pause-btn')?.remove();
      task.item.querySelector('.cancel-btn')?.remove();
      task.item.querySelector('.retry-btn')?.remove();
    } else if (data.status === 'completed') {
      this.markSuccess(task);
    } else if (data.status === 'failed') {
      this.markFailed(task, data.message || '上传失败');
    }
    this.renderSummary();
  }

  scheduleAutoClose() {
    const { total, success, failed, cancelled } = this.summary;
    const settled = success + failed + cancelled;
    clearTimeout(this.closeTimer);
    if (total > 0 && settled === total && failed === 0) {
      this.closeTimer = setTimeout(() => UI.closeUploadManager(), SUCCESS_CLEAR_DELAY);
    }
  }

  removeTask(task) {
    if (!task || task.state !== 'success') return;
    clearTimeout(task.clearTimer);
    this.queue = this.queue.filter(item => item !== task);
    this.tasks = this.tasks.filter(item => item !== task);
    this.tasksById.delete(task.id);
    task.item.remove();
    this.renderSummary();
    if (this.tasks.length === 0) UI.closeUploadManager();
  }

  scheduleSuccessClear(task) {
    clearTimeout(task.clearTimer);
    task.clearTimer = setTimeout(() => this.removeTask(task), SUCCESS_CLEAR_DELAY);
  }

  markSuccess(task) {
    task.state = 'success';
    const label = task.warning || (task.skipped ? '已跳过' : task.renamed ? '已自动重命名' : '完成');
    updateProgress(task, task.file.size, task.file.size, label);
    task.item.querySelector('.progress-fill').className = 'progress-fill h-full bg-emerald-500 w-full';
    task.item.querySelector('.pause-btn')?.remove();
    task.item.querySelector('.cancel-btn')?.remove();
    task.item.querySelector('.retry-btn')?.remove();
    task.item.classList.add('is-success');
    this.scheduleSuccessClear(task);
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

  async startBackgroundUpload(tasks, options = {}) {
    const totalSize = tasks.reduce((sum, task) => sum + Number(task.file?.size || 0), 0);
    if (tasks.length === 1 && totalSize < MULTIPART_THRESHOLD) return false;
    const worker = await getUploadWorker();
    if (!worker) return false;
    this.bindWorkerEvents();
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const payloadFiles = tasks.map(task => ({
      id: task.id,
      name: task.uploadName || task.file.name,
      displayName: task.file.displayName || task.file.name,
      size: task.file.size,
      targetDir: task.targetDir,
    }));
    const created = await api.createTask('upload', { files: payloadFiles });
    if (!created.res.ok || !created.data?.item?.id) return false;
    this.backgroundBatches.set(batchId, { taskId: created.data.item.id, tasks });
    worker.postMessage({
      type: 'ODRIVE_UPLOAD_BATCH',
      batchId,
      taskId: created.data.item.id,
      conflictMode: options.conflictMode || 'error',
      csrfHeaders: api.csrfHeaders({}),
      files: tasks.map(task => ({
        id: task.id,
        file: task.file,
        targetDir: task.targetDir,
        uploadName: task.uploadName,
        displayName: task.file.displayName || task.file.name,
      })),
    });
    return true;
  }

  add(files, targetDir, options = {}) {
    const manager = document.getElementById('uploadManager');
    const list = document.getElementById('uploadList');
    if (!manager || !list) return;
    this.bindListEvents(list);
    clearTimeout(this.closeTimer);
    manager.classList.remove('hidden');
    manager.classList.add('flex');

    const newTasks = [...files].map(file => {
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
        storageId: '',
        partController: null,
        completeController: null,
        parts: [],
        skipped: false,
        renamed: false,
        warning: '',
        overflowed: false,
        clearTimer: null,
      };
      this.tasksById.set(taskId, task);
      list.prepend(task.item);
      this.tasks.push(task);
      return task;
    });

    this.renderSummary();
    this.startBackgroundUpload(newTasks, options).then(started => {
      if (!started) {
        this.queue.push(...newTasks);
        this.pump();
        return;
      }
      newTasks.forEach(task => {
        task.item.querySelector('.status').textContent = '后台上传中';
        task.item.querySelector('.pause-btn')?.remove();
        task.item.querySelector('.cancel-btn')?.remove();
      });
      this.renderSummary();
    }).catch(() => {
      this.queue.push(...newTasks);
      this.pump();
    });
  }

  retryTask(task) {
    if (!task || task.state !== 'failed') return;
    task.paused = false;
    task.cancelled = false;
    task.error = '';
    task.key = null;
    task.uploadId = null;
    task.storageId = '';
    task.partController = null;
    task.completeController = null;
    task.parts = [];
    task.skipped = false;
    task.renamed = false;
    task.warning = '';
    task.overflowed = false;
    clearTimeout(task.clearTimer);
    task.clearTimer = null;
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
      if (task.cancelled) throw new Error(CANCEL_MESSAGE);
      this.markSuccess(task);
      this.onComplete?.(task);
    } catch (e) {
      if (task.cancelled || e.message === CANCEL_MESSAGE) this.markCancelled(task);
      else this.markFailed(task, e.message || '上传失败');
    }
  }
}
