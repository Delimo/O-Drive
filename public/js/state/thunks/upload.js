import { CHUNK_SIZE } from "../../constants.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
            progress: 0,
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
              (pct) => {
                const s = getState();
                const ci = s.uploads.items.find((i) => i.id === q.id);
                if (ci?.status === "cancelling") {
                  cancelled = true;
                  return;
                }
                dispatch(actions.uploads.update({ id: q.id, progress: pct }));
              },
              () => {
                const s = getState();
                const ci = s.uploads.items.find((i) => i.id === q.id);
                return ci?.status === "cancelling" || ci?.status === "paused";
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
            }),
          );
          await updateTask();
        } catch (error) {
          if (error.message === "UPLOAD_CANCELLED") {
            cancelledItems.push(q.id);
            dispatch(actions.uploads.setCancelled(q.id));
          } else {
            failed += 1;
            dispatch(
              actions.uploads.update({
                id: q.id,
                status: "error",
                error: error.message || "上传失败",
              }),
            );
          }
          await updateTask();
        }
      }

      if (uploadTaskId) {
        try {
          const finalStatus =
            failed === 0 ? "completed" : uploaded === 0 ? "failed" : "partial";
          await taskApi.update(uploadTaskId, {
            status: finalStatus,
            finishedAt: Date.now(),
          });
        } catch (err) { console.error("完成上传任务错误:", err); }
        dispatch(actions.admin.setActiveUploadTaskId(""));
      }

      if (failed === 0 && cancelledItems.length === 0) {
        dispatchToast("success", `已上传 ${uploaded} 个文件`);
      } else if (uploaded === 0 && failed === 0) {
        dispatchToast("info", `已取消 ${cancelledItems.length} 个文件`);
      } else if (uploaded === 0) {
        dispatchToast("error", `上传失败 ${failed} 个文件`);
      } else {
        dispatchToast("error", `成功 ${uploaded} 个，失败 ${failed} 个`);
      }
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
      dispatch(actions.uploads.retryItem(id));
      const files = state.explorer.files || [];
      const folders = state.explorer.folders || [];
      const entry = [...folders, ...files].find((e) => e.name === item.name);
      if (entry) {
        dispatchToast("info", `重新上传 ${item.name}`);
        return;
      }
    },
  };
}
