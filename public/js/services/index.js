import { CHUNK_SIZE } from "../constants.js";

async function sha256Hex(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getUploadKey(dir, name) {
  return `od-upload:${dir}/${name}`;
}

function saveProgress(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (_) {}
}

function loadProgress(key) {
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : null;
  } catch (_) {
    return null;
  }
}

function clearProgress(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

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
        type: "preview",
        loading: true,
        error: "",
        entry,
        contentMode,
        content: "",
        editable: getState().app.role === "admin" && contentMode === "text",
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
      get(uploadId) {
        return (map[uploadId] || []).sort(
          (a, b) => a.partNumber - b.partNumber,
        );
      },
      clear(uploadId) {
        delete map[uploadId];
      },
    };
  }

  const uploadService = {
    CHUNK_SIZE,
    partTracker: createPartTracker(),
    prepareFiles(files, basePath) {
      return Array.from(files || []).map((file) => ({
        file,
        ...splitUploadTarget(file, basePath),
      }));
    },
    async ensureDirectoryTree(targetDir) {
      await ensureRemoteDirectoryTree(targetDir);
    },
    uploadSingle(item, onProgress, conflict) {
      return fileApi.uploadWithProgress(
        item.targetDir,
        item.file,
        item.targetName,
        onProgress,
        conflict || item.conflict || "rename",
      );
    },
    isLargeFile(file) {
      return file.size > CHUNK_SIZE;
    },
    async multipartUpload(item, onProgress, onCancel, conflict) {
      const file = item.file;
      const name = item.targetName;
      const type = file.type || "application/octet-stream";
      const sha256 = await sha256Hex(file);
      const checkRes = await fileApi.uploadCheck({
        targetDir: item.targetDir === "/" ? "" : item.targetDir,
        name,
        size: file.size,
        sha256,
        conflict: conflict || item.conflict || "rename",
      });
      if (checkRes.response.ok && checkRes.data?.exists) {
        return {
          response: checkRes.response,
          data: { ...checkRes.data, skippedUpload: true },
        };
      }
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const pKey = getUploadKey(item.targetDir, name);
      const saved = loadProgress(pKey);

      let key, uploadId, storageId;
      let completedParts = [];
      let startChunk = 0;

      if (
        saved &&
        saved.fileSize === file.size &&
        saved.totalChunks === totalChunks
      ) {
        key = saved.key;
        uploadId = saved.uploadId;
        storageId = saved.storageId;
        completedParts = saved.parts || [];
        startChunk = completedParts.length;
      } else {
        if (saved && saved.uploadId) {
          try {
            await multipartApi.abort({
              key: saved.key,
              uploadId: saved.uploadId,
              storageId: saved.storageId,
            });
          } catch (_) {}
        }
        const createRes = await multipartApi.create({
          targetDir: item.targetDir,
          name,
          type,
          totalSize: file.size,
          conflict: conflict || item.conflict || "rename",
        });
        if (!createRes.response.ok)
          throw new Error(createRes.data?.message || "创建分片上传失败");
        key = createRes.data.key;
        uploadId = createRes.data.uploadId;
        storageId = createRes.data.storageId;
        saveProgress(pKey, {
          key,
          uploadId,
          storageId,
          totalChunks,
          fileSize: file.size,
          parts: [],
        });
      }

      const partResults = new Array(totalChunks);
      for (const p of completedParts) partResults[p.partNumber - 1] = p;

      let nextPartIndex = startChunk;
      let cancelled = false;
      let completedCount = completedParts.length;

      async function uploadWorker() {
        while (nextPartIndex < totalChunks && !cancelled) {
          const i = nextPartIndex++;
          if (onCancel && onCancel()) {
            cancelled = true;
            throw new Error("UPLOAD_CANCELLED");
          }
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const blob = file.slice(start, end);
          const partNumber = i + 1;
          const { response, data } = await multipartApi.uploadPart(
            key,
            uploadId,
            partNumber,
            blob,
            storageId,
          );
          if (!response.ok) {
            cancelled = true;
            throw new Error(data?.message || `分片 ${partNumber} 上传失败`);
          }
          partResults[i] = { partNumber, etag: data?.etag || "" };
          uploadService.partTracker.add(uploadId, partNumber, data?.etag || "");
          completedCount++;
          saveProgress(pKey, {
            key,
            uploadId,
            storageId,
            totalChunks,
            fileSize: file.size,
            parts: partResults
              .filter(Boolean)
              .sort((a, b) => a.partNumber - b.partNumber),
          });
          if (typeof onProgress === "function")
            onProgress(Math.round((completedCount / totalChunks) * 100));
        }
      }

      const CONCURRENCY = 4;
      const workers = Array.from(
        { length: Math.min(CONCURRENCY, totalChunks - startChunk) },
        () => uploadWorker(),
      );
      try {
        await Promise.all(workers);
      } catch (e) {
        if (e.message === "UPLOAD_CANCELLED") {
          try {
            await multipartApi.abort({ key, uploadId, storageId });
          } catch (_) {}
          clearProgress(pKey);
          uploadService.partTracker.clear(uploadId);
        }
        throw e;
      }
      if (cancelled) {
        try {
          await multipartApi.abort({ key, uploadId, storageId });
        } catch (_) {}
        clearProgress(pKey);
        uploadService.partTracker.clear(uploadId);
        throw new Error("UPLOAD_CANCELLED");
      }

      const parts = partResults
        .filter(Boolean)
        .sort((a, b) => a.partNumber - b.partNumber);
      const completeRes = await multipartApi.complete({
        key,
        uploadId,
        parts,
        storageId,
        sha256,
        size: file.size,
      });
      if (!completeRes.response.ok)
        throw new Error(completeRes.data?.message || "完成分片上传失败");
      clearProgress(pKey);
      uploadService.partTracker.clear(uploadId);
      return {
        ...completeRes,
        data: { ...completeRes.data, renamed: saved?.renamed },
      };
    },
    async abortMultipart(key, uploadId, storageId) {
      await multipartApi.abort({ key, uploadId, storageId });
      uploadService.partTracker.clear(uploadId);
      const idx = key.lastIndexOf("/");
      clearProgress(
        getUploadKey(
          idx >= 0 ? key.slice(0, idx) : "",
          idx >= 0 ? key.slice(idx + 1) : key,
        ),
      );
    },
  };

  return {
    previewService,
    uploadService,
  };
}
