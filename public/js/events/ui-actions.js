export function registerUiActions(documentRef, windowRef, store, actions, thunks, deps = {}) {
  const { dispatchToast, getEntryPath } = deps;
  let filterSearchTimer = null;
  return {
    handleInput: (event) => {
      const role = event.target.dataset.role;
      const actionInput = event.target.dataset.actionInput;

      if (actionInput === "set-logs-filter") {
        const key = event.target.dataset.key || "q";
        store.dispatch(actions.admin.setLogsFilter({ [key]: event.target.value }));
        return;
      }

      if (actionInput === "set-shares-search") {
        store.dispatch(actions.admin.setShareSearch(event.target.value));
        return;
      }

      if (event.target.id === "preview-edit-area") {
        const modal = store.getState().app.modal;
        if (modal && modal.type === "preview" && modal.editing) {
          store.dispatch(actions.app.setModal({ ...modal, draftContent: event.target.value, dirty: true }));
        }
        return;
      }

      if (role === "search-input") {
        return "search";
      }

      if (event.target.name === "password" && document.body.dataset.page === "share") {
        store.dispatch(actions.share.setPassword(event.target.value));
      }
    },

    handleKeydown: (event) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) {
        const modal = store.getState().app.modal;
        if (modal && modal.type === "preview" && modal.editing) {
          event.preventDefault();
          const area = documentRef.getElementById("preview-edit-area");
          store.dispatch(thunks.savePreviewText(area?.value || ""));
        }
      }
    },

    handleChange: (event) => {
      const action = event.target.dataset.action;
      const role = event.target.dataset.role;
      const actionChange = event.target.dataset.actionChange;

      if (action === "set-conflict-mode") {
        store.dispatch(actions.uploads.setConflictMode(event.target.value));
        return;
      }

      if (action === "set-upload-conflict-mode") {
        const modal = store.getState().app.modal;
        if (modal && modal.type === "upload-confirm") {
          store.dispatch(actions.app.setModal({ ...modal, conflictMode: event.target.value }));
        }
        return;
      }

      if (action === "set-trash-restore-conflict-mode") {
        const modal = store.getState().app.modal;
        if (modal && modal.type === "trash-restore-confirm") {
          store.dispatch(actions.app.setModal({ ...modal, conflictMode: event.target.value }));
        }
        return;
      }

      if (role === "filter-kind") {
        store.dispatch(actions.explorer.setFilterKind(event.target.value));
        if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
        return;
      }

      if (role === "filter-min-size") {
        store.dispatch(actions.explorer.setFilterMinSize(event.target.value));
        if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
        return;
      }

      if (role === "filter-max-size") {
        store.dispatch(actions.explorer.setFilterMaxSize(event.target.value));
        if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
        return;
      }

      if (role === "filter-date-from") {
        store.dispatch(actions.explorer.setFilterDateFrom(event.target.value));
        if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
        return;
      }

      if (role === "filter-date-to") {
        store.dispatch(actions.explorer.setFilterDateTo(event.target.value));
        if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
        return;
      }

      if (actionChange === "set-logs-filter") {
        const key = event.target.dataset.key || "q";
        store.dispatch(actions.admin.setLogsFilter({ [key]: event.target.value }));
        store.dispatch(thunks.loadAdminLogs(1));
        return;
      }

      if (actionChange === "set-shares-filter") {
        store.dispatch(actions.admin.setShareFilter(event.target.value));
        return;
      }

      if (actionChange === "set-notification-filter") {
        const key = event.target.dataset.key || "severity";
        store.dispatch(actions.admin.setAdminNotifFilter({ [key]: event.target.value }));
        store.dispatch(thunks.loadAdminNotifications());
        return;
      }

      if (event.target.id === "upload-input" || event.target.id === "folder-upload-input") {
        return "upload";
      }
    },

    handleSubmit: (event) => {
      const form = event.target.dataset.form;
      if (!form) return;
      event.preventDefault();
      const data = new FormData(event.target);

      if (form === "login") {
        store.dispatch(thunks.login({ username: String(data.get("username") || "").trim(), password: String(data.get("password") || "") }));
        return;
      }

      if (form === "folder") {
        store.dispatch(thunks.createFolder(String(data.get("folderName") || "")));
        return;
      }

      if (form === "rename") {
        const modal = store.getState().app.modal;
        const path = modal?.entry ? getEntryPath(modal.entry) : "";
        store.dispatch(thunks.renameEntry(path, String(data.get("newName") || "").trim()));
        return;
      }

      if (form === "share") {
        store.dispatch(thunks.submitShare({ expiresInDays: String(data.get("expiresInDays") || "7"), maxDownloads: String(data.get("maxDownloads") || "0"), password: String(data.get("password") || ""), allowPreview: data.get("allowPreview") != null, allowDownload: data.get("allowDownload") != null }));
        return;
      }

      if (form === "reactivate-share") {
        store.dispatch(thunks.reactivateExpiredShareWithModal({
          expiresInDays: String(data.get("expiresInDays") || "7"),
        }));
        return;
      }

      if (form === "unlock-path") {
        store.dispatch(thunks.unlockProtectedPath(String(data.get("password") || "")));
        return;
      }

      if (form === "share-password" || form === "share-unlock") {
        store.dispatch(thunks.unlockShare(String(data.get("password") || data.get("share-password") || "")));
        return;
      }

      if (form === "add-protected-path") {
        store.dispatch(thunks.createAdminProtectedPath(String(data.get("path") || "").trim()));
        return;
      }

      if (form === "add-hidden-path") {
        store.dispatch(thunks.createAdminHiddenPath(String(data.get("path") || "").trim()));
        return;
      }

      if (form === "edit-storage-quota") {
        const config = store.getState().admin.storageConfig;
        if (!config) return;
        const quotaValue = parseFloat(String(data.get("r2QuotaValue") || "0"));
        const quotaUnit = String(data.get("r2QuotaUnit") || "GB");
        let r2QuotaBytes = 0;
        if (!isNaN(quotaValue) && quotaValue > 0) {
          r2QuotaBytes = quotaUnit === "MB"
            ? Math.round(quotaValue * 1024 * 1024)
            : Math.round(quotaValue * 1024 * 1024 * 1024);
        }
        store.dispatch(thunks.saveAdminStorageConfig({ ...config, r2QuotaBytes }));
        return;
      }

      if (form === "add-webhook" || form === "edit-webhook") {
        const modal = store.getState().app.modal;
        if (!modal) return;
        const isEdit = form === "edit-webhook";
        let headers = {};
        try {
          const h = String(data.get("headers") || "").trim();
          if (h) headers = JSON.parse(h);
        } catch {
          dispatchToast("error", "Headers 格式错误，需为有效 JSON");
          return;
        }
        const events = String(data.get("events") || "").split(",").map((s) => s.trim()).filter(Boolean);
        const webhook = { id: isEdit ? modal.id : `wh-${Date.now()}`, name: String(data.get("name") || "").trim(), msgtype: String(data.get("msgtype") || "json"), url: String(data.get("url") || "").trim(), method: String(data.get("method") || "POST"), contentType: String(data.get("contentType") || "application/json"), headers, body: String(data.get("body") || ""), events, enabled: data.get("enabled") === "on" };
        if (!webhook.name || !webhook.url) {
          dispatchToast("error", "名称和 URL 为必填项");
          return;
        }
        store.dispatch(actions.app.setModal(null));
        const existing = store.getState().admin.webhooks || [];
        const updated = isEdit ? existing.map((w) => (w.id === webhook.id ? webhook : w)) : [...existing, webhook];
        store.dispatch(thunks.saveAdminWebhooks(updated));
        return;
      }

    },

    handleMediaQuery: (e) => {
      if (!localStorage.getItem("theme")) {
        documentRef.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
      }
    }
  };
}
