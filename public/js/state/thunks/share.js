import { assertApiOk } from "./errors.js";

export function createShareThunks(deps, context) {
  const {
    actions,
    shareApi,
    getEntryPath,
    dispatchToast,
    humanError,
    copyText,
    getPage,
  } = deps;

  const { mock, getThunks } = context;
  const page = getPage();

  return {
    loadShare: () => async (dispatch, getState) => {
      const shareState = getState().share;
      const token = shareState.token.trim();
      const path = String(shareState.path || "").trim();
      if (!token && !mock) {
        dispatch(actions.share.setError("请提供分享 token。"));
        return;
      }

      dispatch(actions.share.setLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.share.setData(m.mockShareItem));
        if (!token) dispatch(actions.share.setToken("mock-share-token"));
        return;
      }
      try {
        const { response, data } = await shareApi.info(token, path);
        if (
          response.status === 403 &&
          data?.code === "SHARE_PASSWORD_REQUIRED"
        ) {
          dispatch(actions.share.setPasswordRequired("该分享需要访问密码。"));
          return;
        }
        assertApiOk(response, data, "分享信息加载失败", humanError);
        dispatch(actions.share.setData({ item: data.item, directory: data.directory }));
      } catch (error) {
        dispatch(actions.share.setError(error.message || "分享信息加载失败"));
      }
    },

    createShare: (entryOrEntries) => async (dispatch) => {
      const entries = (Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries])
        .filter((entry) => entry && getEntryPath(entry));
      if (!entries.length) return;
      const entry = entries[0];
      const targetType =
        entries.length > 1 ? "bundle" : entry.kind === "folder" ? "folder" : "file";
      dispatch(
        actions.app.setModal({
          type: "share",
          loading: false,
          error: "",
          entry,
          entries,
          targetType,
          values: {
            expiresInDays: "7",
            maxDownloads: "0",
            password: "",
            allowPreview: true,
            allowDownload: true,
          },
        }),
      );
    },

    submitShare: (values) => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const modal = getState().app.modal;
      const entry = modal?.entry;
      const entries = Array.isArray(modal?.entries) && modal.entries.length
        ? modal.entries
        : entry
          ? [entry]
          : [];
      const paths = entries.map((item) => getEntryPath(item)).filter(Boolean);
      if (!paths.length) return;

      try {
        const payload = {
          ...(paths.length > 1 ? { paths } : { path: paths[0] }),
          targetType: paths.length > 1 ? "bundle" : modal?.targetType || entry.kind || "file",
          expiresInDays: Number(values.expiresInDays || 0),
          maxDownloads: Number(values.maxDownloads || 0),
          password: String(values.password || "").trim(),
          allowPreview: Boolean(values.allowPreview),
          allowDownload: Boolean(values.allowDownload),
        };
        const { response, data } = await shareApi.create(payload);
        assertApiOk(
          response,
          data,
          "创建分享失败",
          humanError,
          { isValid: (result) => Boolean(result?.item?.token) },
        );

        const link = `${window.location.origin}/share.html?token=${encodeURIComponent(data.item.token)}`;
        await copyText(link, "分享链接已创建并复制");
        dispatch(actions.app.setModal(null));

        if (page === "admin") {
          await dispatch(getThunks().loadAdminShares());
        }
      } catch (error) {
        dispatch(
          actions.app.setModal({
            ...modal,
            error: error.message || "创建分享失败",
            values,
          }),
        );
      }
    },

    deleteShare: (token) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      if (!token) return;

      dispatch(actions.admin.setShareBusyToken(token));
      try {
        const { response, data } = await shareApi.remove(token);
        assertApiOk(response, data, "删除分享失败", humanError);
        dispatchToast("success", "分享已删除");
        await dispatch(getThunks().loadAdminShares());
      } catch (error) {
        dispatchToast("error", error.message || "删除分享失败");
      } finally {
        dispatch(actions.admin.setShareBusyToken(""));
      }
    },

    deleteShareWithModal: (token) => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      if (!token) return;

      const modal = getState().app.modal;
      dispatch(actions.app.setModal({ ...modal, loading: true, error: "" }));
      try {
        const { response, data } = await shareApi.remove(token);
        assertApiOk(response, data, "删除分享失败", humanError);
        dispatch(actions.app.setModal(null));
        dispatchToast("success", "分享已删除");
        await dispatch(getThunks().loadAdminShares());
      } catch (error) {
        dispatch(
          actions.app.setModal({
            ...modal,
            loading: false,
            error: error.message || "删除分享失败",
          }),
        );
      }
    },

    cleanupExpiredShares: () => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      dispatch(actions.admin.setShareBusyToken("__cleanup__"));
      try {
        const { response, data } = await shareApi.cleanupExpired();
        assertApiOk(response, data, "清理过期分享失败", humanError);
        dispatchToast("success", "已清理过期分享");
        await dispatch(getThunks().loadAdminShares());
      } catch (error) {
        dispatchToast("error", error.message || "清理过期分享失败");
      } finally {
        dispatch(actions.admin.setShareBusyToken(""));
      }
    },

    cleanupExpiredSharesWithModal: () => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }

      const modal = getState().app.modal;
      dispatch(actions.app.setModal({ ...modal, loading: true, error: "" }));
      try {
        const { response, data } = await shareApi.cleanupExpired();
        assertApiOk(response, data, "清理过期分享失败", humanError);
        dispatch(actions.app.setModal(null));
        dispatchToast("success", "已清理过期分享");
        await dispatch(getThunks().loadAdminShares());
      } catch (error) {
        dispatch(
          actions.app.setModal({
            ...modal,
            loading: false,
            error: error.message || "清理过期分享失败",
          }),
        );
      }
    },

    reactivateExpiredShareWithModal: (values) => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }

      const modal = getState().app.modal;
      const token = modal?.token || "";
      if (!token) return;

      const expiresInDays = Math.max(
        0,
        Math.min(3650, Number(values.expiresInDays || 0) || 0),
      );
      dispatch(actions.app.setModal({ ...modal, loading: true, error: "" }));
      try {
        const { response, data } = await shareApi.reactivateExpired(token, {
          expiresInDays,
        });
        assertApiOk(response, data, "重新启用分享失败", humanError);
        dispatch(actions.app.setModal(null));
        dispatchToast("success", "分享链接已重新启用");
        await dispatch(getThunks().loadAdminShares());
      } catch (error) {
        dispatch(
          actions.app.setModal({
            ...modal,
            loading: false,
            error: error.message || "重新启用分享失败",
            values: { expiresInDays: String(expiresInDays || "0") },
          }),
        );
      }
    },

    unlockShare: (password) => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const token = getState().share.token.trim();
      if (!token) return;

      dispatch(actions.share.setLoading(true));
      try {
        const { response, data } = await shareApi.unlock(token, password);
        assertApiOk(response, data, "密码错误", humanError, {
          isValid: (result) => result?.success === true,
        });
        dispatchToast("success", "分享已解锁");
        dispatch(actions.share.setPassword(""));
        await dispatch(getThunks().loadShare());
      } catch (error) {
        dispatch(
          actions.share.setPasswordRequired(error.message || "密码错误"),
        );
      }
    },
  };
}
