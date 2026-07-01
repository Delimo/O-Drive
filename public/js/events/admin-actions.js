export function registerAdminActions(documentRef, windowRef, store, actions, thunks, dispatchToast, copyText) {
  return (event) => {
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode) return;

    const { action, key } = actionNode.dataset;

    if (action === "set-admin-tab") {
      const tab = actionNode.dataset.tab || "overview";
      store.dispatch(actions.admin.setActiveTab(tab));
      store.dispatch(thunks.loadTabData(tab));
      return;
    }

    if (action === "refresh-admin") {
      store.dispatch(thunks.loadAdminStats());
      return;
    }

    if (action === "refresh-admin-shares") {
      store.dispatch(thunks.loadAdminShares());
      return;
    }

    if (action === "refresh-admin-health") {
      store.dispatch(thunks.loadAdminHealth());
      return;
    }

    if (action === "refresh-admin-logs") {
      store.dispatch(thunks.loadAdminLogs(1));
      return;
    }

    if (action === "reset-logs-filter") {
      store.dispatch(actions.admin.setLogsFilter({ q: "", action: "", ip: "", from: "", to: "" }));
      store.dispatch(thunks.loadAdminLogs(1));
      return;
    }

    if (action === "refresh-admin-quota") {
      store.dispatch(thunks.loadAdminQuota());
      return;
    }

    if (action === "refresh-admin-protected-paths") {
      store.dispatch(thunks.loadAdminProtectedPaths());
      return;
    }

    if (action === "refresh-admin-hidden-paths") {
      store.dispatch(thunks.loadAdminHiddenPaths());
      return;
    }

    if (action === "show-add-hidden-path") {
      store.dispatch(actions.app.setModal({ type: "add-hidden-path", loading: false, error: "", path: "" }));
      return;
    }

    if (action === "confirm-delete-hidden-path") {
      const delPath = actionNode.dataset.path || key;
      store.dispatch(actions.app.setModal({ type: "confirm-delete-hidden-path", loading: false, error: "", path: delPath }));
      return;
    }

    if (action === "execute-delete-hidden-path") {
      const delPath = actionNode.dataset.path || key;
      store.dispatch(thunks.deleteAdminHiddenPath(delPath));
      return;
    }

    if (action === "refresh-admin-storage-config") {
      store.dispatch(thunks.loadAdminStorageConfig());
      return;
    }

    if (action === "show-edit-storage-quota") {
      const config = store.getState().admin.storageConfig;
      store.dispatch(actions.app.setModal({ type: "edit-storage-quota", loading: false, error: "", r2QuotaBytes: config?.r2?.quotaBytes || 0 }));
      return;
    }

    if (action === "save-storage-alert-thresholds") {
      const config = store.getState().admin.storageConfig;
      if (!config) return;
      const enabled = documentRef.querySelector('[data-binding="storage-alert-enabled"]')?.checked !== false;
      const warningInput = documentRef.querySelector('[data-binding="storage-alert-warning"]');
      const errorInput = documentRef.querySelector('[data-binding="storage-alert-error"]');
      const warning = Math.min(100, Math.max(1, parseInt(warningInput?.value || "90", 10) || 90));
      const error = Math.min(100, Math.max(warning, parseInt(errorInput?.value || "95", 10) || 95));
      store.dispatch(thunks.saveAdminStorageConfig({
        ...config,
        r2QuotaBytes: config?.r2?.quotaBytes || config?.r2QuotaBytes || 0,
        r2AlertEnabled: enabled,
        r2AlertWarningPercent: warning,
        r2AlertErrorPercent: error,
      }));
      return;
    }

    if (action === "refresh-admin-webhooks") {
      store.dispatch(thunks.loadAdminWebhooks());
      return;
    }

    if (action === "set-webhook-record-tab") {
      store.dispatch(actions.admin.setWebhookRecordTab(actionNode.dataset.tab || "deliveries"));
      return;
    }

    if (action === "refresh-admin-webhook-deliveries") {
      store.dispatch(thunks.loadAdminWebhookDeliveries());
      return;
    }

    if (action === "retry-webhook-delivery") {
      const id = Number(actionNode.dataset.id || key || 0);
      if (id) store.dispatch(thunks.retryAdminWebhookDelivery(id));
      return;
    }

    if (action === "refresh-admin-maintenance") {
      store.dispatch(thunks.loadMaintenanceSnapshot());
      return;
    }

    if (action === "refresh-tasks") {
      store.dispatch(thunks.loadTasks());
      return;
    }

    if (action === "retry-task") {
      const id = actionNode.dataset.id || "";
      if (id) store.dispatch(thunks.retryTask(id));
      return;
    }

    if (action === "save-task-alert-thresholds") {
      const enabled = documentRef.querySelector('[data-binding="task-alert-enabled"]')?.checked !== false;
      const windowHoursInput = documentRef.querySelector('[data-binding="task-alert-window-hours"]');
      const warningInput = documentRef.querySelector('[data-binding="task-alert-warning"]');
      const errorInput = documentRef.querySelector('[data-binding="task-alert-error"]');
      const windowHours = Math.min(168, Math.max(1, parseInt(windowHoursInput?.value || "24", 10) || 24));
      const warningCount = Math.min(1000, Math.max(1, parseInt(warningInput?.value || "3", 10) || 3));
      const errorCount = Math.min(1000, Math.max(warningCount, parseInt(errorInput?.value || "10", 10) || 10));
      store.dispatch(thunks.saveTaskAlertConfig({
        enabled,
        windowHours,
        warningCount,
        errorCount,
      }));
      return;
    }

    if (action === "refresh-admin-notifications") {
      store.dispatch(thunks.loadAdminNotifications());
      return;
    }

    if (action === "admin-mark-notif-read") {
      const id = actionNode.dataset.notifId;
      if (id) {
        store.dispatch(thunks.markNotificationRead(Number(id)));
        store.dispatch(thunks.loadAdminNotifications());
      }
      return;
    }

    if (action === "confirm-maintenance-action") {
      const maintAction = actionNode.dataset.maintenanceAction || "";
      const maintLabel = actionNode.dataset.maintenanceLabel || "";
      store.dispatch(actions.app.setModal({ type: "confirm-maintenance-action", loading: false, error: "", maintenanceAction: maintAction, maintenanceLabel: maintLabel }));
      return;
    }

    if (action === "execute-maintenance-action") {
      const modal = store.getState().app.modal;
      if (!modal || !modal.maintenanceAction) return;
      store.dispatch(thunks.executeMaintenanceAction(modal.maintenanceAction));
      return;
    }

    if (action === "save-trash-retention") {
      const input = documentRef.querySelector('[data-binding="trash-retention-days"]');
      if (!input) return;
      const days = Math.max(0, parseInt(input.value, 10) || 0);
      store.dispatch(thunks.setTrashRetention(days));
      return;
    }

    if (action === "cleanup-trash-by-retention") {
      store.dispatch(thunks.cleanupTrashByRetention());
      return;
    }

    if (action === "show-add-webhook") {
      store.dispatch(actions.app.setModal({ type: "add-webhook", loading: false, error: "", name: "", url: "", msgtype: "json", method: "POST", contentType: "application/json", headers: "", body: "", events: [], enabled: true }));
      return;
    }

    if (action === "edit-webhook") {
      const whId = actionNode.dataset.id || key;
      const webhooks = store.getState().admin.webhooks || [];
      const wh = webhooks.find((w) => w.id === whId);
      if (!wh) return;
      store.dispatch(actions.app.setModal({ type: "edit-webhook", loading: false, error: "", ...wh, headers: wh.headers ? JSON.stringify(wh.headers, null, 2) : "" }));
      return;
    }

    if (action === "confirm-delete-webhook") {
      const whId = actionNode.dataset.id || key;
      const whName = actionNode.dataset.name || whId;
      store.dispatch(actions.app.setModal({ type: "confirm-delete-webhook", loading: false, error: "", id: whId, name: whName }));
      return;
    }

    if (action === "execute-delete-webhook") {
      const modal = store.getState().app.modal;
      if (!modal) return;
      const webhooks = (store.getState().admin.webhooks || []).filter((w) => w.id !== modal.id);
      store.dispatch(actions.app.setModal(null));
      store.dispatch(thunks.saveAdminWebhooks(webhooks));
      return;
    }

    if (action === "test-webhook") {
      const whId = actionNode.dataset.id || key;
      const webhooks = store.getState().admin.webhooks || [];
      const wh = webhooks.find((w) => w.id === whId);
      if (wh) store.dispatch(thunks.testAdminWebhook(wh));
      return;
    }

    if (action === "show-add-protected-path") {
      store.dispatch(actions.app.setModal({ type: "add-protected-path", loading: false, error: "", path: "", password: "", note: "", showName: "" }));
      return;
    }

    if (action === "confirm-delete-protected-path") {
      const delPath = actionNode.dataset.path || key;
      store.dispatch(actions.app.setModal({ type: "confirm-delete-protected-path", loading: false, error: "", path: delPath }));
      return;
    }

    if (action === "execute-delete-protected-path") {
      const delPath = actionNode.dataset.path || key;
      store.dispatch(thunks.deleteAdminProtectedPath(delPath));
      return;
    }

    if (action === "set-logs-page") {
      const page = parseInt(actionNode.dataset.page, 10);
      if (page > 0) store.dispatch(thunks.loadAdminLogs(page));
      return;
    }

    if (action === "export-logs-csv") {
      const adminState = store.getState().admin;
      const logs = adminState.logs || [];
      if (logs.length === 0) {
        dispatchToast("info", "当前没有可导出的日志记录");
        return;
      }

      const headers = ["ID", "操作", "路径", "用户", "IP", "时间", "详情"];
      const rows = logs.map(item => [
        item.id || "",
        item.action || "",
        item.path || "",
        item.user || "",
        item.ip || "",
        item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : "",
        item.detail || ""
      ]);

      const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
        + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

      const encodedUri = encodeURI(csvContent);
      const link = documentRef.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `admin_logs_${new Date().toISOString().slice(0,10)}.csv`);
      documentRef.body.appendChild(link);
      link.click();
      documentRef.body.removeChild(link);
      dispatchToast("success", "日志 CSV 导出成功");
      return;
    }

    if (action === "set-share-filter" || action === "set-shares-filter") {
      const filter = actionNode.dataset.filter || event.target?.value || "all";
      store.dispatch(actions.admin.setShareFilter(filter));
      return;
    }

    if (action === "confirm-delete-share") {
      const shareName = actionNode.dataset.name || key;
      store.dispatch(actions.app.setModal({ type: "confirm-delete-share", loading: false, error: "", token: key, shareName }));
      return;
    }

    if (action === "confirm-reactivate-share") {
      const shareName = actionNode.dataset.name || key;
      store.dispatch(actions.app.setModal({
        type: "reactivate-share",
        loading: false,
        error: "",
        token: key,
        shareName,
        values: { expiresInDays: "7" },
      }));
      return;
    }

    if (action === "confirm-cleanup-expired-shares") {
      store.dispatch(actions.app.setModal({ type: "confirm-cleanup-expired", loading: false, error: "" }));
      return;
    }

    if (action === "execute-delete-share") {
      const tokenToDelete = actionNode.dataset.key || key;
      store.dispatch(thunks.deleteShareWithModal(tokenToDelete));
      return;
    }

    if (action === "execute-cleanup-expired-shares") {
      store.dispatch(thunks.cleanupExpiredSharesWithModal());
      return;
    }

    if (action === "cleanup-expired-shares") {
      store.dispatch(thunks.cleanupExpiredShares());
      return;
    }

    if (action === "delete-share") {
      store.dispatch(thunks.deleteShare(key || ""));
      return;
    }

    if (action === "copy-share-link") {
      if (!key) return;
      copyText(`${windowRef.location.origin}/share.html?token=${encodeURIComponent(key)}`, "分享链接已复制");
      return;
    }

    if (action === "copy-webdav-url") {
      const url = actionNode.dataset.url;
      if (url) copyText(url, "WebDAV 地址已复制");
      return;
    }
  };
}
