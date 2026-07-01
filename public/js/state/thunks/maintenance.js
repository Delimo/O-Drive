import { assertApiOk } from "./errors.js";

export function createMaintenanceThunks(deps, context) {
  const {
    actions,
    fileApi,
    trashApi,
    maintenanceApi,
    normalizeKey,
    dispatchToast,
    humanError,
  } = deps;

  const { mock, getThunks } = context;

  return {
    loadTrashRetention: () => async (dispatch) => {
      dispatch(actions.admin.setTrashRetentionLoading(true));
      if (mock) {
        dispatch(actions.admin.setTrashRetention({ days: 7 }));
        return;
      }
      try {
        const { response, data } = await trashApi.getRetention();
        assertApiOk(response, data, "加载保留天数失败", humanError);
        dispatch(actions.admin.setTrashRetention(data));
      } catch (error) {
        dispatch(actions.admin.setTrashRetentionLoading(false));
        console.error("loadTrashRetention:", error);
      }
    },

    setTrashRetention: (days) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await trashApi.setRetention(days);
        assertApiOk(response, data, "设置保留天数失败", humanError);
        dispatch(actions.admin.setTrashRetention(data));
        dispatchToast("success", `回收站保留天数已设为 ${days} 天`);
      } catch (error) {
        dispatchToast("error", error.message || "设置保留天数失败");
      }
    },

    cleanupTrashByRetention: () => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      dispatch(actions.admin.setTrashCleanupBusy(true));
      try {
        const { response, data } = await trashApi.cleanup();
        assertApiOk(response, data, "清理回收站失败", humanError);
        dispatchToast(
          "success",
          `已清理 ${data.deleted || 0} 条过期记录（保留 ${data.retentionDays || 0} 天）`,
        );
        await dispatch(getThunks().loadMaintenanceSnapshot());
        await dispatch(getThunks().loadAdminTrashPreview());
      } catch (error) {
        dispatchToast("error", error.message || "清理回收站失败");
      } finally {
        dispatch(actions.admin.setTrashCleanupBusy(false));
      }
    },

    estimateAndConfirmDelete: (paths) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      if (!paths?.length) return;
      try {
        const { response, data } = await fileApi.operationEstimate(paths);
        assertApiOk(response, data, "操作预估失败", humanError);
        dispatch(actions.app.setModal({ type: "operation-estimate", loading: false, error: "", estimate: data, paths, operation: "delete" }));
      } catch (error) {
        dispatchToast("error", error.message || "操作预估失败");
      }
    },

    estimateAndConfirmPaste: (paths, action) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      if (!paths?.length) return;
      try {
        const { response, data } = await fileApi.operationEstimate(paths);
        assertApiOk(response, data, "操作预估失败", humanError);
        dispatch(actions.app.setModal({ type: "operation-estimate", loading: false, error: "", estimate: data, paths, operation: action }));
      } catch (error) {
        dispatchToast("error", error.message || "操作预估失败");
      }
    },

    confirmTrashRestore: (trashIds, options = {}) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const ids = [...new Set((trashIds || []).filter(Boolean))];
      if (!ids.length) return;
      try {
        const { response, data } = await trashApi.restorePreview(ids);
        assertApiOk(response, data, "恢复预检失败", humanError);
        if (options.single && !data?.hasConflicts) {
          await dispatch(getThunks().executeTrashRestore(ids, "error"));
          return;
        }
        dispatch(actions.app.setModal({
          type: "trash-restore-confirm",
          loading: false,
          error: "",
          ids,
          preview: data,
          conflictMode: data?.hasConflicts ? "rename" : "skip",
        }));
      } catch (error) {
        dispatchToast("error", error.message || "恢复预检失败");
      }
    },

    executeTrashRestore: (trashIds, conflictMode = "error") => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const ids = [...new Set((trashIds || []).filter(Boolean))];
      if (!ids.length) return;

      dispatch(actions.explorer.setTrashBatchBusy(true));
      const modal = getState().app.modal;
      try {
        const apiCall = ids.length === 1
          ? trashApi.restore(ids[0], conflictMode)
          : trashApi.restoreBatch(ids, conflictMode);
        const { response, data } = await apiCall;
        assertApiOk(response, data, "恢复失败", humanError);
        dispatch(actions.app.setModal(null));
        dispatch(actions.explorer.setTrashSelectedKeys([]));
        const completed = data.completed ?? (data.skipped ? 0 : 1);
        const skipped = data.skipped ?? 0;
        const failed = data.failed?.length || 0;
        if (failed) {
          dispatchToast("error", `已恢复 ${completed} 条，跳过 ${skipped} 条，失败 ${failed} 条`);
        } else if (skipped && !completed) {
          dispatchToast("success", `已跳过 ${skipped} 条冲突记录`);
        } else if (skipped) {
          dispatchToast("success", `已恢复 ${completed} 条，跳过 ${skipped} 条`);
        } else {
          dispatchToast("success", `已恢复 ${completed} 条记录`);
        }
        await dispatch(getThunks().loadExplorer());
      } catch (error) {
        if (modal && modal.type === "trash-restore-confirm") {
          dispatch(actions.app.setModal({
            ...modal,
            loading: false,
            error: error.message || "恢复失败",
          }));
        } else {
          dispatchToast("error", error.message || "恢复失败");
        }
      } finally {
        dispatch(actions.explorer.setTrashBatchBusy(false));
      }
    },

    restoreTrash: (trashId) => async (dispatch) => {
      await dispatch(getThunks().confirmTrashRestore([trashId], { single: true }));
    },

    deleteTrash: (trashId) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await trashApi.remove(trashId);
        assertApiOk(response, data, "彻底删除失败", humanError);
        dispatchToast("success", "回收站记录已彻底删除");
        await dispatch(getThunks().loadExplorer());
      } catch (error) {
        dispatchToast("error", error.message || "彻底删除失败");
      }
    },

    clearTrash: () => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await trashApi.clear();
        assertApiOk(response, data, "清空回收站失败", humanError);
        dispatchToast("success", "回收站已清空");
        await dispatch(getThunks().loadExplorer());
      } catch (error) {
        dispatchToast("error", error.message || "清空回收站失败");
      }
    },

    clearTrashWithModal: () => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }

      try {
        const { response, data } = await trashApi.clear();
        assertApiOk(response, data, "清空回收站失败", humanError);
        dispatch(actions.app.setModal(null));
        dispatchToast("success", "回收站已清空");
        await dispatch(getThunks().loadExplorer());
      } catch (error) {
        const modal = getState().app.modal;
        dispatch(
          actions.app.setModal({
            ...modal,
            loading: false,
            error: error.message || "清空回收站失败",
          }),
        );
      }
    },

    batchRestoreTrash: (trashIds) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      await dispatch(getThunks().confirmTrashRestore(trashIds));
    },

    batchDeleteTrash: (trashIds) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      if (!trashIds?.length) return;

      dispatch(actions.explorer.setTrashBatchBusy(true));
      let successCount = 0;
      let failCount = 0;
      const errors = [];
      for (const id of trashIds) {
        try {
          const { response, data } = await trashApi.remove(id);
          assertApiOk(response, data, "删除失败", humanError);
          successCount++;
        } catch (error) {
          failCount++;
          errors.push(error.message || "删除失败");
        }
      }
      dispatch(actions.explorer.setTrashSelectedKeys([]));
      if (failCount === 0) {
        dispatchToast("success", `已彻底删除 ${successCount} 条记录`);
      } else if (successCount === 0) {
        dispatchToast("error", `删除失败 ${failCount} 条: ${errors[0]}`);
      } else {
        dispatchToast("error", `成功 ${successCount} 条，失败 ${failCount} 条`);
      }
      dispatch(actions.explorer.setTrashBatchBusy(false));
      await dispatch(getThunks().loadExplorer());
    },

    loadMaintenanceSnapshot: () => async (dispatch) => {
      dispatch(actions.admin.setMaintenanceLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setMaintenance(m.mockMaintenanceSnapshot));
        return;
      }
      try {
        const { response, data } = await maintenanceApi.snapshot();
        assertApiOk(response, data, "维护快照加载失败", humanError);
        dispatch(actions.admin.setMaintenance(data));
      } catch (error) {
        dispatch(
          actions.admin.setMaintenanceError(
            error.message || "维护快照加载失败",
          ),
        );
      }
    },

    executeMaintenanceAction: (action) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      dispatch(actions.admin.setMaintenanceBusyAction(action));
      try {
        const { response, data } = await maintenanceApi.executeAction(action);
        assertApiOk(response, data, "执行维护操作失败", humanError);
        dispatch(actions.app.setModal(null));
        dispatchToast("success", data?.message || "维护操作已完成");
        await dispatch(getThunks().loadMaintenanceSnapshot());
      } catch (error) {
        dispatchToast("error", error.message || "执行维护操作失败");
      } finally {
        dispatch(actions.admin.setMaintenanceBusyAction(""));
      }
    },
  };
}
