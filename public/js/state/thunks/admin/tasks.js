import { assertApiOk } from "../errors.js";

export function createAdminTaskThunks({
  actions,
  adminApi,
  taskApi,
  dispatchToast,
  humanError,
  mock,
  getMockModule,
  getThunks,
}) {
  return {
    loadTasks: () => async (dispatch) => {
      dispatch(actions.admin.setTasksLoading(true));
      if (mock) {
        const m = await getMockModule();
        dispatch(actions.admin.setTasks(m.mockTasks));
        dispatch(actions.admin.setTaskAlertConfig(m.mockTaskAlertConfig));
        return;
      }
      try {
        const { response, data } = await taskApi.list(20);
        assertApiOk(response, data, "任务列表加载失败", humanError);
        dispatch(actions.admin.setTasks(data.items || []));
        dispatch(actions.admin.setTaskAlertConfig(data.alertConfig || null));
      } catch (err) {
        console.error("loadTasks 错误:", err);
        dispatch(actions.admin.setTasksLoading(false));
      }
    },

    retryTask: (id) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const taskId = String(id || "");
      if (!taskId) return;
      dispatch(actions.admin.setTaskRetryingId(taskId));
      try {
        const { response, data } = await taskApi.retry(taskId);
        assertApiOk(response, data, "任务重试失败", humanError);
        dispatchToast("success", "任务已重新入队");
        await dispatch(getThunks().loadTasks());
      } catch (error) {
        dispatchToast("error", error.message || "任务重试失败");
      } finally {
        dispatch(actions.admin.setTaskRetryingId(""));
      }
    },

    saveTaskAlertConfig: (config) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      dispatch(actions.admin.setTaskAlertConfigSaving(true));
      try {
        const { response, data } = await adminApi.saveTaskAlertConfig(config);
        assertApiOk(response, data, "保存任务告警规则失败", humanError);
        dispatch(actions.admin.setTaskAlertConfig(data.config || null));
        dispatchToast("success", "任务告警规则已更新");
        await Promise.all([
          dispatch(getThunks().loadTasks()),
          dispatch(getThunks().loadAdminStats()),
        ]);
      } catch (error) {
        dispatch(actions.admin.setTaskAlertConfigSaving(false));
        dispatchToast("error", error.message || "保存任务告警规则失败");
      }
    },
  };
}
