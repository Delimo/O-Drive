import {
  getInitialPath,
  getInitialSearch,
  getShareToken,
} from "../utils/path.js";

function createSlice({ name, initialState: sliceState, reducers }) {
  const actionCreators = {};
  const caseMap = {};

  Object.entries(reducers).forEach(([key, reducer]) => {
    const type = `${name}/${key}`;
    caseMap[type] = reducer;
    actionCreators[key] = (payload) => ({ type, payload });
  });

  const reducer = (state = sliceState, action) => {
    const current = caseMap[action.type];
    return current ? current(state, action) : state;
  };

  return { actions: actionCreators, reducer };
}

function combineReducers(reducers) {
  return (state, action) => {
    const next = {};
    for (const [key, reducer] of Object.entries(reducers)) {
      next[key] = reducer(state[key], action);
    }
    return next;
  };
}

function createStore(reducer, state) {
  let currentState = state;
  const listeners = new Set();

  return {
    getState() {
      return currentState;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      if (typeof action === "function") {
        return action(this.dispatch.bind(this), this.getState.bind(this));
      }
      currentState = reducer(currentState, action);
      listeners.forEach((listener) => listener());
      return action;
    },
  };
}

export function createRootStore({ page }) {
  const initialState = {
    app: {
      page,
      role: "guest",
      csrf: "",
      booting: true,
      toast: null,
      modal: null,
      now: Date.now(),
      dragging: false,
    },
    explorer: {
      path: getInitialPath(),
      storageId: "r2",
      loading: false,
      query: getInitialSearch(),
      queryDraft: getInitialSearch(),
      showFilters: false,
      filterKind: "all",
      filterMinSize: "",
      filterMaxSize: "",
      filterDateFrom: "",
      filterDateTo: "",
      searchCursor: "",
      hasMore: false,
      view: "grid",
      sort: "smart",
      sortField: "name",
      sortDir: "asc",
      filter: "all",
      folders: [],
      files: [],
      trashItems: [],
      trashMode: false,
      selectedKey: "",
      selectedKeys: [],
      trashSelectedKeys: [],
      clipboard: null,
      expandedCrumbs: false,
      error: "",
      searching: false,
      batchBusy: false,
      trashBatchBusy: false,
    },
    admin: {
      loading: false,
      activeTab: "overview",
      stats: null,
      shares: [],
      sharesLoading: false,
      sharesError: "",
      shareBusyToken: "",
      shareFilter: "all",
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
    },
    share: {
      token: getShareToken(),
      loading: false,
      item: null,
      error: "",
      requiresPassword: false,
      password: "",
    },
    uploads: {
      items: [],
      conflictMode: "rename",
      pendingFiles: null,
    },
  };

  const appSlice = createSlice({
    name: "app",
    initialState: initialState.app,
    reducers: {
      setBooting(state, action) {
        return { ...state, booting: action.payload };
      },
      setRole(state, action) {
        return {
          ...state,
          role: action.payload.role,
          csrf: action.payload.csrf || "",
        };
      },
      setToast(state, action) {
        return { ...state, toast: action.payload };
      },
      clearToast(state) {
        return { ...state, toast: null };
      },
      setModal(state, action) {
        return { ...state, modal: action.payload };
      },
      setNow(state, action) {
        return { ...state, now: action.payload };
      },
      setDragging(state, action) {
        return { ...state, dragging: action.payload };
      },
    },
  });

  const explorerSlice = createSlice({
    name: "explorer",
    initialState: initialState.explorer,
    reducers: {
      setLoading(state, action) {
        return { ...state, loading: action.payload };
      },
      setPath(state, action) {
        return { ...state, path: action.payload };
      },
      setQueryDraft(state, action) {
        return { ...state, queryDraft: action.payload };
      },
      setQuery(state, action) {
        return { ...state, query: action.payload };
      },
      setView(state, action) {
        return { ...state, view: action.payload };
      },
      setSort(state, action) {
        return { ...state, sort: action.payload };
      },
      setSortList(state, action) {
        const { field, dir } = action.payload;
        return { ...state, sortField: field, sortDir: dir };
      },
      setSearching(state, action) {
        return { ...state, searching: action.payload };
      },
      setBatchBusy(state, action) {
        return { ...state, batchBusy: action.payload };
      },
      setFilter(state, action) {
        return { ...state, filter: action.payload };
      },
      setSelection(state, action) {
        return { ...state, selectedKey: action.payload };
      },
      setSelectedKeys(state, action) {
        return { ...state, selectedKeys: action.payload };
      },
      setTrashSelectedKeys(state, action) {
        return { ...state, trashSelectedKeys: action.payload };
      },
      setTrashBatchBusy(state, action) {
        return { ...state, trashBatchBusy: action.payload };
      },
      setClipboard(state, action) {
        return { ...state, clipboard: action.payload };
      },
      setExpandedCrumbs(state, action) {
        return { ...state, expandedCrumbs: action.payload };
      },
      setTrashMode(state, action) {
        return { ...state, trashMode: action.payload };
      },
      setData(state, action) {
        return {
          ...state,
          loading: false,
          error: "",
          folders: action.payload.folders || [],
          files: action.payload.files || [],
          trashItems: action.payload.trashItems || [],
          storageId: action.payload.storageId || state.storageId,
          selectedKeys: [],
        };
      },
      setSearchData(state, action) {
        const { files, cursor, hasMore } = action.payload || {};
        return {
          ...state,
          loading: false,
          error: "",
          folders: [],
          files: files || [],
          searchCursor: cursor || "",
          hasMore: hasMore || false,
          selectedKeys: [],
        };
      },
      appendSearchResults(state, action) {
        const { files, cursor, hasMore } = action.payload || {};
        const existing = state.files || [];
        return {
          ...state,
          loading: false,
          error: "",
          files: [...existing, ...(files || [])],
          searchCursor: cursor || "",
          hasMore: hasMore || false,
          selectedKeys: [],
        };
      },
      setShowFilters(state, action) {
        return { ...state, showFilters: action.payload };
      },
      setFilterKind(state, action) {
        return { ...state, filterKind: action.payload };
      },
      setFilterMinSize(state, action) {
        return { ...state, filterMinSize: action.payload };
      },
      setFilterMaxSize(state, action) {
        return { ...state, filterMaxSize: action.payload };
      },
      setFilterDateFrom(state, action) {
        return { ...state, filterDateFrom: action.payload };
      },
      setFilterDateTo(state, action) {
        return { ...state, filterDateTo: action.payload };
      },
      setError(state, action) {
        return { ...state, loading: false, error: action.payload };
      },
    },
  });

  const adminSlice = createSlice({
    name: "admin",
    initialState: initialState.admin,
    reducers: {
      setActiveTab(state, action) {
        return { ...state, activeTab: action.payload || "overview" };
      },
      setLoading(state, action) {
        return { ...state, loading: action.payload };
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
        return { ...state, shareFilter: action.payload || "all" };
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

  const shareSlice = createSlice({
    name: "share",
    initialState: initialState.share,
    reducers: {
      setLoading(state, action) {
        return { ...state, loading: action.payload };
      },
      setToken(state, action) {
        return { ...state, token: action.payload };
      },
      setPassword(state, action) {
        return { ...state, password: action.payload };
      },
      setData(state, action) {
        return {
          ...state,
          loading: false,
          item: action.payload,
          error: "",
          requiresPassword: false,
        };
      },
      setPasswordRequired(state, action) {
        return {
          ...state,
          loading: false,
          requiresPassword: true,
          error: action.payload || "",
        };
      },
      setError(state, action) {
        return { ...state, loading: false, error: action.payload };
      },
    },
  });

  const uploadsSlice = createSlice({
    name: "uploads",
    initialState: initialState.uploads,
    reducers: {
      enqueue(state, action) {
        return { ...state, items: [...state.items, ...(action.payload || [])] };
      },
      update(state, action) {
        const { id, ...patch } = action.payload || {};
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        };
      },
      remove(state, action) {
        return {
          ...state,
          items: state.items.filter((item) => item.id !== action.payload),
        };
      },
      clearFinished(state) {
        return {
          ...state,
          items: state.items.filter(
            (item) => item.status === "pending" || item.status === "uploading",
          ),
        };
      },
      clearAll(state) {
        return { ...state, items: [] };
      },
      cancelItem(state, action) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload
              ? { ...item, status: "cancelling" }
              : item,
          ),
        };
      },
      setCancelled(state, action) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload
              ? { ...item, status: "cancelled", progress: 0 }
              : item,
          ),
        };
      },
      pauseItem(state, action) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload ? { ...item, status: "paused" } : item,
          ),
        };
      },
      pauseAll(state) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.status === "pending" || item.status === "uploading"
              ? { ...item, status: "paused" }
              : item,
          ),
        };
      },
      resumeAll(state) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.status === "paused"
              ? { ...item, status: "pending" }
              : item,
          ),
        };
      },
      resumeItem(state, action) {
        const resumeData = action.payload?.resumeData;
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload?.id
              ? { ...item, status: "pending", ...(resumeData || {}) }
              : item,
          ),
        };
      },
      retryItem(state, action) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload
              ? { ...item, status: "pending", progress: 0, error: "" }
              : item,
          ),
        };
      },
      setConflictMode(state, action) {
        return { ...state, conflictMode: action.payload || "rename" };
      },
      setPendingFiles(state, action) {
        return { ...state, pendingFiles: action.payload };
      },
      clearPendingFiles(state) {
        return { ...state, pendingFiles: null };
      },
    },
  });

  const actions = {
    app: appSlice.actions,
    explorer: explorerSlice.actions,
    admin: adminSlice.actions,
    share: shareSlice.actions,
    uploads: uploadsSlice.actions,
  };

  const store = createStore(
    combineReducers({
      app: appSlice.reducer,
      explorer: explorerSlice.reducer,
      admin: adminSlice.reducer,
      share: shareSlice.reducer,
      uploads: uploadsSlice.reducer,
    }),
    initialState,
  );

  return { store, actions };
}
