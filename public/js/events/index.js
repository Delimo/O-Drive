import { registerFileActions } from './file-actions.js';
import { registerAdminActions } from './admin-actions.js';
import { registerUploadActions } from './upload-actions.js';
import { registerNavigationActions } from './navigation-actions.js';
import { registerUiActions } from './ui-actions.js';
import { clearUploadAutoTimers } from '../state/thunks/upload.js';

export function registerAppEvents(deps) {
  const {
    documentRef,
    windowRef,
    store,
    actions,
    thunks,
    page,
    dispatchToast,
    navigateToExplorerPath,
    collectSelectedPaths,
    findEntryByKey,
    getEntryPath,
    inferKind,
    canPreview,
    requiresProtectedUnlock,
    openProtectedUnlockModal,
    createDeferredAction,
    openDownload,
    encodeRouteKey,
    copyText,
    setSearchTimer,
    getSearchTimer,
    syncHomeUrl,
    readDroppedEntries,
  } = deps;

  const ac = new AbortController();
  const opts = { signal: ac.signal };

  const commonDeps = { dispatchToast, navigateToExplorerPath, collectSelectedPaths, findEntryByKey, getEntryPath, inferKind, canPreview, requiresProtectedUnlock, openProtectedUnlockModal, createDeferredAction, openDownload, encodeRouteKey, copyText };

  const fileActions = registerFileActions(documentRef, windowRef, store, actions, thunks, commonDeps);
  const adminActions = registerAdminActions(documentRef, windowRef, store, actions, thunks, dispatchToast, copyText);
  const uploadActions = registerUploadActions(documentRef, store, actions, thunks, dispatchToast, clearUploadAutoTimers);
  const navigationActions = registerNavigationActions(documentRef, windowRef, store, actions, thunks, dispatchToast, copyText);
  const uiActions = registerUiActions(documentRef, windowRef, store, actions, thunks, { dispatchToast, getEntryPath });

  documentRef.addEventListener(
    "click",
    (event) => {
      const stopClose = event.target.closest('[data-stop-close="true"]');
      const actionNode = event.target.closest("[data-action]");

      if (!actionNode && stopClose) return;

      const filterPopup = documentRef.querySelector('[data-role="kind-filter-popup"]');
      const clickInPopup = event.target.closest(".filter-popup-wrap");
      if (filterPopup && !filterPopup.classList.contains("notif-hidden") && !clickInPopup) {
        filterPopup.classList.add("notif-hidden");
      }

      const notifWrap = documentRef.querySelector('[data-component="notifications"]');
      if (notifWrap && !notifWrap.contains(event.target) && store.getState().admin.notifOpen) {
        store.dispatch(actions.admin.setNotifOpen(false));
      }

      if (actionNode) {
        const { action, action2 } = actionNode.dataset;

        fileActions(event);
        adminActions(event);
        uploadActions(event);
        navigationActions(event);

        if (action2) {
          const actionMap = {
            "refresh-admin-health": () => store.dispatch(thunks.loadAdminHealth()),
            "refresh-admin-quota": () => store.dispatch(thunks.loadAdminQuota()),
            "refresh-admin-maintenance": () => store.dispatch(thunks.loadMaintenanceSnapshot()),
          };
          const fn = actionMap[action2];
          if (fn) fn();
        }
      }
    },
    opts,
  );

  documentRef.addEventListener(
    "input",
    (event) => {
      const result = uiActions.handleInput(event);
      if (result === "search") {
        const value = event.target.value;
        store.dispatch(actions.explorer.setQueryDraft(value));
        windowRef.clearTimeout(getSearchTimer());
        setSearchTimer(
          windowRef.setTimeout(() => {
            store.dispatch(actions.explorer.setQuery(value.trim()));
            // 路径在回调内读取：防抖窗口内切换目录时不能同步到旧路径。
            syncHomeUrl(store.getState().explorer.path, value.trim());
            store.dispatch(thunks.loadExplorer());
          }, 260),
        );
      }
    },
    opts,
  );

  documentRef.addEventListener("keydown", uiActions.handleKeydown, opts);

  documentRef.addEventListener(
    "change",
    (event) => {
      const result = uiActions.handleChange(event);
      if (result === "upload") {
        const input = event.target;
        if (store.getState().app.role !== "admin") {
          dispatchToast("error", "请先登录管理员账户");
          input.value = "";
          return;
        }
        const files = Array.from(input.files || []);
        if (files.length) {
          store.dispatch(actions.app.setModal({ type: "upload-confirm", files, conflictMode: store.getState().uploads.conflictMode, loading: false, error: "" }));
        }
        input.value = "";
      }
    },
    opts,
  );

  documentRef.addEventListener("submit", uiActions.handleSubmit, opts);

  documentRef.addEventListener(
    "cselect-change",
    (event) => {
      const { actionChange, key, value } = event.detail;
      if (actionChange === "set-filter-kind") {
        store.dispatch(actions.explorer.setFilterKind(value));
        if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
        return;
      }
      if (actionChange === "set-upload-conflict-mode") {
        const modal = store.getState().app.modal;
        if (modal && modal.type === "upload-confirm") {
          store.dispatch(actions.app.setModal({ ...modal, conflictMode: value }));
        }
        return;
      }
      if (actionChange === "set-trash-restore-conflict-mode") {
        const modal = store.getState().app.modal;
        if (modal && modal.type === "trash-restore-confirm") {
          store.dispatch(actions.app.setModal({ ...modal, conflictMode: value }));
        }
        return;
      }
      if (actionChange === "set-logs-filter") {
        store.dispatch(actions.admin.setLogsFilter({ [key || "q"]: value }));
        store.dispatch(thunks.loadAdminLogs(1));
        return;
      }
      if (actionChange === "set-shares-filter") {
        store.dispatch(actions.admin.setShareFilter(value));
        return;
      }
      if (actionChange === "set-notification-filter") {
        store.dispatch(actions.admin.setAdminNotifFilter({ [key || "severity"]: value }));
        store.dispatch(thunks.loadAdminNotifications());
        return;
      }
    },
    opts,
  );

  documentRef.addEventListener(
    "cdate-change",
    (event) => {
      const { actionChange, key, value } = event.detail;
      if (actionChange === "set-logs-filter") {
        store.dispatch(actions.admin.setLogsFilter({ [key]: value }));
        store.dispatch(thunks.loadAdminLogs(1));
        return;
      }
    },
    opts,
  );

  documentRef.addEventListener(
    "cselect-change",
    (event) => {
      const { actionChange, key, value } = event.detail;
      if (!actionChange) {
        const cselect = event.target.closest(".cselect");
        if (cselect && cselect.dataset.cselect === "quota-unit") {
          const hiddenInput = cselect.parentElement.querySelector('input[name="r2QuotaUnit"]');
          if (hiddenInput) hiddenInput.value = value;
        }
      }
    },
    opts,
  );

  const mq = windowRef.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", uiActions.handleMediaQuery, opts);

  let dragCounter = 0;

  documentRef.addEventListener(
    "dragenter",
    (event) => {
      event.preventDefault();
      if (store.getState().app.role !== "admin") return;
      dragCounter++;
      store.dispatch(actions.app.setDragging(true));
    },
    opts,
  );

  documentRef.addEventListener(
    "dragover",
    (event) => {
      event.preventDefault();
    },
    opts,
  );

  documentRef.addEventListener(
    "dragleave",
    (event) => {
      event.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        store.dispatch(actions.app.setDragging(false));
      }
    },
    opts,
  );

  documentRef.addEventListener(
    "drop",
    async (event) => {
      event.preventDefault();
      dragCounter = 0;
      store.dispatch(actions.app.setDragging(false));
      if (store.getState().app.role !== "admin") return;
      const files = await readDroppedEntries(event.dataTransfer);
      if (files.length) {
        store.dispatch(actions.app.setModal({ type: "upload-confirm", files }));
      }
    },
    opts,
  );

  return () => ac.abort();
}
