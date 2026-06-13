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
    requiresProtectedUnlock,
    openProtectedUnlockModal,
    createDeferredAction,
    openDownload,
    encodeRouteKey,
    copyText,
    setSearchTimer,
    getSearchTimer,
    syncHomeUrl,
  } = deps;

  documentRef.addEventListener('click', event => {
    const stopClose = event.target.closest('[data-stop-close="true"]');
    const actionNode = event.target.closest('[data-action]');
    const state = store.getState();

    if (!actionNode && stopClose) return;

    if (actionNode) {
      const { action, key, path } = actionNode.dataset;

      if (action === 'open-login') {
        store.dispatch(actions.app.setModal({ type: 'login', loading: false, error: '', values: {} }));
        return;
      }

      if (action === 'close-modal' || action === 'close-modal-backdrop') {
        if (action === 'close-modal-backdrop' && stopClose) return;
        store.dispatch(actions.app.setModal(null));
        return;
      }

      if (action === 'logout') {
        store.dispatch(thunks.logout());
        return;
      }

      if (action === 'crumb') {
        navigateToExplorerPath(path || '');
        return;
      }

      if (action === 'refresh-explorer') {
        store.dispatch(thunks.loadExplorer());
        return;
      }

      if (action === 'refresh-admin') {
        store.dispatch(thunks.loadAdminStats());
        return;
      }

      if (action === 'refresh-admin-shares') {
        store.dispatch(thunks.loadAdminShares());
        return;
      }

      if (action === 'cleanup-expired-shares') {
        store.dispatch(thunks.cleanupExpiredShares());
        return;
      }

      if (action === 'delete-share') {
        store.dispatch(thunks.deleteShare(key || ''));
        return;
      }

      if (action === 'copy-share-link') {
        if (!key) return;
        copyText(`${windowRef.location.origin}/share.html?token=${encodeURIComponent(key)}`, '分享链接已复制');
        return;
      }

      if (action === 'upload') {
        const input = documentRef.getElementById('upload-input');
        if (input) input.click();
        return;
      }

      if (action === 'upload-folder') {
        const input = documentRef.getElementById('folder-upload-input');
        if (input) input.click();
        return;
      }

      if (action === 'open-folder-modal') {
        if (state.app.role !== 'admin') {
          dispatchToast('error', '请先登录管理员账户');
          return;
        }
        store.dispatch(actions.app.setModal({ type: 'folder', loading: false, error: '', values: {} }));
        return;
      }

      if (action === 'cycle-sort') {
        const next = state.explorer.sort === 'smart' ? 'time' : state.explorer.sort === 'time' ? 'size' : 'smart';
        store.dispatch(actions.explorer.setSort(next));
        return;
      }

      if (action === 'toggle-view') {
        store.dispatch(actions.explorer.setView(state.explorer.view === 'grid' ? 'list' : 'grid'));
        return;
      }

      if (action === 'toggle-trash') {
        const next = !state.explorer.trashMode;
        store.dispatch(actions.explorer.setTrashMode(next));
        store.dispatch(actions.explorer.setQuery(next ? state.explorer.query : ''));
        store.dispatch(actions.explorer.setPath(next ? state.explorer.path : state.explorer.path));
        store.dispatch(thunks.loadExplorer());
        return;
      }

      if (action === 'toggle-pick') {
        event.stopPropagation();
        const selected = new Set(state.explorer.selectedKeys);
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
        store.dispatch(actions.explorer.setSelectedKeys([...selected]));
        return;
      }

      if (action === 'select-entry') {
        store.dispatch(actions.explorer.setSelection(key || ''));
        return;
      }

      if (action === 'clear-selected') {
        store.dispatch(actions.explorer.setSelection(''));
        store.dispatch(actions.explorer.setSelectedKeys([]));
        return;
      }

      if (action === 'copy-selected' || action === 'move-selected') {
        if (state.explorer.trashMode) return;
        const paths = collectSelectedPaths(state);
        store.dispatch(actions.explorer.setClipboard({ action: action === 'move-selected' ? 'move' : 'copy', paths }));
        store.dispatch(actions.explorer.setSelectedKeys([]));
        dispatchToast('success', action === 'move-selected' ? '已加入移动队列' : '已加入复制队列');
        return;
      }

      if (action === 'clear-clipboard') {
        store.dispatch(actions.explorer.setClipboard(null));
        dispatchToast('success', '已清空剪贴板');
        return;
      }

      if (action === 'paste-clipboard') {
        store.dispatch(thunks.pasteClipboard());
        return;
      }

      if (action === 'delete-selected') {
        if (state.explorer.trashMode) return;
        const paths = collectSelectedPaths(state);
        store.dispatch(thunks.batchDelete(paths));
        return;
      }

      if (action === 'restore-selected-trash') {
        if (!state.explorer.trashMode) return;
        const ids = state.explorer.selectedKeys;
        store.dispatch(thunks.batchRestoreTrash(ids));
        return;
      }

      if (action === 'delete-selected-trash') {
        if (!state.explorer.trashMode) return;
        const ids = state.explorer.selectedKeys;
        store.dispatch(thunks.batchDeleteTrash(ids));
        return;
      }

      if (action === 'open-entry') {
        const entry = findEntryByKey(key);
        if (!entry) return;
        if ((entry.kind || inferKind(entry)) === 'folder') {
          if (requiresProtectedUnlock(entry)) {
            openProtectedUnlockModal(getEntryPath(entry), createDeferredAction('navigate', { path: getEntryPath(entry) }));
            return;
          }
          navigateToExplorerPath(entry.fullKey || '');
        } else {
          store.dispatch(thunks.previewEntry(entry));
        }
        return;
      }

      if (action === 'preview-entry') {
        const entry = findEntryByKey(key);
        if (entry) store.dispatch(thunks.previewEntry(entry));
        return;
      }

      if (action === 'download-entry') {
        const entry = findEntryByKey(key);
        if (entry) {
          if (requiresProtectedUnlock(entry)) {
            openProtectedUnlockModal(getEntryPath(entry), createDeferredAction('download', { path: getEntryPath(entry) }));
            return;
          }
          openDownload(entry);
        }
        return;
      }

      if (action === 'open-share-modal') {
        const entry = findEntryByKey(key);
        if (entry) store.dispatch(thunks.createShare(entry));
        return;
      }

      if (action === 'copy-direct-link') {
        const entry = findEntryByKey(key);
        if (!entry) return;
        copyText(`${windowRef.location.origin}/api/preview/${encodeRouteKey(getEntryPath(entry))}`, '直链已复制');
        return;
      }

      if (action === 'open-rename-modal') {
        const entry = findEntryByKey(key);
        if (!entry) return;
        store.dispatch(actions.app.setModal({
          type: 'rename',
          loading: false,
          error: '',
          entry,
          values: { newName: entry.name || '' },
        }));
        return;
      }

      if (action === 'toggle-preview-edit') {
        const modal = state.app.modal;
        if (!modal || modal.type !== 'preview') return;
        store.dispatch(actions.app.setModal({ ...modal, editing: !modal.editing }));
        return;
      }

      if (action === 'save-preview-edit') {
        const area = documentRef.getElementById('preview-edit-area');
        store.dispatch(thunks.savePreviewText(area?.value || ''));
        return;
      }

      if (action === 'restore-trash') {
        store.dispatch(thunks.restoreTrash(key));
        return;
      }

      if (action === 'delete-trash') {
        store.dispatch(thunks.deleteTrash(key));
        return;
      }

      if (action === 'clear-trash') {
        store.dispatch(thunks.clearTrash());
      }
    }
  });

  documentRef.addEventListener('input', event => {
    const state = store.getState();
    const role = event.target.dataset.role;

    if (role === 'search-input') {
      const value = event.target.value;
      store.dispatch(actions.explorer.setQueryDraft(value));
      windowRef.clearTimeout(getSearchTimer());
      setSearchTimer(windowRef.setTimeout(() => {
        store.dispatch(actions.explorer.setQuery(value.trim()));
        syncHomeUrl(state.explorer.path, value.trim());
        store.dispatch(thunks.loadExplorer());
      }, 260));
      return;
    }

    if (event.target.dataset.role === 'kind-filter') {
      store.dispatch(actions.explorer.setFilter(event.target.value));
      return;
    }

    if (event.target.name === 'password' && page === 'share') {
      store.dispatch(actions.share.setPassword(event.target.value));
    }
  });

  documentRef.addEventListener('change', event => {
    if (event.target.id === 'upload-input') {
      if (store.getState().app.role !== 'admin') {
        dispatchToast('error', '请先登录管理员账户');
        event.target.value = '';
        return;
      }
      store.dispatch(thunks.uploadFiles(event.target.files));
      event.target.value = '';
      return;
    }

    if (event.target.id === 'folder-upload-input') {
      if (store.getState().app.role !== 'admin') {
        dispatchToast('error', '请先登录管理员账户');
        event.target.value = '';
        return;
      }
      store.dispatch(thunks.uploadFiles(event.target.files));
      event.target.value = '';
    }
  });

  documentRef.addEventListener('submit', event => {
    const form = event.target.dataset.form;
    if (!form) return;
    event.preventDefault();
    const data = new FormData(event.target);

    if (form === 'login') {
      store.dispatch(thunks.login({
        username: String(data.get('username') || '').trim(),
        password: String(data.get('password') || ''),
      }));
      return;
    }

    if (form === 'folder') {
      store.dispatch(thunks.createFolder(String(data.get('folderName') || '')));
      return;
    }

    if (form === 'rename') {
      const modal = store.getState().app.modal;
      const path = modal?.entry ? getEntryPath(modal.entry) : '';
      store.dispatch(thunks.renameEntry(path, String(data.get('newName') || '').trim()));
      return;
    }

    if (form === 'share') {
      store.dispatch(thunks.submitShare({
        expiresInDays: String(data.get('expiresInDays') || '7'),
        maxDownloads: String(data.get('maxDownloads') || '0'),
        password: String(data.get('password') || ''),
        allowPreview: data.get('allowPreview') != null,
        allowDownload: data.get('allowDownload') != null,
      }));
      return;
    }

    if (form === 'unlock-path') {
      store.dispatch(thunks.unlockProtectedPath(String(data.get('password') || '')));
      return;
    }

    if (form === 'share-password') {
      store.dispatch(thunks.unlockShare(String(data.get('password') || '')));
    }
  });
}
