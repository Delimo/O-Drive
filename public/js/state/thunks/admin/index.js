import { createAuthThunks } from "./auth.js";
import { createAdminNotificationThunks, cleanupAudioContext } from "./notifications.js";
import { createAdminStatsThunks } from "./stats.js";
import { createAdminStorageThunks } from "./storage.js";
import { createAdminTaskThunks } from "./tasks.js";
import { createAdminWebhookThunks } from "./webhooks.js";

export { cleanupAudioContext };

export function createAdminThunks(deps, context) {
  const shared = {
    ...deps,
    ...context,
    page: deps.getPage(),
  };

  return {
    ...createAuthThunks(shared),
    ...createAdminStatsThunks(shared),
    ...createAdminStorageThunks(shared),
    ...createAdminWebhookThunks(shared),
    ...createAdminTaskThunks(shared),
    ...createAdminNotificationThunks(shared),

    loadTabData: (tabId) => async (dispatch, getState) => {
      const admin = getState().admin;
      const t = context.getThunks();
      switch (tabId) {
        case "overview":
          if (!admin.stats) dispatch(t.loadAdminStats());
          break;
        case "shares":
          if (admin.shares.length === 0 && !admin.sharesLoading)
            dispatch(t.loadAdminShares());
          break;
        case "logs":
          if (!admin.logsLoading) dispatch(t.loadAdminLogs(1));
          break;
        case "paths":
          if (admin.protectedPaths.length === 0 && !admin.protectedPathsLoading)
            dispatch(t.loadAdminProtectedPaths());
          if (admin.hiddenPaths.length === 0 && !admin.hiddenPathsLoading)
            dispatch(t.loadAdminHiddenPaths());
          break;
        case "storage":
          if (!admin.storageConfig && !admin.storageConfigLoading)
            dispatch(t.loadAdminStorageConfig());
          if (!admin.trashRetention && !admin.trashRetentionLoading)
            dispatch(t.loadTrashRetention());
          if (admin.trashPreviewItems.length === 0 && !admin.trashPreviewLoading)
            dispatch(t.loadAdminTrashPreview());
          if (admin.protectedPaths.length === 0 && !admin.protectedPathsLoading)
            dispatch(t.loadAdminProtectedPaths());
          if (admin.hiddenPaths.length === 0 && !admin.hiddenPathsLoading)
            dispatch(t.loadAdminHiddenPaths());
          break;
        case "maintenance":
          if (!admin.maintenance && !admin.maintenanceLoading)
            dispatch(t.loadMaintenanceSnapshot());
          if (admin.tasks.length === 0 && !admin.tasksLoading)
            dispatch(t.loadTasks());
          if (!admin.trashRetention && !admin.trashRetentionLoading)
            dispatch(t.loadTrashRetention());
          break;
        case "system":
          if (!admin.health && !admin.healthLoading)
            dispatch(t.loadAdminHealth());
          if (!admin.quota && !admin.quotaLoading)
            dispatch(t.loadAdminQuota());
          break;
        case "webhook":
          if (admin.webhooks.length === 0 && !admin.webhooksLoading)
            dispatch(t.loadAdminWebhooks());
          if (admin.webhookDeliveries.length === 0 && !admin.webhookDeliveriesLoading)
            dispatch(t.loadAdminWebhookDeliveries());
          if (admin.adminNotifHistory.length === 0 && !admin.adminNotifHistoryLoading)
            dispatch(t.loadAdminNotifications());
          break;
      }
    },
  };
}
