export function createAuthThunks({
  actions,
  authApi,
  normalizeKey,
  dispatchToast,
  findCurrentEntryByPath,
  openDownload,
  mock,
  getThunks,
  page,
}) {
  return {
    loadRole: () => async (dispatch) => {
      if (mock) {
        dispatch(actions.app.setRole({ role: "admin", csrf: "mock-csrf" }));
        dispatch(actions.app.setBooting(false));
        return;
      }
      try {
        const { response, data } = await authApi.loadRole();
        if (!response.ok) {
          dispatch(actions.app.setRole({ role: "guest", csrf: "" }));
          dispatch(actions.app.setBooting(false));
          return;
        }
        dispatch(actions.app.setRole(data));
      } catch (err) {
        console.error("loadRole 错误:", err);
        dispatch(actions.app.setRole({ role: "guest", csrf: "" }));
      } finally {
        dispatch(actions.app.setBooting(false));
      }
    },

    login: (credentials) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const values = { username: credentials.username };
      dispatch(
        actions.app.setModal({
          type: "login",
          loading: true,
          error: "",
          values,
        }),
      );
      try {
        const { response, data } = await authApi.login(credentials);
        if (!response.ok || !data?.success) {
          dispatch(
            actions.app.setModal({
              type: "login",
              loading: false,
              error: data?.message || "用户名或密码错误",
              values,
            }),
          );
          return;
        }

        dispatch(actions.app.setModal(null));
        await dispatch(getThunks().loadRole());
        dispatchToast("success", "管理员登录成功");

        if (page === "admin") {
          await Promise.all([
            dispatch(getThunks().loadAdminStats()),
            dispatch(getThunks().loadAdminShares()),
          ]);
          return;
        }

        await dispatch(getThunks().loadExplorer());
      } catch (err) {
        console.error("login 错误:", err);
        dispatch(
          actions.app.setModal({
            type: "login",
            loading: false,
            error: "登录请求失败",
            values,
          }),
        );
      }
    },

    logout: () => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        await authApi.logout();
        dispatch(actions.app.setRole({ role: "guest", csrf: "" }));
        dispatchToast("success", "已退出管理员账户");
        if (page === "admin") {
          dispatch(actions.admin.setError("当前未登录管理员账户。"));
          dispatch(actions.admin.setShares([]));
          dispatch(actions.admin.setSharesError(""));
        }
        if (page === "home") {
          dispatch(actions.explorer.setTrashMode(false));
          await dispatch(getThunks().loadExplorer());
        }
      } catch (err) {
        console.error("logout 错误:", err);
        dispatchToast("error", "退出失败");
      }
    },

    unlockProtectedPath: (password) => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const modal = getState().app.modal;
      const path = modal?.path || "";
      if (!path) return;

      try {
        const { response, data } = await authApi.unlockProtectedPath(
          path,
          password,
        );
        if (!response.ok || data?.success === false) {
          dispatch(
            actions.app.setModal({
              ...modal,
              error: data?.message || "密码错误",
            }),
          );
          return;
        }

        const deferred = modal.deferredAction;
        dispatch(actions.app.setModal(null));
        dispatchToast("success", "路径已解锁");

        if (deferred?.kind === "preview") {
          const unlockedEntry = findCurrentEntryByPath(deferred.path);
          if (unlockedEntry) {
            await dispatch(
              getThunks().previewEntry({ ...unlockedEntry, protected: false }),
            );
          }
          return;
        }

        if (deferred?.kind === "download") {
          const unlockedEntry = findCurrentEntryByPath(deferred.path);
          if (unlockedEntry)
            openDownload({ ...unlockedEntry, protected: false });
          return;
        }

        if (deferred?.kind === "navigate") {
          dispatch(actions.explorer.setTrashMode(false));
          dispatch(actions.explorer.setPath(normalizeKey(deferred.path)));
          dispatch(actions.explorer.setQuery(""));
          dispatch(actions.explorer.setQueryDraft(""));
          await dispatch(getThunks().loadExplorer());
        }
      } catch (error) {
        dispatch(
          actions.app.setModal({
            ...modal,
            error: error.message || "解锁失败",
          }),
        );
      }
    },
  };
}
