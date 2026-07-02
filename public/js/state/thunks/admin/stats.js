import { assertApiOk } from "../errors.js";

export function createAdminStatsThunks({
  actions,
  adminApi,
  shareApi,
  humanError,
  mock,
  getMockModule,
  getThunks,
}) {
  return {
    loadAdminStats: () => async (dispatch) => {
      dispatch(actions.admin.setLoading(true));
      if (mock) {
        const m = await getMockModule();
        dispatch(actions.admin.setStats(m.mockAdminStats));
        return;
      }
      let hintTimer = null;
      let retryTimer = null;
      try {
        hintTimer = setTimeout(() => {
          dispatch(actions.admin.setStatsLoadingHint("索引数据量较大，正在后台处理，请耐心等待..."));
        }, 15000);
        const { response, data } = await adminApi.stats();
        assertApiOk(response, data, "后台概览加载失败", humanError);
        if (data?.indexing) {
          dispatch(actions.admin.setStatsLoadingHint("文件索引正在后台构建中，10秒后自动刷新..."));
          retryTimer = setTimeout(() => {
            dispatch(getThunks().loadAdminStats());
          }, 10000);
          return;
        }
        dispatch(actions.admin.setStats(data));
      } catch (error) {
        dispatch(actions.admin.setError(error.message || "后台概览加载失败"));
      } finally {
        if (hintTimer) clearTimeout(hintTimer);
      }
    },

    loadAdminShares: () => async (dispatch) => {
      dispatch(actions.admin.setSharesLoading(true));
      if (mock) {
        const m = await getMockModule();
        dispatch(actions.admin.setShares(m.mockAdminShares));
        return;
      }
      try {
        const { response, data } = await shareApi.list();
        assertApiOk(response, data, "分享列表加载失败", humanError);
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
        const m = await getMockModule();
        dispatch(actions.admin.setHealth(m.mockAdminHealth));
        return;
      }
      try {
        const { response, data } = await adminApi.health();
        assertApiOk(response, data, "健康检查加载失败", humanError);
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
          const m = await getMockModule();
          dispatch(actions.admin.setLogs(m.mockAdminLogs(logPage)));
          return;
        }
        try {
          const params = { page: logPage, size: 20, ...filter };
          const { response, data } = await adminApi.logs(params);
          assertApiOk(response, data, "操作日志加载失败", humanError);
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
  };
}
