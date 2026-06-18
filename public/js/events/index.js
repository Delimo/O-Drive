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

    const filterPopup = documentRef.querySelector('[data-role="kind-filter-popup"]');
    const clickInPopup = event.target.closest('.filter-popup-wrap');
    if (filterPopup && filterPopup.style.display !== 'none' && !clickInPopup) {
      filterPopup.style.display = 'none';
    }

    const notifWrap = documentRef.querySelector('[data-component="notifications"]');
    if (notifWrap && !notifWrap.contains(event.target) && store.getState().admin.notifOpen) {
      store.dispatch(actions.admin.setNotifOpen(false));
    }

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

      if (action === 'confirm-upload') {
        const modal = store.getState().app.modal;
        if (modal && modal.type === 'upload-confirm' && modal.files) {
          store.dispatch(actions.uploads.setConflictMode(modal.conflictMode || 'rename'));
          store.dispatch(thunks.uploadFiles(modal.files));
          store.dispatch(actions.app.setModal(null));
        }
        return;
      }

      if (action === 'cancel-upload-confirm') {
        store.dispatch(actions.app.setModal(null));
        return;
      }

      if (action === 'remove-pending-file') {
        const modal = store.getState().app.modal;
        if (modal && modal.type === 'upload-confirm' && modal.files) {
          const idx = parseInt(actionNode.dataset.index, 10);
          const newFiles = modal.files.filter((_, i) => i !== idx);
          store.dispatch(actions.app.setModal({ ...modal, files: newFiles }));
        }
        return;
      }

      if (action === 'add-more-files') {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.addEventListener('change', () => {
          const modal = store.getState().app.modal;
          if (modal && modal.type === 'upload-confirm') {
            const newFiles = Array.from(input.files || []);
            if (newFiles.length) {
              store.dispatch(actions.app.setModal({ ...modal, files: [...modal.files, ...newFiles] }));
            }
          }
        });
        input.click();
        return;
      }

      if (action === 'logout') {
        store.dispatch(thunks.logout());
        return;
      }

      if (action === 'toggle-theme') {
        const root = document.documentElement;
        const stored = localStorage.getItem('theme');
        if (!stored) {
          const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          root.setAttribute('data-theme', next);
          try { localStorage.setItem('theme', next); } catch (_) {}
        } else if (stored === 'light') {
          root.setAttribute('data-theme', 'dark');
          try { localStorage.setItem('theme', 'dark'); } catch (_) {}
        } else {
          try { localStorage.removeItem('theme'); } catch (_) {}
          const prefersDark = windowRef.matchMedia('(prefers-color-scheme: dark)').matches;
          root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        }
        return;
      }

      if (action === 'toggle-notifications') {
        const current = store.getState().admin.notifOpen;
        store.dispatch(actions.admin.setNotifOpen(!current));
        if (!current) store.dispatch(thunks.loadNotifications());
        return;
      }

      if (action === 'mark-notification-read') {
        const id = actionNode.dataset.notifId;
        if (id) store.dispatch(thunks.markNotificationRead(Number(id)));
        return;
      }

      if (action === 'mark-all-notifications-read') {
        store.dispatch(thunks.markAllNotificationsRead());
        return;
      }

      if (action === 'crumb') {
        store.dispatch(actions.explorer.setExpandedCrumbs(false));
        navigateToExplorerPath(path || '');
        return;
      }

      if (action === 'expand-crumbs') {
        store.dispatch(actions.explorer.setExpandedCrumbs(true));
        return;
      }

      if (action === 'refresh-explorer') {
        store.dispatch(thunks.loadExplorer());
        return;
      }

      if (action === 'set-admin-tab') {
        const tab = actionNode.dataset.tab || 'overview';
        store.dispatch(actions.admin.setActiveTab(tab));
        const admin = store.getState().admin;
        if (tab === 'health' && !admin.health) { store.dispatch(thunks.loadAdminHealth()); return; }
        if (tab === 'logs' && admin.logs.length === 0) { store.dispatch(thunks.loadAdminLogs(1)); return; }
        if (tab === 'quota' && !admin.quota) { store.dispatch(thunks.loadAdminQuota()); return; }
        if (tab === 'protected' && admin.protectedPaths.length === 0) { store.dispatch(thunks.loadAdminProtectedPaths()); return; }
        if (tab === 'hidden' && admin.hiddenPaths.length === 0) { store.dispatch(thunks.loadAdminHiddenPaths()); return; }
        if (tab === 'storage' && !admin.storageConfig) { store.dispatch(thunks.loadAdminStorageConfig()); return; }
        if (tab === 'webhooks' && admin.webhooks.length === 0) { store.dispatch(thunks.loadAdminWebhooks()); return; }
        if (tab === 'deliveries' && admin.webhookDeliveries.length === 0) { store.dispatch(thunks.loadAdminWebhookDeliveries()); return; }
        if (tab === 'maintenance' && !admin.maintenance) { store.dispatch(thunks.loadMaintenanceSnapshot()); return; }
        if (tab === 'tasks' && admin.tasks.length === 0) { store.dispatch(thunks.loadTasks()); return; }
        if (tab === 'notifications') { store.dispatch(thunks.loadAdminNotifications()); return; }
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

      if (action === 'refresh-admin-health') {
        store.dispatch(thunks.loadAdminHealth());
        return;
      }

      if (action === 'refresh-admin-logs') {
        store.dispatch(thunks.loadAdminLogs(1));
        return;
      }

      if (action === 'refresh-admin-quota') {
        store.dispatch(thunks.loadAdminQuota());
        return;
      }

      if (action === 'refresh-admin-protected-paths') {
        store.dispatch(thunks.loadAdminProtectedPaths());
        return;
      }

      if (action === 'refresh-admin-hidden-paths') {
        store.dispatch(thunks.loadAdminHiddenPaths());
        return;
      }

      if (action === 'show-add-hidden-path') {
        store.dispatch(actions.app.setModal({
          type: 'add-hidden-path',
          loading: false,
          error: '',
          path: '',
        }));
        return;
      }

      if (action === 'confirm-delete-hidden-path') {
        const delPath = actionNode.dataset.path || key;
        store.dispatch(actions.app.setModal({
          type: 'confirm-delete-hidden-path',
          loading: false,
          error: '',
          path: delPath,
        }));
        return;
      }

      if (action === 'execute-delete-hidden-path') {
        const delPath = actionNode.dataset.path || key;
        store.dispatch(thunks.deleteAdminHiddenPath(delPath));
        return;
      }

      if (action === 'refresh-admin-storage-config') {
        store.dispatch(thunks.loadAdminStorageConfig());
        return;
      }

      if (action === 'show-edit-storage-quota') {
        const config = store.getState().admin.storageConfig;
        store.dispatch(actions.app.setModal({
          type: 'edit-storage-quota',
          loading: false,
          error: '',
          r2QuotaBytes: config?.r2?.quotaBytes || 0,
        }));
        return;
      }

      if (action === 'show-add-storage-space') {
        store.dispatch(actions.app.setModal({
          type: 'add-storage-space',
          loading: false,
          error: '',
          name: '', endpoint: '', region: 'auto', bucket: '', accessKeyId: '', secretAccessKey: '', prefix: '', quotaBytes: '', enabled: true, overflowTarget: false,
        }));
        return;
      }

      if (action === 'confirm-delete-storage-space') {
        const spaceId = actionNode.dataset.id || key;
        const spaceName = actionNode.dataset.name || spaceId;
        store.dispatch(actions.app.setModal({
          type: 'confirm-delete-storage-space',
          loading: false,
          error: '',
          id: spaceId,
          name: spaceName,
        }));
        return;
      }

      if (action === 'execute-delete-storage-space') {
        const modal = store.getState().app.modal;
        if (!modal) return;
        const config = store.getState().admin.storageConfig;
        if (!config) return;
        const updatedSpaces = (config.spaces || []).filter(s => s.id !== modal.id);
        const updatedBindings = (config.bindings || []).filter(b => b.storageId !== modal.id);
        store.dispatch(actions.app.setModal(null));
        store.dispatch(thunks.saveAdminStorageConfig({ ...config, spaces: updatedSpaces, bindings: updatedBindings }));
        return;
      }

      if (action === 'show-add-storage-binding') {
        const config = store.getState().admin.storageConfig;
        const storageOptions = [
          { id: 'r2', name: 'Cloudflare R2' },
          ...(config?.spaces || []).map(s => ({ id: s.id, name: s.name })),
        ];
        store.dispatch(actions.app.setModal({
          type: 'add-storage-binding',
          loading: false,
          error: '',
          path: '',
          storageId: storageOptions[0]?.id || '',
          storageOptions,
        }));
        return;
      }

      if (action === 'confirm-delete-storage-binding') {
        const bindPath = actionNode.dataset.path || key;
        store.dispatch(actions.app.setModal({
          type: 'confirm-delete-storage-binding',
          loading: false,
          error: '',
          path: bindPath,
        }));
        return;
      }

      if (action === 'execute-delete-storage-binding') {
        const modal = store.getState().app.modal;
        if (!modal) return;
        const config = store.getState().admin.storageConfig;
        if (!config) return;
        const updatedBindings = (config.bindings || []).filter(b => b.path !== modal.path);
        store.dispatch(actions.app.setModal(null));
        store.dispatch(thunks.saveAdminStorageConfig({ ...config, bindings: updatedBindings }));
        return;
      }

      if (action === 'toggle-search-filters') {
        store.dispatch(actions.explorer.setShowFilters(!store.getState().explorer.showFilters));
        return;
      }

      if (action === 'clear-search-filters') {
        store.dispatch(actions.explorer.setFilterKind('all'));
        store.dispatch(actions.explorer.setFilterMinSize(''));
        store.dispatch(actions.explorer.setFilterMaxSize(''));
        store.dispatch(actions.explorer.setFilterDateFrom(''));
        store.dispatch(actions.explorer.setFilterDateTo(''));
        store.dispatch(thunks.loadExplorer());
        return;
      }

      if (action === 'load-more-search') {
        store.dispatch(thunks.loadMoreSearchResults());
        return;
      }

      if (action === 'test-storage-space') {
        const spaceId = actionNode.dataset.id || key;
        const config = store.getState().admin.storageConfig;
        const space = (config?.spaces || []).find(s => s.id === spaceId);
        if (space) {
          dispatchToast('info', `正在测试 ${space.name} 的连接...`);
          store.dispatch(thunks.testAdminStorageSpace(space));
        }
        return;
      }

      if (action === 'refresh-admin-webhooks') {
        store.dispatch(thunks.loadAdminWebhooks());
        return;
      }

      if (action === 'refresh-admin-webhook-deliveries') {
        store.dispatch(thunks.loadAdminWebhookDeliveries());
        return;
      }

      if (action === 'refresh-admin-maintenance') {
        store.dispatch(thunks.loadMaintenanceSnapshot());
        return;
      }

      if (action === 'refresh-tasks') {
        store.dispatch(thunks.loadTasks());
        return;
      }

      if (action === 'refresh-admin-notifications') {
        store.dispatch(thunks.loadAdminNotifications());
        return;
      }

      if (action === 'admin-mark-notif-read') {
        const id = actionNode.dataset.notifId;
        if (id) {
          store.dispatch(thunks.markNotificationRead(Number(id)));
          store.dispatch(thunks.loadAdminNotifications());
        }
        return;
      }

      if (action === 'confirm-maintenance-action') {
        const maintAction = actionNode.dataset.maintenanceAction || '';
        const maintLabel = actionNode.dataset.maintenanceLabel || '';
        store.dispatch(actions.app.setModal({
          type: 'confirm-maintenance-action',
          loading: false,
          error: '',
          maintenanceAction: maintAction,
          maintenanceLabel: maintLabel,
        }));
        return;
      }

      if (action === 'execute-maintenance-action') {
        const modal = store.getState().app.modal;
        if (!modal || !modal.maintenanceAction) return;
        store.dispatch(thunks.executeMaintenanceAction(modal.maintenanceAction));
        return;
      }

      if (action === 'show-add-webhook') {
        store.dispatch(actions.app.setModal({
          type: 'add-webhook',
          loading: false,
          error: '',
          name: '', url: '', msgtype: 'json', method: 'POST', contentType: 'application/json',
          headers: '', body: '', events: [], enabled: true,
        }));
        return;
      }

      if (action === 'edit-webhook') {
        const whId = actionNode.dataset.id || key;
        const webhooks = store.getState().admin.webhooks || [];
        const wh = webhooks.find(w => w.id === whId);
        if (!wh) return;
        store.dispatch(actions.app.setModal({
          type: 'edit-webhook',
          loading: false,
          error: '',
          ...wh,
          headers: wh.headers ? JSON.stringify(wh.headers, null, 2) : '',
        }));
        return;
      }

      if (action === 'confirm-delete-webhook') {
        const whId = actionNode.dataset.id || key;
        const whName = actionNode.dataset.name || whId;
        store.dispatch(actions.app.setModal({
          type: 'confirm-delete-webhook',
          loading: false,
          error: '',
          id: whId,
          name: whName,
        }));
        return;
      }

      if (action === 'execute-delete-webhook') {
        const modal = store.getState().app.modal;
        if (!modal) return;
        const webhooks = (store.getState().admin.webhooks || []).filter(w => w.id !== modal.id);
        store.dispatch(actions.app.setModal(null));
        store.dispatch(thunks.saveAdminWebhooks(webhooks));
        return;
      }

      if (action === 'test-webhook') {
        const whId = actionNode.dataset.id || key;
        const webhooks = store.getState().admin.webhooks || [];
        const wh = webhooks.find(w => w.id === whId);
        if (wh) store.dispatch(thunks.testAdminWebhook(wh));
        return;
      }

      if (action === 'show-add-protected-path') {
        store.dispatch(actions.app.setModal({
          type: 'add-protected-path',
          loading: false,
          error: '',
          path: '',
          password: '',
          note: '',
          showName: '',
        }));
        return;
      }

      if (action === 'confirm-delete-protected-path') {
        const delPath = actionNode.dataset.path || key;
        store.dispatch(actions.app.setModal({
          type: 'confirm-delete-protected-path',
          loading: false,
          error: '',
          path: delPath,
        }));
        return;
      }

      if (action === 'execute-delete-protected-path') {
        const delPath = actionNode.dataset.path || key;
        store.dispatch(thunks.deleteAdminProtectedPath(delPath));
        return;
      }

      if (action === 'set-logs-page') {
        const page = parseInt(actionNode.dataset.page, 10);
        if (page > 0) store.dispatch(thunks.loadAdminLogs(page));
        return;
      }

      if (action === 'set-share-filter') {
        const filter = actionNode.dataset.filter || 'all';
        store.dispatch(actions.admin.setShareFilter(filter));
        return;
      }

      if (action === 'confirm-delete-share') {
        const shareName = actionNode.dataset.name || key;
        store.dispatch(actions.app.setModal({
          type: 'confirm-delete-share',
          loading: false,
          error: '',
          token: key,
          shareName,
        }));
        return;
      }

      if (action === 'confirm-cleanup-expired-shares') {
        store.dispatch(actions.app.setModal({
          type: 'confirm-cleanup-expired',
          loading: false,
          error: '',
        }));
        return;
      }

      if (action === 'execute-delete-share') {
        const tokenToDelete = actionNode.dataset.key || key;
        store.dispatch(thunks.deleteShareWithModal(tokenToDelete));
        return;
      }

      if (action === 'execute-cleanup-expired-shares') {
        store.dispatch(thunks.cleanupExpiredSharesWithModal());
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

      if (action === 'dismiss-upload') {
        store.dispatch(actions.uploads.remove(key || ''));
        return;
      }

      if (action === 'cancel-upload') {
        const uploadId = actionNode.dataset.id || key;
        store.dispatch(thunks.cancelFileUpload(uploadId));
        return;
      }

      if (action === 'pause-upload') {
        const uploadId = actionNode.dataset.id || key;
        store.dispatch(thunks.pauseFileUpload(uploadId));
        return;
      }

      if (action === 'resume-upload') {
        const uploadId = actionNode.dataset.id || key;
        store.dispatch(thunks.resumeFileUpload(uploadId));
        return;
      }

      if (action === 'retry-upload') {
        const uploadId = actionNode.dataset.id || key;
        store.dispatch(thunks.retryFileUpload(uploadId));
        return;
      }

      if (action === 'clear-finished-uploads') {
        store.dispatch(actions.uploads.clearFinished());
        return;
      }

      if (action === 'dismiss-uploads') {
        store.dispatch(actions.uploads.clearAll());
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
        store.dispatch(actions.explorer.setQueryDraft(next ? state.explorer.queryDraft : ''));
        store.dispatch(actions.explorer.setPath(next ? '' : state.explorer.path));
        store.dispatch(actions.explorer.setSelectedKeys([]));
        store.dispatch(actions.explorer.setTrashSelectedKeys([]));
        store.dispatch(actions.explorer.setClipboard(next ? null : state.explorer.clipboard));
        store.dispatch(thunks.loadExplorer());
        return;
      }

      if (action === 'toggle-filter-popup') {
        const popup = documentRef.querySelector('[data-role="kind-filter-popup"]');
        if (popup) {
          const isVisible = popup.style.display !== 'none';
          popup.style.display = isVisible ? 'none' : '';
        }
        return;
      }

      if (action === 'set-kind-filter') {
        const value = actionNode.dataset.value;
        store.dispatch(actions.explorer.setFilter(value));
        const popup = documentRef.querySelector('[data-role="kind-filter-popup"]');
        if (popup) popup.style.display = 'none';
        return;
      }

      if (action === 'toggle-pick') {
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

      if (action === 'select-entry') {
        store.dispatch(actions.explorer.setSelection(key || ''));
        return;
      }

      if (action === 'clear-selected') {
        store.dispatch(actions.explorer.setSelection(''));
        store.dispatch(actions.explorer.setSelectedKeys([]));
        store.dispatch(actions.explorer.setTrashSelectedKeys([]));
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
        const ids = state.explorer.trashSelectedKeys;
        store.dispatch(thunks.batchRestoreTrash(ids));
        return;
      }

      if (action === 'delete-selected-trash') {
        if (!state.explorer.trashMode) return;
        const ids = state.explorer.trashSelectedKeys;
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

      if (action === 'preview') {
        const entry = findEntryByKey(key);
        if (entry) store.dispatch(thunks.previewEntry(entry));
        return;
      }

      if (action === 'download') {
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

      if (action === 'info') {
        const entry = findEntryByKey(key);
        if (entry) {
          store.dispatch(actions.explorer.setSelectedKey(key));
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
        const { draftContent: _, ...cleanModal } = modal;
        store.dispatch(actions.app.setModal({ ...cleanModal, editing: !modal.editing, dirty: false }));
        return;
      }

      if (action === 'toggle-markdown-raw') {
        const modal = state.app.modal;
        if (!modal || modal.type !== 'preview') return;
        store.dispatch(actions.app.setModal({ ...modal, showRaw: !modal.showRaw }));
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

      if (action === 'confirm-clear-trash') {
        store.dispatch(actions.app.setModal({
          type: 'confirm-clear-trash',
          loading: false,
          error: '',
        }));
        return;
      }

      if (action === 'execute-clear-trash') {
        const modal = state.app.modal;
        if (modal && modal.type === 'confirm-clear-trash') {
          store.dispatch(actions.app.setModal({ ...modal, loading: true, error: '' }));
        }
        store.dispatch(thunks.clearTrashWithModal());
        return;
      }
    }
  });

  documentRef.addEventListener('input', event => {
    const state = store.getState();
    const role = event.target.dataset.role;
    const actionInput = event.target.dataset.actionInput;

    if (actionInput === 'set-logs-filter') {
      const key = event.target.dataset.key || 'q';
      store.dispatch(actions.admin.setLogsFilter({ [key]: event.target.value }));
      return;
    }

    if (event.target.id === 'preview-edit-area') {
      const modal = store.getState().app.modal;
      if (modal && modal.type === 'preview' && modal.editing) {
        store.dispatch(actions.app.setModal({ ...modal, draftContent: event.target.value, dirty: true }));
      }
      return;
    }

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

    if (event.target.name === 'password' && page === 'share') {
      store.dispatch(actions.share.setPassword(event.target.value));
    }
  });

  documentRef.addEventListener('keydown', event => {
    // Ctrl/Cmd + S 在文本编辑态下保存
    if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
      const modal = store.getState().app.modal;
      if (modal && modal.type === 'preview' && modal.editing) {
        event.preventDefault();
        const area = documentRef.getElementById('preview-edit-area');
        store.dispatch(thunks.savePreviewText(area?.value || ''));
      }
    }
  });

  documentRef.addEventListener('change', event => {
    const action = event.target.dataset.action;
    const role = event.target.dataset.role;
    const actionChange = event.target.dataset.actionChange;

    if (action === 'set-conflict-mode') {
      store.dispatch(actions.uploads.setConflictMode(event.target.value));
      return;
    }

    if (action === 'set-upload-conflict-mode') {
      const modal = store.getState().app.modal;
      if (modal && modal.type === 'upload-confirm') {
        store.dispatch(actions.app.setModal({ ...modal, conflictMode: event.target.value }));
      }
      return;
    }

    if (role === 'filter-kind') {
      store.dispatch(actions.explorer.setFilterKind(event.target.value));
      if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
      return;
    }

    if (role === 'filter-min-size') {
      store.dispatch(actions.explorer.setFilterMinSize(event.target.value));
      if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
      return;
    }

    if (role === 'filter-max-size') {
      store.dispatch(actions.explorer.setFilterMaxSize(event.target.value));
      if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
      return;
    }

    if (role === 'filter-date-from') {
      store.dispatch(actions.explorer.setFilterDateFrom(event.target.value));
      if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
      return;
    }

    if (role === 'filter-date-to') {
      store.dispatch(actions.explorer.setFilterDateTo(event.target.value));
      if (store.getState().explorer.query.trim()) store.dispatch(thunks.loadExplorer());
      return;
    }

    if (actionChange === 'set-logs-filter') {
      const key = event.target.dataset.key || 'q';
      store.dispatch(actions.admin.setLogsFilter({ [key]: event.target.value }));
      store.dispatch(thunks.loadAdminLogs(1));
      return;
    }

    if (event.target.id === 'upload-input') {
      if (store.getState().app.role !== 'admin') {
        dispatchToast('error', '请先登录管理员账户');
        event.target.value = '';
        return;
      }
      const files = Array.from(event.target.files || []);
      if (files.length) {
        store.dispatch(actions.app.setModal({
          type: 'upload-confirm',
          files,
          conflictMode: store.getState().uploads.conflictMode,
          loading: false,
          error: '',
        }));
      }
      event.target.value = '';
      return;
    }

    if (event.target.id === 'folder-upload-input') {
      if (store.getState().app.role !== 'admin') {
        dispatchToast('error', '请先登录管理员账户');
        event.target.value = '';
        return;
      }
      const files = Array.from(event.target.files || []);
      if (files.length) {
        store.dispatch(actions.app.setModal({
          type: 'upload-confirm',
          files,
          conflictMode: store.getState().uploads.conflictMode,
          loading: false,
          error: '',
        }));
      }
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

    if (form === 'add-protected-path') {
      store.dispatch(thunks.createAdminProtectedPath(String(data.get('path') || '').trim()));
      return;
    }

    if (form === 'add-hidden-path') {
      store.dispatch(thunks.createAdminHiddenPath(String(data.get('path') || '').trim()));
      return;
    }

    if (form === 'edit-storage-quota') {
      const config = store.getState().admin.storageConfig;
      if (!config) return;
      const r2QuotaBytes = parseInt(String(data.get('r2QuotaBytes') || '0'), 10);
      store.dispatch(thunks.saveAdminStorageConfig({ ...config, r2QuotaBytes: isNaN(r2QuotaBytes) ? 0 : r2QuotaBytes }));
      return;
    }

    if (form === 'add-storage-space') {
      const config = store.getState().admin.storageConfig;
      if (!config) return;
      const space = {
        name: String(data.get('name') || '').trim(),
        endpoint: String(data.get('endpoint') || '').trim(),
        region: String(data.get('region') || 'auto').trim(),
        bucket: String(data.get('bucket') || '').trim(),
        accessKeyId: String(data.get('accessKeyId') || '').trim(),
        secretAccessKey: String(data.get('secretAccessKey') || '').trim(),
        prefix: String(data.get('prefix') || '').trim(),
        quotaBytes: parseInt(String(data.get('quotaBytes') || '0'), 10),
        enabled: data.get('enabled') === 'on',
        overflowTarget: data.get('overflowTarget') === 'on',
      };
      if (!space.name || !space.bucket) { dispatchToast('error', '名称和存储桶为必填项'); return; }
      store.dispatch(actions.app.setModal(null));
      const updatedSpaces = [...(config.spaces || []), space];
      store.dispatch(thunks.saveAdminStorageConfig({ ...config, spaces: updatedSpaces }));
      return;
    }

    if (form === 'add-webhook' || form === 'edit-webhook') {
      const modal = store.getState().app.modal;
      if (!modal) return;
      const isEdit = form === 'edit-webhook';
      let headers = {};
      try {
        const h = String(data.get('headers') || '').trim();
        if (h) headers = JSON.parse(h);
      } catch { dispatchToast('error', 'Headers 格式错误，需为有效 JSON'); return; }
      const events = String(data.get('events') || '').split(',').map(s => s.trim()).filter(Boolean);
      const webhook = {
        id: isEdit ? modal.id : `wh-${Date.now()}`,
        name: String(data.get('name') || '').trim(),
        msgtype: String(data.get('msgtype') || 'json'),
        url: String(data.get('url') || '').trim(),
        method: String(data.get('method') || 'POST'),
        contentType: String(data.get('contentType') || 'application/json'),
        headers,
        body: String(data.get('body') || ''),
        events,
        enabled: data.get('enabled') === 'on',
      };
      if (!webhook.name || !webhook.url) { dispatchToast('error', '名称和 URL 为必填项'); return; }
      store.dispatch(actions.app.setModal(null));
      const existing = store.getState().admin.webhooks || [];
      const updated = isEdit ? existing.map(w => w.id === webhook.id ? webhook : w) : [...existing, webhook];
      store.dispatch(thunks.saveAdminWebhooks(updated));
      return;
    }

    if (form === 'add-storage-binding') {
      const config = store.getState().admin.storageConfig;
      if (!config) return;
      const binding = {
        path: String(data.get('path') || '').trim(),
        storageId: String(data.get('storageId') || '').trim(),
      };
      if (!binding.path || !binding.storageId) { dispatchToast('error', '路径和存储空间为必填项'); return; }
      store.dispatch(actions.app.setModal(null));
      const updatedBindings = [...(config.bindings || []), binding];
      store.dispatch(thunks.saveAdminStorageConfig({ ...config, bindings: updatedBindings }));
      return;
    }
  });

  const mq = windowRef.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
      documentRef.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}
