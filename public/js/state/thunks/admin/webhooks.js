import { assertApiOk } from "../errors.js";

export function createAdminWebhookThunks({
  actions,
  adminApi,
  dispatchToast,
  humanError,
  mock,
  getMockModule,
  getThunks,
}) {
  return {
    loadAdminWebhooks: () => async (dispatch) => {
      dispatch(actions.admin.setWebhooksLoading(true));
      if (mock) {
        const m = await getMockModule();
        dispatch(actions.admin.setWebhooks(m.mockWebhooks));
        return;
      }
      try {
        const { response, data } = await adminApi.webhooks();
        assertApiOk(response, data, "Webhook 配置加载失败", humanError);
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
        assertApiOk(response, data, "保存 Webhook 配置失败", humanError);
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
        assertApiOk(response, data, "测试投递失败", humanError, {
          allowSuccessFalse: true,
        });
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
        const m = await getMockModule();
        dispatch(actions.admin.setWebhookDeliveries(m.mockWebhookDeliveries));
        return;
      }
      try {
        const { response, data } = await adminApi.webhookDeliveries();
        assertApiOk(response, data, "投递记录加载失败", humanError);
        dispatch(actions.admin.setWebhookDeliveries(data.items || []));
      } catch (error) {
        dispatch(actions.admin.setWebhookDeliveriesLoading(false));
        dispatchToast("error", error.message || "投递记录加载失败");
      }
    },

    retryAdminWebhookDelivery: (id) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const deliveryId = Number(id || 0);
      if (!deliveryId) return;
      dispatch(actions.admin.setWebhookRetryingId(deliveryId));
      try {
        const { response, data } = await adminApi.retryWebhookDelivery(deliveryId);
        assertApiOk(response, data, "重试投递失败", humanError, {
          allowSuccessFalse: true,
        });
        dispatchToast(
          data.success ? "success" : "error",
          data.success
            ? `${data.endpoint || "Webhook"} 重试成功（${data.durationMs || 0}ms）`
            : `重试失败：${data.error || data.message || "未知错误"}`,
        );
        await dispatch(getThunks().loadAdminWebhookDeliveries());
      } catch (error) {
        dispatchToast("error", error.message || "重试投递失败");
      } finally {
        dispatch(actions.admin.setWebhookRetryingId(0));
      }
    },
  };
}
