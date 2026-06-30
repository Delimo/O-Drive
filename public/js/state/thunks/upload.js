import { CHUNK_SIZE } from "../../constants.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const AUTO_REMOVE_DELAY = 3000;
const AUTO_CLOSE_DELAY = 3000;
let autoRemoveTimers = [];
let autoCloseTimer = null;

function buildResumeDiagnostic(info) {
  if (!info?.totalChunks) return "";
  if (info.resumable) {
    return `检测到本地断点，已完成 ${info.completedParts}/${info.totalChunks} 个分片，重新上传时会继续。`;
  }
  if (info.stale) {
    return "发现旧的分片记录，但文件大小不匹配，将自动清理后重新上传。";
  }
  return "";
}

function buildUploadFailureDiagnostic(error, item) {
  const message = error?.message || "";
  if (message === "UPLOAD_PAUSED") {
    return item.multipart
      ? "已暂停并保留本地分片记录；重新选择同一文件可继续上传。"
      : "已暂停；小文件需要重新选择后再上传。";
  }
  if (message === "UPLOAD_CANCELLED") {
    return item.multipart
      ? "已取消，本地分片记录已清理；需要重新选择文件。"
      : "已取消；需要重新选择文件。";
  }
  if (/quota|容量|空间/i.test(message)) return "存储容量或配额不足，请清理空间后重新选择文件。";
  if (/csrf|login|unauthorized|forbidden|权限|登录/i.test(message)) return "登录或权限校验失败，请刷新登录状态后重新选择文件。";
  if (/network|fetch|timeout|Failed to fetch|网络/i.test(message)) return "网络中断或请求超时；大文件若有本地断点，重新选择同一文件可继续。";
  return item.multipart
    ? "分片上传失败；如果本地断点仍在，重新选择同一文件会尝试继续。"
    : "上传失败；浏览器未保留原始文件句柄，请重新选择文件。";
}

export function clearUploadAutoTimers() {
  autoRemoveTimers.forEach(clearTimeout);
  autoRemoveTimers = [];
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
}

export function createUploadThunks(deps, context) {
  const {
    actions,
    uploadService,
    normalizeKey,
    dispatchToast,
    taskApi,
  } = deps;

  const { mock, getThunks } = context;

  let uploadIdSeq = 0;
  const nextUploadId = () => `up-${Date.now()}-${(uploadIdSeq += 1)}`;

  return {
    uploadFiles: (files) => async (dispatch, getState) => {
      const state = getState();
      const list = uploadService.prepareFiles(
        files,
        normalizeKey(state.explorer.path),
      );
      if (!list.length) return;

      const queued = list.map((item) => ({
        item,
        id: nextUploadId(),
        name: item.relativeDir
          ? `${item.relativeDir}/${item.file.name}`
          : item.file.name,
        multipart: item.file.size > CHUNK_SIZE,
        resumeInfo: uploadService.inspectMultipartResume
          ? uploadService.inspectMultipartResume(item)
          : null,
      }));

      dispatch(
        actions.uploads.enqueue(
          queued.map((q) => ({
            id: q.id,
            name: q.name,
            status: "pending",
            progress: 0,
            error: "",
            multipart: q.multipart,
            resumable: Boolean(q.resumeInfo?.resumable),
            completedParts: q.resumeInfo?.completedParts || 0,
            totalChunks: q.resumeInfo?.totalChunks || 0,
            diagnostic: buildResumeDiagnostic(q.resumeInfo),
          })),
        ),
      );

      if (mock) {
        for (const q of queued) {
          dispatch(
            actions.uploads.update({
              id: q.id,
              status: "uploading",
              progress: 0,
            }),
          );
          for (const pct of [25, 55, 80, 100]) {
            await delay(160);
            dispatch(actions.uploads.update({ id: q.id, progress: pct }));
          }
          dispatch(
            actions.uploads.update({
              id: q.id,
              status: "success",
              progress: 100,
            }),
          );
        }
        dispatchToast(
          "success",
          `已模拟上传 ${queued.length} 个文件（设计预览模式）`,
        );
        return;
      }

      let uploaded = 0;
      let failed = 0;
      let cancelledItems = [];
      let pausedItems = [];
      let uploadTaskId = "";

      const dirsToCreate = [
        ...new Set(
          queued.filter((q) => q.item.relativeDir).map((q) => q.item.targetDir),
        ),
      ];
      for (const dir of dirsToCreate) {
        await uploadService.ensureDirectoryTree(dir);
      }

      try {
        const { response, data } = await taskApi.create("upload", {
          files: queued.map((q) => ({ name: q.name, size: q.item.file.size })),
        });
        if (response.ok && data?.item?.id) {
          uploadTaskId = data.item.id;
          dispatch(actions.admin.setActiveUploadTaskId(uploadTaskId));
        }
      } catch (err) { console.error("创建上传任务错误:", err); }

      const updateTask = async () => {
        if (!uploadTaskId) return;
        try {
          await taskApi.update(uploadTaskId, {
            total: queued.length,
            completed: uploaded,
            failed,
          });
        } catch (_) {}
      };

      for (const q of queued) {
        const { item, multipart } = q;
        dispatch(
          actions.uploads.update({
            id: q.id,
            status: "uploading",
            progress: q.resumeInfo?.resumable
              ? Math.round((q.resumeInfo.completedParts / q.resumeInfo.totalChunks) * 100)
              : 0,
            diagnostic: buildResumeDiagnostic(q.resumeInfo),
          }),
        );

        try {
          const stateNow = getState();
          const currentItem = stateNow.uploads.items.find((i) => i.id === q.id);
          if (currentItem?.status === "cancelling")
            throw new Error("UPLOAD_CANCELLED");

          const conflictMode = getState().uploads.conflictMode;

          if (multipart) {
            let cancelled = false;
            await uploadService.multipartUpload(
              item,
              (pct, meta = {}) => {
                const s = getState();
                const ci = s.uploads.items.find((i) => i.id === q.id);
                if (ci?.status === "cancelling") {
                  cancelled = true;
                  return;
                }
                dispatch(actions.uploads.update({
                  id: q.id,
                  progress: pct,
                  resumable: Boolean(meta.resumed || ci?.resumable),
                  completedParts: meta.completedParts || ci?.completedParts || 0,
                  totalChunks: meta.totalChunks || ci?.totalChunks || q.resumeInfo?.totalChunks || 0,
                  diagnostic: meta.resumed
                    ? `正在从断点继续：${meta.completedParts}/${meta.totalChunks} 个分片已完成。`
                    : ci?.diagnostic || "",
                }));
              },
              () => {
                const s = getState();
                const ci = s.uploads.items.find((i) => i.id === q.id);
                if (ci?.status === "cancelling") return "cancelled";
                if (ci?.status === "paused") return "paused";
                return false;
              },
              conflictMode,
            );
            if (cancelled) throw new Error("UPLOAD_CANCELLED");
          } else {
            const { response, data } = await uploadService.uploadSingle(
              item,
              (pct) => {
                const s = getState();
                const ci = s.uploads.items.find((i) => i.id === q.id);
                if (ci?.status === "cancelling")
                  throw new Error("UPLOAD_CANCELLED");
                dispatch(actions.uploads.update({ id: q.id, progress: pct }));
              },
              conflictMode,
            );
            if (!response.ok || !data?.success) {
              throw new Error(data?.message || `上传 ${item.file.name} 失败`);
            }
          }

          uploaded += 1;
          dispatch(
            actions.uploads.update({
              id: q.id,
              status: "success",
              progress: 100,
              diagnostic: "",
              resumable: false,
            }),
          );
          const successId = q.id;
          autoRemoveTimers.push(
            setTimeout(() => {
              dispatch(actions.uploads.remove(successId));
            }, AUTO_REMOVE_DELAY),
          );
          await updateTask();
        } catch (error) {
          if (error.message === "UPLOAD_CANCELLED") {
            cancelledItems.push(q.id);
            dispatch(actions.uploads.setCancelled({
              id: q.id,
              diagnostic: buildUploadFailureDiagnostic(error, q),
            }));
          } else if (error.message === "UPLOAD_PAUSED") {
            pausedItems.push(q.id);
            dispatch(actions.uploads.update({
              id: q.id,
              status: "paused",
              diagnostic: buildUploadFailureDiagnostic(error, q),
            }));
          } else {
            failed += 1;
            dispatch(
              actions.uploads.update({
                id: q.id,
                status: "error",
                error: error.message || "上传失败",
                diagnostic: buildUploadFailureDiagnostic(error, q),
              }),
            );
          }
          await updateTask();
        }
      }

      if (uploadTaskId) {
        try {
          const finalStatus =
            failed === 0 && cancelledItems.length === 0 && pausedItems.length === 0
              ? "completed"
              : uploaded === 0
                ? "failed"
                : "partial";
          await taskApi.update(uploadTaskId, {
            status: finalStatus,
            finishedAt: Date.now(),
          });
        } catch (err) { console.error("完成上传任务错误:", err); }
        dispatch(actions.admin.setActiveUploadTaskId(""));
      }

      if (pausedItems.length > 0) {
        dispatchToast("info", `已暂停 ${pausedItems.length} 个文件`);
      } else if (failed === 0 && cancelledItems.length === 0) {
        dispatchToast("success", `已上传 ${uploaded} 个文件`);
      } else if (uploaded === 0 && failed === 0) {
        dispatchToast("info", `已取消 ${cancelledItems.length} 个文件`);
      } else if (uploaded === 0) {
        dispatchToast("error", `上传失败 ${failed} 个文件`);
      } else {
        dispatchToast("error", `成功 ${uploaded} 个，失败 ${failed} 个`);
      }

      autoCloseTimer = setTimeout(() => {
        dispatch(actions.uploads.clearAll());
      }, AUTO_CLOSE_DELAY);

      await dispatch(getThunks().loadExplorer());
    },

    cancelFileUpload: (id) => async (dispatch) => {
      dispatch(actions.uploads.cancelItem(id));
    },

    pauseFileUpload: (id) => async (dispatch) => {
      dispatch(actions.uploads.pauseItem(id));
    },

    resumeFileUpload: (id) => async (dispatch, getState) => {
      const item = getState().uploads.items.find((i) => i.id === id);
      if (!item) return;
      if (item.multipart) {
        dispatchToast("info", `分片上传暂不支持断点续传，将重新开始`);
      }
      dispatch(actions.uploads.resumeItem({ id }));
    },

    retryFileUpload: (id) => async (dispatch, getState) => {
      const state = getState();
      const item = state.uploads.items.find((i) => i.id === id);
      if (!item) return;
      dispatch(actions.uploads.update({
        id,
        diagnostic: item.multipart
          ? "请重新选择同一文件；若本地断点仍在，将从已完成分片继续。"
          : "请重新选择该文件后再上传。",
      }));
      dispatchToast("info", item.multipart ? "请重新选择同一大文件以继续上传" : "请重新选择文件后上传");
    },
  };
}
