import { CHUNK_SIZE } from '../constants.js';

export function createServices(deps) {
  const {
    detectContentMode,
    getState,
    getEntryPath,
    splitUploadTarget,
    ensureRemoteDirectoryTree,
    fileApi,
    multipartApi,
  } = deps;

  const previewService = {
    resolveMode(entry) {
      return detectContentMode(entry);
    },
    createModal(entry) {
      const contentMode = this.resolveMode(entry);
      return {
        type: 'preview',
        loading: true,
        error: '',
        entry,
        contentMode,
        content: '',
        editable: getState().app.role === 'admin' && contentMode === 'text',
        editing: false,
      };
    },
    fetchText(entry) {
      return fileApi.previewText(getEntryPath(entry));
    },
  };

  function createPartTracker() {
    const map = {};
    return {
      add(uploadId, partNumber, etag) {
        if (!map[uploadId]) map[uploadId] = [];
        map[uploadId].push({ partNumber, etag });
      },
      get(uploadId) { return (map[uploadId] || []).sort((a, b) => a.partNumber - b.partNumber); },
      clear(uploadId) { delete map[uploadId]; },
    };
  }

  const uploadService = {
    CHUNK_SIZE,
    partTracker: createPartTracker(),
    prepareFiles(files, basePath) {
      return Array.from(files || []).map(file => ({
        file,
        ...splitUploadTarget(file, basePath),
      }));
    },
    async ensureDirectoryTree(targetDir) {
      await ensureRemoteDirectoryTree(targetDir);
    },
    uploadSingle(item, onProgress, conflict) {
      return fileApi.uploadWithProgress(item.targetDir, item.file, item.targetName, onProgress, conflict || item.conflict || 'rename');
    },
    isLargeFile(file) {
      return file.size > CHUNK_SIZE;
    },
    async multipartUpload(item, onProgress, onCancel, conflict) {
      const file = item.file;
      const name = item.targetName;
      const type = file.type || 'application/octet-stream';
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      const createRes = await multipartApi.create({
        targetDir: item.targetDir,
        name,
        type,
        totalSize: file.size,
        conflict: conflict || item.conflict || 'rename',
      });
      if (!createRes.response.ok) throw new Error(createRes.data?.message || '创建分片上传失败');
      const { key, uploadId, storageId, renamed } = createRes.data;

      const partResults = new Array(totalChunks);
      let nextPartIndex = 0;
      let cancelled = false;
      let completedParts = 0;

      async function uploadWorker() {
        while (nextPartIndex < totalChunks && !cancelled) {
          const i = nextPartIndex++;
          if (onCancel && onCancel()) { cancelled = true; throw new Error('UPLOAD_CANCELLED'); }
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const blob = file.slice(start, end);
          const partNumber = i + 1;
          const { response, data } = await multipartApi.uploadPart(key, uploadId, partNumber, blob, storageId);
          if (!response.ok) { cancelled = true; throw new Error(data?.message || `分片 ${partNumber} 上传失败`); }
          partResults[i] = { partNumber, etag: data?.etag || '' };
          uploadService.partTracker.add(uploadId, partNumber, data?.etag || '');
          completedParts++;
          if (typeof onProgress === 'function') onProgress(Math.round((completedParts / totalChunks) * 100));
        }
      }

      const CONCURRENCY = 4;
      const workers = Array.from({ length: Math.min(CONCURRENCY, totalChunks) }, () => uploadWorker());
      await Promise.all(workers);

      const parts = partResults.filter(Boolean).sort((a, b) => a.partNumber - b.partNumber);
      const completeRes = await multipartApi.complete({ key, uploadId, parts, storageId });
      if (!completeRes.response.ok) throw new Error(completeRes.data?.message || '完成分片上传失败');
      uploadService.partTracker.clear(uploadId);
      return { ...completeRes, data: { ...completeRes.data, renamed } };
    },
    async abortMultipart(key, uploadId, storageId) {
      await multipartApi.abort({ key, uploadId, storageId });
      uploadService.partTracker.clear(uploadId);
    },
  };

  return {
    previewService,
    uploadService,
  };
}
