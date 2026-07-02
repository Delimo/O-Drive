import { assertApiOk } from "../errors.js";

export function createAdminStorageThunks({
  actions,
  adminApi,
  trashApi,
  dispatchToast,
  humanError,
  getStore,
  mock,
  getMockModule,
  getThunks,
}) {
  return {
    loadAdminQuota: () => async (dispatch) => {
      dispatch(actions.admin.setQuotaLoading(true));
      if (mock) {
        const m = await getMockModule();
        dispatch(actions.admin.setQuota(m.mockAdminQuota));
        return;
      }
      try {
        const { response, data } = await adminApi.quota();
        assertApiOk(response, data, "存储配额加载失败", humanError);
        dispatch(actions.admin.setQuota(data));
      } catch (error) {
        dispatch(
          actions.admin.setQuotaError(error.message || "存储配额加载失败"),
        );
      }
    },

    setAdminQuota: (bytes) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await adminApi.setQuota(bytes);
        assertApiOk(response, data, "设置存储配额失败", humanError);
        dispatchToast("success", "存储配额已更新");
        await dispatch(getThunks().loadAdminQuota());
      } catch (error) {
        dispatchToast("error", error.message || "设置存储配额失败");
      }
    },

    loadAdminProtectedPaths: () => async (dispatch) => {
      dispatch(actions.admin.setProtectedPathsLoading(true));
      if (mock) {
        const m = await getMockModule();
        dispatch(actions.admin.setProtectedPaths(m.mockProtectedPaths));
        return;
      }
      try {
        const { response, data } = await adminApi.protectedPaths();
        assertApiOk(response, data, "受保护路径加载失败", humanError);
        dispatch(
          actions.admin.setProtectedPaths(data.list || data.items || []),
        );
      } catch (error) {
        dispatch(
          actions.admin.setProtectedPathsError(
            error.message || "受保护路径加载失败",
          ),
        );
      }
    },

    createAdminProtectedPath: (path) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const modal = getStore().getState().app.modal;
      if (!modal) return;
      try {
        const { response, data } = await adminApi.createProtectedPath(
          path,
          modal.password,
          modal.note,
          modal.showName,
        );
        assertApiOk(response, data, "创建受保护路径失败", humanError);
        dispatch(actions.app.setModal(null));
        dispatchToast("success", "受保护路径已创建");
        await dispatch(getThunks().loadAdminProtectedPaths());
      } catch (error) {
        dispatch(
          actions.app.setModal({
            ...modal,
            error: error.message || "创建受保护路径失败",
          }),
        );
      }
    },

    deleteAdminProtectedPath: (path) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await adminApi.deleteProtectedPath(path);
        assertApiOk(response, data, "删除受保护路径失败", humanError);
        dispatchToast("success", "受保护路径已删除");
        await dispatch(getThunks().loadAdminProtectedPaths());
      } catch (error) {
        dispatchToast("error", error.message || "删除受保护路径失败");
      }
    },

    loadAdminHiddenPaths: () => async (dispatch) => {
      dispatch(actions.admin.setHiddenPathsLoading(true));
      if (mock) {
        const m = await getMockModule();
        dispatch(actions.admin.setHiddenPaths(m.mockHiddenPaths));
        return;
      }
      try {
        const { response, data } = await adminApi.hiddenPaths();
        assertApiOk(response, data, "隐藏路径加载失败", humanError);
        dispatch(actions.admin.setHiddenPaths(data.list || []));
      } catch (error) {
        dispatch(
          actions.admin.setHiddenPathsError(
            error.message || "隐藏路径加载失败",
          ),
        );
      }
    },

    createAdminHiddenPath: (targetPath) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await adminApi.createHiddenPath(targetPath);
        assertApiOk(response, data, "添加隐藏路径失败", humanError);
        dispatchToast("success", "隐藏路径已添加");
        await dispatch(getThunks().loadAdminHiddenPaths());
      } catch (error) {
        dispatchToast("error", error.message || "添加隐藏路径失败");
      }
    },

    deleteAdminHiddenPath: (path) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await adminApi.deleteHiddenPath(path);
        assertApiOk(response, data, "删除隐藏路径失败", humanError);
        dispatchToast("success", "隐藏路径已删除");
        await dispatch(getThunks().loadAdminHiddenPaths());
      } catch (error) {
        dispatchToast("error", error.message || "删除隐藏路径失败");
      }
    },

    saveAccessRule: () => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }

      const draft = getState().admin.accessRuleDraft || {};
      const targetPath = String(draft.path || "").trim();
      const password = String(draft.password || "").trim();
      const note = String(draft.note || "").trim();
      const hidden = !!draft.hidden;
      const showName = draft.showName !== false;

      if (!targetPath) {
        dispatchToast("error", "请填写规则路径");
        return;
      }

      if (!hidden && !password) {
        dispatchToast("error", "请选择隐藏路径或填写访问密码");
        return;
      }

      dispatch(actions.admin.setAccessRuleSaving(true));
      try {
        const savedKinds = [];
        if (hidden) {
          const { response, data } = await adminApi.createHiddenPath(targetPath);
          assertApiOk(response, data, "添加隐藏路径失败", humanError);
          savedKinds.push("隐藏规则");
        }
        if (password) {
          const { response, data } = await adminApi.createProtectedPath(
            targetPath,
            password,
            note,
            showName,
          );
          assertApiOk(response, data, "创建受保护路径失败", humanError);
          savedKinds.push("密码规则");
        }

        dispatchToast(
          "success",
          savedKinds.length > 1 ? "访问控制规则已保存" : `${savedKinds[0]}已保存`,
        );
        dispatch(actions.admin.resetAccessRuleDraft());
        await Promise.all([
          hidden ? dispatch(getThunks().loadAdminHiddenPaths()) : Promise.resolve(),
          password ? dispatch(getThunks().loadAdminProtectedPaths()) : Promise.resolve(),
        ]);
      } catch (error) {
        dispatchToast("error", error.message || "保存访问控制规则失败");
      } finally {
        dispatch(actions.admin.setAccessRuleSaving(false));
      }
    },

    loadAdminStorageConfig: () => async (dispatch) => {
      dispatch(actions.admin.setStorageConfigLoading(true));
      if (mock) {
        const m = await getMockModule();
        dispatch(actions.admin.setStorageConfig(m.mockStorageConfig));
        return;
      }
      try {
        const { response, data } = await adminApi.storageConfig();
        assertApiOk(response, data, "存储配置加载失败", humanError);
        dispatch(actions.admin.setStorageConfig(data));
      } catch (error) {
        dispatch(
          actions.admin.setStorageConfigError(
            error.message || "存储配置加载失败",
          ),
        );
      }
    },

    loadAdminTrashPreview: () => async (dispatch) => {
      dispatch(actions.admin.setTrashPreviewLoading(true));
      if (mock) {
        const m = await getMockModule();
        dispatch(actions.admin.setTrashPreview(m.mockTrashItems || []));
        return;
      }
      try {
        const { response, data } = await trashApi.list("");
        assertApiOk(response, data, "回收站预览加载失败", humanError);
        dispatch(actions.admin.setTrashPreview(data.items || []));
      } catch (error) {
        dispatch(actions.admin.setTrashPreviewError(error.message || "回收站预览加载失败"));
      }
    },

    saveAdminStorageConfig: (config) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      dispatch(actions.admin.setStorageConfigSaving(true));
      try {
        const { response, data } = await adminApi.saveStorageConfig(config);
        assertApiOk(response, data, "保存存储配置失败", humanError);
        dispatchToast("success", "存储配置已更新");
        dispatch(actions.admin.setStorageConfig(data));
      } catch (error) {
        dispatchToast("error", error.message || "保存存储配置失败");
        dispatch(actions.admin.setStorageConfigSaving(false));
      }
    },
  };
}
