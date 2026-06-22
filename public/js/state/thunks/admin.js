let _audioCtx;

function showNotificationAlert(message) {
  try {
    const ctx =
      _audioCtx ||
      (_audioCtx = new (window.AudioContext || window.webkitAudioContext)());
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) { console.error("AudioContext 错误:", err); }
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification("O-Drive 通知", { body: message, icon: "/favicon.ico" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  } catch (err) { console.error("Notification 错误:", err); }
}

export function cleanupAudioContext() {
  if (_audioCtx && _audioCtx.state !== "closed") {
    _audioCtx.close().catch(() => {});
    _audioCtx = null;
  }
}

export function createAdminThunks(deps, context) {
  const {
    actions,
    authApi,
    adminApi,
    shareApi,
    maintenanceApi,
    taskApi,
    notificationApi,
    normalizeKey,
    dispatchToast,
    humanError,
    getStore,
    findCurrentEntryByPath,
    openDownload,
    getPage,
  } = deps;

  const { mock, getThunks } = context;
  const page = getPage();

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

    loadAdminStats: () => async (dispatch) => {
      dispatch(actions.admin.setLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setStats(m.mockAdminStats));
        return;
      }
      try {
        const { response, data } = await adminApi.stats();
        if (!response.ok) throw new Error(data?.message || "后台概览加载失败");
        dispatch(actions.admin.setStats(data));
      } catch (error) {
        dispatch(actions.admin.setError(error.message || "后台概览加载失败"));
      }
    },

    loadAdminShares: () => async (dispatch) => {
      dispatch(actions.admin.setSharesLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setShares(m.mockAdminShares));
        return;
      }
      try {
        const { response, data } = await shareApi.list();
        if (!response.ok) throw new Error(data?.message || "分享列表加载失败");
        dispatch(actions.admin.setShares(data?.items || []));
      } catch (error) {
        dispatch(
          actions.admin.setSharesError(error.message || "分享列表加载失败"),
        );
      }
    },

    loadAdminHealth: () => async (dispatch) => {
      dispatch(actions.admin.setHealthLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setHealth(m.mockAdminHealth));
        return;
      }
      try {
        const { response, data } = await adminApi.health();
        if (!response.ok) throw new Error(data?.message || "健康检查加载失败");
        dispatch(actions.admin.setHealth(data));
      } catch (error) {
        dispatch(
          actions.admin.setHealthError(error.message || "健康检查加载失败"),
        );
      }
    },

    loadAdminLogs:
      (logPage = 1) =>
      async (dispatch, getState) => {
        dispatch(actions.admin.setLogsLoading(true));
        const filter = getState().admin.logsFilter;
        if (mock) {
          const m = await context.getMockModule();
          dispatch(actions.admin.setLogs(m.mockAdminLogs(logPage)));
          return;
        }
        try {
          const params = { page: logPage, size: 20, ...filter };
          const { response, data } = await adminApi.logs(params);
          if (!response.ok)
            throw new Error(data?.message || "操作日志加载失败");
          dispatch(
            actions.admin.setLogs({
              items: data.logs || [],
              page: data.currentPage || 1,
              totalPages: data.totalPages || 0,
            }),
          );
        } catch (error) {
          dispatch(
            actions.admin.setLogsError(error.message || "操作日志加载失败"),
          );
        }
      },

    loadAdminQuota: () => async (dispatch) => {
      dispatch(actions.admin.setQuotaLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setQuota(m.mockAdminQuota));
        return;
      }
      try {
        const { response, data } = await adminApi.quota();
        if (!response.ok) throw new Error(data?.message || "存储配额加载失败");
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
        if (!response.ok) throw new Error(data?.message || "设置存储配额失败");
        dispatchToast("success", "存储配额已更新");
        await dispatch(getThunks().loadAdminQuota());
      } catch (error) {
        dispatchToast("error", error.message || "设置存储配额失败");
      }
    },

    loadAdminProtectedPaths: () => async (dispatch) => {
      dispatch(actions.admin.setProtectedPathsLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setProtectedPaths(m.mockProtectedPaths));
        return;
      }
      try {
        const { response, data } = await adminApi.protectedPaths();
        if (!response.ok)
          throw new Error(data?.message || "受保护路径加载失败");
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
        if (!response.ok)
          throw new Error(data?.message || "创建受保护路径失败");
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
        if (!response.ok)
          throw new Error(data?.message || "删除受保护路径失败");
        dispatchToast("success", "受保护路径已删除");
        await dispatch(getThunks().loadAdminProtectedPaths());
      } catch (error) {
        dispatchToast("error", error.message || "删除受保护路径失败");
      }
    },

    loadAdminHiddenPaths: () => async (dispatch) => {
      dispatch(actions.admin.setHiddenPathsLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setHiddenPaths(m.mockHiddenPaths));
        return;
      }
      try {
        const { response, data } = await adminApi.hiddenPaths();
        if (!response.ok) throw new Error(data?.message || "隐藏路径加载失败");
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
        if (!response.ok) throw new Error(data?.message || "添加隐藏路径失败");
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
        if (!response.ok) throw new Error(data?.message || "删除隐藏路径失败");
        dispatchToast("success", "隐藏路径已删除");
        await dispatch(getThunks().loadAdminHiddenPaths());
      } catch (error) {
        dispatchToast("error", error.message || "删除隐藏路径失败");
      }
    },

    loadAdminStorageConfig: () => async (dispatch) => {
      dispatch(actions.admin.setStorageConfigLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setStorageConfig(m.mockStorageConfig));
        return;
      }
      try {
        const { response, data } = await adminApi.storageConfig();
        if (!response.ok) throw new Error(data?.message || "存储配置加载失败");
        dispatch(actions.admin.setStorageConfig(data));
      } catch (error) {
        dispatch(
          actions.admin.setStorageConfigError(
            error.message || "存储配置加载失败",
          ),
        );
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
        if (!response.ok) throw new Error(data?.message || "保存存储配置失败");
        dispatchToast("success", "存储配置已更新");
        dispatch(actions.admin.setStorageConfig(data));
      } catch (error) {
        dispatchToast("error", error.message || "保存存储配置失败");
        dispatch(actions.admin.setStorageConfigSaving(false));
      }
    },

    testAdminStorageSpace: (space) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await adminApi.testStorageSpace(space);
        if (!response.ok) throw new Error(data?.message || "连接测试失败");
        dispatchToast(
          data.success ? "success" : "error",
          data.success
            ? `连接成功（${data.durationMs}ms）`
            : `连接失败: ${data.error || ""}`,
        );
      } catch (error) {
        dispatchToast("error", error.message || "连接测试失败");
      }
    },

    loadAdminWebhooks: () => async (dispatch) => {
      dispatch(actions.admin.setWebhooksLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setWebhooks(m.mockWebhooks));
        return;
      }
      try {
        const { response, data } = await adminApi.webhooks();
        if (!response.ok)
          throw new Error(data?.message || "Webhook 配置加载失败");
        dispatch(actions.admin.setWebhooks(data.items || []));
      } catch (error) {
        dispatch(
          actions.admin.setWebhooksError(
            error.message || "Webhook 配置加载失败",
          ),
        );
      }
    },

    saveAdminWebhooks: (items) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await adminApi.saveWebhooks(items);
        if (!response.ok)
          throw new Error(data?.message || "保存 Webhook 配置失败");
        dispatchToast("success", "Webhook 配置已更新");
        dispatch(actions.admin.setWebhooks(data.items || []));
      } catch (error) {
        dispatchToast("error", error.message || "保存 Webhook 配置失败");
      }
    },

    testAdminWebhook: (endpoint) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      try {
        const { response, data } = await adminApi.testWebhook(endpoint);
        if (!response.ok) throw new Error(data?.message || "测试投递失败");
        dispatchToast(
          data.success ? "success" : "error",
          data.success
            ? `${data.name || "Webhook"} 测试成功（${data.durationMs || 0}ms）：${data.message || ""}`
            : `测试失败：${data.message || data.error || "未知错误"}`,
        );
      } catch (error) {
        dispatchToast("error", error.message || "测试投递失败");
      }
    },

    loadAdminWebhookDeliveries: () => async (dispatch) => {
      dispatch(actions.admin.setWebhookDeliveriesLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setWebhookDeliveries(m.mockWebhookDeliveries));
        return;
      }
      try {
        const { response, data } = await adminApi.webhookDeliveries();
        if (!response.ok) throw new Error(data?.message || "投递记录加载失败");
        dispatch(actions.admin.setWebhookDeliveries(data.items || []));
      } catch (error) {
        dispatch(actions.admin.setWebhookDeliveriesLoading(false));
        dispatchToast("error", error.message || "投递记录加载失败");
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

    loadTasks: () => async (dispatch) => {
      dispatch(actions.admin.setTasksLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(actions.admin.setTasks(m.mockTasks));
        return;
      }
      try {
        const { response, data } = await taskApi.list(20);
        if (!response.ok) throw new Error(data?.message || "任务列表加载失败");
        dispatch(actions.admin.setTasks(data.items || []));
      } catch (err) {
        console.error("loadTasks 错误:", err);
        dispatch(actions.admin.setTasksLoading(false));
      }
    },

    loadNotifications: () => async (dispatch, getState) => {
      dispatch(actions.admin.setNotificationsLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        const unread = m.mockNotifications.filter((n) => !n.read).length;
        dispatch(
          actions.admin.setNotifications({
            items: m.mockNotifications,
            unread,
          }),
        );
        return;
      }
      try {
        const { response, data } = await notificationApi.list(20);
        if (!response.ok) throw new Error(data?.message || "通知列表加载失败");
        const state = getState();
        const oldIds = state.admin.lastNotifIds;
        const newIds = (data.items || []).map((n) => n.id);
        if (state.admin.notifInitialized && newIds.length && oldIds.length) {
          const newUnread = (data.items || []).filter(
            (n) => !n.read && !oldIds.includes(n.id),
          );
          newUnread.forEach((n) => showNotificationAlert(n.message));
        }
        dispatch(actions.admin.setNotifications(data));
        dispatch(actions.admin.setLastNotifIds(newIds));
        if (!state.admin.notifInitialized) {
          dispatch(actions.admin.setNotifInitialized(true));
        }
      } catch (_) {
        dispatch(actions.admin.setNotificationsLoading(false));
      }
    },

    markNotificationRead: (id) => async (dispatch) => {
      if (mock) {
        const m = await context.getMockModule();
        dispatch(
          actions.admin.setNotificationsUnread(
            Math.max(0, m.mockNotifications.filter((n) => !n.read).length - 1),
          ),
        );
        return;
      }
      try {
        await notificationApi.markRead(id);
        await dispatch(getThunks().loadNotifications());
      } catch (err) { console.error("markNotificationRead 错误:", err); }
    },

    markAllNotificationsRead: () => async (dispatch) => {
      if (mock) {
        dispatch(actions.admin.setNotificationsUnread(0));
        return;
      }
      try {
        await notificationApi.markAllRead();
        await dispatch(getThunks().loadNotifications());
      } catch (err) { console.error("markAllNotificationsRead 错误:", err); }
    },

    loadAdminNotifications: () => async (dispatch) => {
      dispatch(actions.admin.setAdminNotifHistoryLoading(true));
      if (mock) {
        const m = await context.getMockModule();
        dispatch(
          actions.admin.setAdminNotifHistory({
            items: m.mockNotifications,
            unread: m.mockNotifications.filter((n) => !n.read).length,
          }),
        );
        return;
      }
      try {
        const { response, data } = await notificationApi.list(50);
        if (!response.ok) throw new Error(data?.message || "通知历史加载失败");
        dispatch(actions.admin.setAdminNotifHistory(data));
      } catch (err) {
        console.error("loadAdminNotifications 错误:", err);
        dispatch(actions.admin.setAdminNotifHistoryLoading(false));
      }
    },
  };
}
