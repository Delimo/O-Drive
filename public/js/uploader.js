import { api } from './api.js';
import { UI } from './ui.js';
import { escapeHtml } from './utils.js';

const PART_SIZE = 8 * 1024 * 1024;
const MULTIPART_THRESHOLD = 16 * 1024 * 1024;
const FILE_CONCURRENCY = 2;
const PART_RETRIES = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createUploadItem(file) {
  const item = document.createElement('div');
  item.className = 'upload-item p-4 border-b border-border bg-white';
  item.innerHTML = `
    <div class="flex items-center justify-between gap-3 text-[12px] mb-2 text-slate-500">
      <span class="font-semibold text-slate-900 truncate">${escapeHtml(file.name)}</span>
      <span class="pct text-primary font-mono flex-shrink-0">0%</span>
    </div>
    <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div class="progress-fill h-full bg-primary w-0 transition-all duration-300"></div>
    </div>
    <div class="mt-3 flex items-center justify-between gap-2">
      <span class="status text-[11px] text-slate-500">等待中</span>
      <div class="flex gap-2">
        <button class="pause-btn upload-control">暂停</button>
        <button class="cancel-btn upload-control danger">取消</button>
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

async function uploadSmall(task) {
  const xhr = new XMLHttpRequest();
  task.xhr = xhr;
  const target = task.targetDir.replace(/^\/|\/$/g, '');
  xhr.open('POST', `/api/files/${target}`, true);
  xhr.upload.onprogress = e => {
    if (e.lengthComputable) updateProgress(task, e.loaded, e.total, '上传中');
  };

  const done = new Promise((resolve, reject) => {
    xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.onabort = () => reject(new Error('已取消'));
  });

  const fd = new FormData();
  fd.append('file', task.file);
  xhr.send(fd);
  await done;
}

async function waitIfPaused(task) {
  while (task.paused && !task.cancelled) {
    task.item.querySelector('.status').textContent = '已暂停';
    await sleep(300);
  }
  if (task.cancelled) throw new Error('已取消');
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
  const create = await api.multipartCreate({
    targetDir: task.targetDir,
    name: task.file.name,
    type: task.file.type,
    size: task.file.size,
  });
  if (!create.res.ok) throw new Error(create.data?.message || '无法创建分片上传');

  task.key = create.data.key;
  task.uploadId = create.data.uploadId;
  task.parts = [];

  const partCount = Math.ceil(task.file.size / PART_SIZE);
  for (let i = 0; i < partCount; i++) {
    await waitIfPaused(task);
    const start = i * PART_SIZE;
    const end = Math.min(start + PART_SIZE, task.file.size);
    const chunk = task.file.slice(start, end);
    task.item.querySelector('.status').textContent = `上传中 ${i + 1}/${partCount}`;
    const part = await uploadPartWithRetry(task, i + 1, chunk);
    task.parts.push(part);
    updateProgress(task, end, task.file.size);
  }

  const complete = await api.multipartComplete({
    key: task.key,
    uploadId: task.uploadId,
    parts: task.parts,
  });
  if (!complete.res.ok) throw new Error(complete.data?.message || '无法完成分片上传');
}

async function abortTask(task) {
  task.cancelled = true;
  task.xhr?.abort();
  if (task.key && task.uploadId) {
    try {
      await api.multipartAbort({ key: task.key, uploadId: task.uploadId });
    } catch (_) {}
  }
}

export class UploadQueue {
  constructor({ onComplete } = {}) {
    this.queue = [];
    this.active = 0;
    this.total = 0;
    this.finished = 0;
    this.onComplete = onComplete;
  }

  add(files, targetDir) {
    const manager = document.getElementById('uploadManager');
    const list = document.getElementById('uploadList');
    manager.classList.replace('hidden', 'flex');

    [...files].forEach(file => {
      const task = {
        file,
        targetDir,
        item: createUploadItem(file),
        paused: false,
        cancelled: false,
      };
      task.item.querySelector('.pause-btn').onclick = () => {
        task.paused = !task.paused;
        task.item.querySelector('.pause-btn').textContent = task.paused ? '继续' : '暂停';
      };
      task.item.querySelector('.cancel-btn').onclick = () => abortTask(task);
      list.prepend(task.item);
      this.queue.push(task);
    });

    this.total += files.length;
    this.pump();
  }

  pump() {
    while (this.active < FILE_CONCURRENCY && this.queue.length) {
      const task = this.queue.shift();
      this.active++;
      this.run(task).finally(() => {
        this.active--;
        this.finished++;
        this.pump();
        if (this.active === 0 && this.queue.length === 0 && this.finished >= this.total) {
          this.total = 0;
          this.finished = 0;
          this.onComplete?.();
          UI.closeUploadManager();
        }
      });
    }
  }

  async run(task) {
    try {
      task.item.querySelector('.status').textContent = '准备上传';
      if (task.file.size >= MULTIPART_THRESHOLD) await uploadMultipart(task);
      else await uploadSmall(task);
      updateProgress(task, task.file.size, task.file.size, '完成');
      task.item.querySelector('.progress-fill').className = 'progress-fill h-full bg-emerald-500 w-full';
      task.item.querySelector('.pause-btn')?.remove();
      task.item.querySelector('.cancel-btn')?.remove();
    } catch (e) {
      task.item.querySelector('.status').textContent = e.message || '上传失败';
      task.item.querySelector('.pct').textContent = task.cancelled ? '取消' : '失败';
      task.item.querySelector('.progress-fill').className = 'progress-fill h-full bg-red-500';
    }
  }
}
