export function registerFileActions(documentRef, windowRef, store, actions, thunks, deps) {
  const { dispatchToast, navigateToExplorerPath, collectSelectedPaths, findEntryByKey, getEntryPath, inferKind, canPreview, requiresProtectedUnlock, openProtectedUnlockModal, createDeferredAction, openDownload, encodeRouteKey, copyText } = deps;

  return (event) => {
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode) return;

    const { action, key, path } = actionNode.dataset;
    const state = store.getState();

    if (action === "crumb") {
      store.dispatch(actions.explorer.setExpandedCrumbs(false));
      navigateToExplorerPath(path || "");
      return;
    }

    if (action === "expand-crumbs") {
      store.dispatch(actions.explorer.setExpandedCrumbs(true));
      return;
    }

    if (action === "refresh-explorer") {
      store.dispatch(thunks.loadExplorer());
      return;
    }

    if (action === "toggle-search-filters") {
      store.dispatch(actions.explorer.setShowFilters(!store.getState().explorer.showFilters));
      return;
    }

    if (action === "clear-search-filters") {
      store.batchDispatch([
        actions.explorer.setFilterKind("all"),
        actions.explorer.setFilterMinSize(""),
        actions.explorer.setFilterMaxSize(""),
        actions.explorer.setFilterDateFrom(""),
        actions.explorer.setFilterDateTo(""),
        thunks.loadExplorer(),
      ]);
      return;
    }

    if (action === "load-more-search") {
      store.dispatch(thunks.loadMoreSearchResults());
      return;
    }

    if (action === "cycle-sort") {
      const next = state.explorer.sort === "smart" ? "time" : state.explorer.sort === "time" ? "size" : "smart";
      store.dispatch(actions.explorer.setSort(next));
      return;
    }

    if (action === "sort-list") {
      const field = actionNode.dataset.field || "name";
      const sortField = state.explorer.sortField || "name";
      const sortDir = state.explorer.sortDir || "asc";
      const dir = field === sortField && sortDir === "asc" ? "desc" : "asc";
      const sortMap = { name: "smart", size: "size", time: "time" };
      store.batchDispatch([
        actions.explorer.setSortList({ field, dir }),
        actions.explorer.setSort(sortMap[field] || "smart"),
      ]);
      return;
    }

    if (action === "toggle-view") {
      store.dispatch(actions.explorer.setView(state.explorer.view === "grid" ? "list" : "grid"));
      return;
    }

    if (action === "toggle-trash") {
      const next = !state.explorer.trashMode;
      store.batchDispatch([
        actions.explorer.setTrashMode(next),
        actions.explorer.setQuery(next ? state.explorer.query : ""),
        actions.explorer.setQueryDraft(next ? state.explorer.queryDraft : ""),
        actions.explorer.setPath(next ? "" : state.explorer.path),
        actions.explorer.setSelectedKeys([]),
        actions.explorer.setTrashSelectedKeys([]),
        actions.explorer.setClipboard(next ? null : state.explorer.clipboard),
        thunks.loadExplorer(),
      ]);
      return;
    }

    if (action === "toggle-filter-popup") {
      const popup = documentRef.querySelector('[data-role="kind-filter-popup"]');
      if (popup) {
        popup.classList.toggle("notif-hidden");
      }
      return;
    }

    if (action === "set-kind-filter") {
      const value = actionNode.dataset.value;
      store.dispatch(actions.explorer.setFilter(value));
      const popup = documentRef.querySelector('[data-role="kind-filter-popup"]');
      if (popup) popup.classList.add("notif-hidden");
      return;
    }

    if (action === "toggle-pick") {
      event.stopPropagation();
      if (state.explorer.trashMode) {
        const selected = new Set(state.explorer.trashSelectedKeys);
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
        store.dispatch(actions.explorer.setTrashSelectedKeys([...selected]));
      } else {
        const selected = new Set(state.explorer.selectedKeys);
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
        store.dispatch(actions.explorer.setSelectedKeys([...selected]));
      }
      return;
    }

    if (action === "toggle-all-pick") {
      const allKeys = [...(state.explorer.folders || []), ...(state.explorer.files || [])]
        .map((e) => e.fullKey || e.path || e.name)
        .filter(Boolean);
      const selected = new Set(state.explorer.selectedKeys);
      const allSelected = allKeys.every((k) => selected.has(k));
      store.dispatch(actions.explorer.setSelectedKeys(allSelected ? [] : allKeys));
      return;
    }

    if (action === "select-entry") {
      store.dispatch(actions.explorer.setSelection(key || ""));
      return;
    }

    if (action === "clear-selected") {
      store.batchDispatch([
        actions.explorer.setSelection(""),
        actions.explorer.setSelectedKeys([]),
        actions.explorer.setTrashSelectedKeys([]),
      ]);
      return;
    }

    if (action === "zip-download") {
      if (state.explorer.trashMode) return;
      const paths = collectSelectedPaths(state);
      store.dispatch(thunks.batchDownloadZip(paths));
      return;
    }

    if (action === "copy-selected" || action === "move-selected") {
      if (state.explorer.trashMode) return;
      const paths = collectSelectedPaths(state);
      store.batchDispatch([
        actions.explorer.setClipboard({ action: action === "move-selected" ? "move" : "copy", paths }),
        actions.explorer.setSelectedKeys([]),
      ]);
      dispatchToast("success", action === "move-selected" ? "已加入移动队列" : "已加入复制队列");
      return;
    }

    if (action === "clear-clipboard") {
      store.dispatch(actions.explorer.setClipboard(null));
      dispatchToast("success", "已清空剪贴板");
      return;
    }

    if (action === "paste-clipboard") {
      const clipboard = state.explorer.clipboard;
      if (!clipboard?.paths?.length) return;
      store.dispatch(thunks.estimateAndConfirmPaste(clipboard.paths, clipboard.action));
      return;
    }

    if (action === "execute-batch-paste") {
      const modal = state.app.modal;
      if (!modal) return;
      store.batchDispatch([
        actions.app.setModal(null),
        thunks.pasteClipboard(),
      ]);
      return;
    }

    if (action === "delete-selected") {
      if (state.explorer.trashMode) return;
      const paths = collectSelectedPaths(state);
      if (paths.length === 0) return;
      store.dispatch(thunks.estimateAndConfirmDelete(paths));
      return;
    }

    if (action === "execute-batch-delete") {
      const modal = state.app.modal;
      if (!modal || !modal.paths?.length) return;
      store.batchDispatch([
        actions.app.setModal(null),
        thunks.batchDelete(modal.paths),
      ]);
      return;
    }

    if (action === "restore-selected-trash") {
      if (!state.explorer.trashMode) return;
      const ids = state.explorer.trashSelectedKeys;
      store.dispatch(thunks.batchRestoreTrash(ids));
      return;
    }

    if (action === "delete-selected-trash") {
      if (!state.explorer.trashMode) return;
      const ids = state.explorer.trashSelectedKeys;
      store.dispatch(thunks.batchDeleteTrash(ids));
      return;
    }

    if (action === "open-entry") {
      const entry = findEntryByKey(key);
      if (!entry) return;
      if ((entry.kind || inferKind(entry)) === "folder") {
        if (requiresProtectedUnlock(entry)) {
          openProtectedUnlockModal(getEntryPath(entry), createDeferredAction("navigate", { path: getEntryPath(entry) }));
          return;
        }
        navigateToExplorerPath(entry.fullKey || "");
      } else if (canPreview(entry)) {
        store.dispatch(thunks.previewEntry(entry));
      }
      return;
    }

    if (action === "preview-entry") {
      const entry = findEntryByKey(key);
      if (entry) store.dispatch(thunks.previewEntry(entry));
      return;
    }

    if (action === "download-entry") {
      const entry = findEntryByKey(key);
      if (entry) {
        if (requiresProtectedUnlock(entry)) {
          openProtectedUnlockModal(getEntryPath(entry), createDeferredAction("download", { path: getEntryPath(entry) }));
          return;
        }
        openDownload(entry);
      }
      return;
    }

    if (action === "preview") {
      const entry = findEntryByKey(key);
      if (entry) store.dispatch(thunks.previewEntry(entry));
      return;
    }

    if (action === "download") {
      const entry = findEntryByKey(key);
      if (entry) {
        if (requiresProtectedUnlock(entry)) {
          openProtectedUnlockModal(getEntryPath(entry), createDeferredAction("download", { path: getEntryPath(entry) }));
          return;
        }
        openDownload(entry);
      }
      return;
    }

    if (action === "info") {
      const entry = findEntryByKey(key);
      if (entry) {
        store.dispatch(actions.explorer.setSelection(key));
      }
      return;
    }

    if (action === "open-share-modal") {
      const entry = findEntryByKey(key);
      if (entry) store.dispatch(thunks.createShare(entry));
      return;
    }

    if (action === "copy-direct-link") {
      const entry = findEntryByKey(key);
      if (!entry) return;
      copyText(`${windowRef.location.origin}/api/preview/${encodeRouteKey(getEntryPath(entry))}`, "直链已复制");
      return;
    }

    if (action === "open-rename-modal") {
      const entry = findEntryByKey(key);
      if (!entry) return;
      store.dispatch(actions.app.setModal({ type: "rename", loading: false, error: "", entry, values: { newName: entry.name || "" } }));
      return;
    }

    if (action === "toggle-preview-edit") {
      const modal = state.app.modal;
      if (!modal || modal.type !== "preview") return;
      const { draftContent: _, ...cleanModal } = modal;
      store.dispatch(actions.app.setModal({ ...cleanModal, editing: !modal.editing, dirty: false }));
      return;
    }

    if (action === "toggle-markdown-raw") {
      const modal = state.app.modal;
      if (!modal || modal.type !== "preview") return;
      store.dispatch(actions.app.setModal({ ...modal, showRaw: !modal.showRaw }));
      return;
    }

    if (action === "save-preview-edit") {
      const area = documentRef.getElementById("preview-edit-area");
      store.dispatch(thunks.savePreviewText(area?.value || ""));
      return;
    }

    if (action === "restore-trash") {
      store.dispatch(thunks.restoreTrash(key));
      return;
    }

    if (action === "delete-trash") {
      store.dispatch(thunks.deleteTrash(key));
      return;
    }

    if (action === "confirm-clear-trash") {
      store.dispatch(actions.app.setModal({ type: "confirm-clear-trash", loading: false, error: "" }));
      return;
    }

    if (action === "execute-clear-trash") {
      const modal = state.app.modal;
      if (modal && modal.type === "confirm-clear-trash") {
        store.dispatch(actions.app.setModal({ ...modal, loading: true, error: "" }));
      }
      store.dispatch(thunks.clearTrashWithModal());
      return;
    }
  };
}
