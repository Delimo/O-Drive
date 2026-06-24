import { createSlice } from "../create-slice.js";

export const adminInitialState = {
  loading: false,
  statsLoadingHint: "",
  activeTab: "overview",
  stats: null,
  shares: [],
  sharesLoading: false,
  sharesError: "",
  shareBusyToken: "",
  shareFilter: "all",
  shareSearch: "",
  sharePage: 1,
  error: "",
  health: null,
  healthLoading: false,
  healthError: "",
  logs: [],
  logsLoading: false,
  logsError: "",
  logsPage: 1,
  logsTotalPages: 0,
  logsFilter: { q: "", action: "", from: "", to: "" },
  quota: null,
  quotaLoading: false,
  quotaError: "",
  protectedPaths: [],
  protectedPathsLoading: false,
  protectedPathsError: "",
  hiddenPaths: [],
  hiddenPathsLoading: false,
  hiddenPathsError: "",
  storageConfig: null,
  storageConfigLoading: false,
  storageConfigError: "",
  storageConfigSaving: false,
  webhooks: [],
  webhooksLoading: false,
  webhooksError: "",
  webhookDeliveries: [],
  webhookDeliveriesLoading: false,
  maintenance: null,
  maintenanceLoading: false,
  maintenanceError: "",
  maintenanceBusyAction: "",
  tasks: [],
  tasksLoading: false,
  activeUploadTaskId: "",
  trashRetention: null,
  trashRetentionLoading: false,
  trashCleanupBusy: false,
  notifications: [],
  notificationsUnread: 0,
  notificationsLoading: false,
  notifOpen: false,
  adminNotifHistory: [],
  adminNotifHistoryLoading: false,
  lastNotifIds: [],
  notifInitialized: false,
};

export function createAdminSlice(initialState) {
  return createSlice({
    name: "admin",
    initialState,
    reducers: {
      setActiveTab(state, action) {
        return { ...state, activeTab: action.payload || "overview" };
      },
      setLoading(state, action) {
        return { ...state, loading: action.payload, statsLoadingHint: "" };
      },
      setStatsLoadingHint(state, action) {
        return { ...state, statsLoadingHint: action.payload };
      },
      setStats(state, action) {
        return { ...state, loading: false, error: "", stats: action.payload };
      },
      setSharesLoading(state, action) {
        return { ...state, sharesLoading: action.payload };
      },
      setShares(state, action) {
        return {
          ...state,
          sharesLoading: false,
          sharesError: "",
          shares: action.payload || [],
        };
      },
      setSharesError(state, action) {
        return {
          ...state,
          sharesLoading: false,
          sharesError: action.payload,
          shares: [],
        };
      },
      setShareBusyToken(state, action) {
        return { ...state, shareBusyToken: action.payload || "" };
      },
      setShareFilter(state, action) {
        return { ...state, shareFilter: action.payload, sharePage: 1 };
      },
      setShareSearch(state, action) {
        return { ...state, shareSearch: action.payload, sharePage: 1 };
      },
      setSharePage(state, action) {
        return { ...state, sharePage: action.payload };
      },
      setError(state, action) {
        return { ...state, loading: false, error: action.payload };
      },
      setHealthLoading(state, action) {
        return { ...state, healthLoading: action.payload };
      },
      setHealth(state, action) {
        return {
          ...state,
          healthLoading: false,
          healthError: "",
          health: action.payload,
        };
      },
      setHealthError(state, action) {
        return {
          ...state,
          healthLoading: false,
          healthError: action.payload,
          health: null,
        };
      },
      setLogsLoading(state, action) {
        return { ...state, logsLoading: action.payload };
      },
      setLogs(state, action) {
        const { items, page, totalPages } = action.payload || {};
        return {
          ...state,
          logsLoading: false,
          logsError: "",
          logs: items || [],
          logsPage: page || 1,
          logsTotalPages: totalPages || 0,
        };
      },
      setLogsError(state, action) {
        return {
          ...state,
          logsLoading: false,
          logsError: action.payload,
          logs: [],
        };
      },
      setLogsFilter(state, action) {
        return {
          ...state,
          logsFilter: { ...state.logsFilter, ...(action.payload || {}) },
        };
      },
      setQuotaLoading(state, action) {
        return { ...state, quotaLoading: action.payload };
      },
      setQuota(state, action) {
        return {
          ...state,
          quotaLoading: false,
          quotaError: "",
          quota: action.payload,
        };
      },
      setQuotaError(state, action) {
        return {
          ...state,
          quotaLoading: false,
          quotaError: action.payload,
          quota: null,
        };
      },
      setProtectedPathsLoading(state, action) {
        return { ...state, protectedPathsLoading: action.payload };
      },
      setProtectedPaths(state, action) {
        return {
          ...state,
          protectedPathsLoading: false,
          protectedPathsError: "",
          protectedPaths: action.payload || [],
        };
      },
      setProtectedPathsError(state, action) {
        return {
          ...state,
          protectedPathsLoading: false,
          protectedPathsError: action.payload,
          protectedPaths: [],
        };
      },
      setHiddenPathsLoading(state, action) {
        return { ...state, hiddenPathsLoading: action.payload };
      },
      setHiddenPaths(state, action) {
        return {
          ...state,
          hiddenPathsLoading: false,
          hiddenPathsError: "",
          hiddenPaths: action.payload || [],
        };
      },
      setHiddenPathsError(state, action) {
        return {
          ...state,
          hiddenPathsLoading: false,
          hiddenPathsError: action.payload,
          hiddenPaths: [],
        };
      },
      setStorageConfigLoading(state, action) {
        return { ...state, storageConfigLoading: action.payload };
      },
      setStorageConfig(state, action) {
        return {
          ...state,
          storageConfigLoading: false,
          storageConfigError: "",
          storageConfigSaving: false,
          storageConfig: action.payload,
        };
      },
      setStorageConfigError(state, action) {
        return {
          ...state,
          storageConfigLoading: false,
          storageConfigError: action.payload,
          storageConfig: null,
          storageConfigSaving: false,
        };
      },
      setStorageConfigSaving(state, action) {
        return { ...state, storageConfigSaving: action.payload };
      },
      setWebhooksLoading(state, action) {
        return { ...state, webhooksLoading: action.payload };
      },
      setWebhooks(state, action) {
        return {
          ...state,
          webhooksLoading: false,
          webhooksError: "",
          webhooks: action.payload || [],
        };
      },
      setWebhooksError(state, action) {
        return {
          ...state,
          webhooksLoading: false,
          webhooksError: action.payload,
          webhooks: [],
        };
      },
      setWebhookDeliveriesLoading(state, action) {
        return { ...state, webhookDeliveriesLoading: action.payload };
      },
      setWebhookDeliveries(state, action) {
        return {
          ...state,
          webhookDeliveriesLoading: false,
          webhookDeliveries: action.payload || [],
        };
      },
      setMaintenanceLoading(state, action) {
        return { ...state, maintenanceLoading: action.payload };
      },
      setMaintenance(state, action) {
        return {
          ...state,
          maintenanceLoading: false,
          maintenanceError: "",
          maintenance: action.payload,
        };
      },
      setMaintenanceError(state, action) {
        return {
          ...state,
          maintenanceLoading: false,
          maintenanceError: action.payload,
          maintenance: null,
        };
      },
      setMaintenanceBusyAction(state, action) {
        return { ...state, maintenanceBusyAction: action.payload || "" };
      },
      setTasksLoading(state, action) {
        return { ...state, tasksLoading: action.payload };
      },
      setTasks(state, action) {
        return { ...state, tasksLoading: false, tasks: action.payload || [] };
      },
      setActiveUploadTaskId(state, action) {
        return { ...state, activeUploadTaskId: action.payload || "" };
      },
      setTrashRetention(state, action) {
        return { ...state, trashRetention: action.payload, trashRetentionLoading: false };
      },
      setTrashRetentionLoading(state, action) {
        return { ...state, trashRetentionLoading: !!action.payload };
      },
      setTrashCleanupBusy(state, action) {
        return { ...state, trashCleanupBusy: !!action.payload };
      },
      setNotifications(state, action) {
        return {
          ...state,
          notificationsLoading: false,
          notifications: action.payload?.items || [],
          notificationsUnread: action.payload?.unread || 0,
        };
      },
      setNotificationsLoading(state, action) {
        return { ...state, notificationsLoading: action.payload || false };
      },
      addNotification(state, action) {
        return {
          ...state,
          notifications: [action.payload, ...state.notifications],
          notificationsUnread: state.notificationsUnread + 1,
        };
      },
      setNotificationsUnread(state, action) {
        return { ...state, notificationsUnread: action.payload || 0 };
      },
      setNotifOpen(state, action) {
        return { ...state, notifOpen: !!action.payload };
      },
      setAdminNotifHistory(state, action) {
        return {
          ...state,
          adminNotifHistoryLoading: false,
          adminNotifHistory: action.payload?.items || [],
          notificationsUnread:
            action.payload?.unread ?? state.notificationsUnread,
        };
      },
      setAdminNotifHistoryLoading(state, action) {
        return { ...state, adminNotifHistoryLoading: action.payload || false };
      },
      setLastNotifIds(state, action) {
        return { ...state, lastNotifIds: action.payload || [] };
      },
      setNotifInitialized(state, action) {
        return { ...state, notifInitialized: !!action.payload };
      },
    },
  });
}
