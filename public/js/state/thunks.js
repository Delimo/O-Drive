import { isMockMode, mockFolders, mockFiles, mockAdminStats, mockAdminShares, mockShareItem, mockTextContent, mockAdminHealth, mockAdminLogs, mockProtectedPaths, mockAdminQuota, mockHiddenPaths, mockStorageConfig, mockWebhooks, mockWebhookDeliveries } from '../mock/index.js';

const CHUNK_SIZE = 5 * 1024 * 1024;

export function createThunks(deps) {
  const {
    actions,
    authApi,
    trashApi,
    fileApi,
    adminApi,
    shareApi,
    previewService,
    uploadService,
    normalizeKey,
    syncHomeUrl,
    dispatchToast,
    getEntryPath,
    requiresProtectedUnlock,
    openProtectedUnlockModal,
    createDeferredAction,
    humanError,
    copyText,
    getPage,
    openDownload,
    findCurrentEntryByPath,
    getStore,
  } = deps;

  const page = getPage();
  const mock = isMockMode();

  let uploadIdSeq = 0;
  const nextUploadId = () => `up-${Date.now()}-${(uploadIdSeq += 1)}`;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  const thunks = {
    loadRole: () => async dispatch => {
      if (mock) {
        dispatch(actions.app.setRole({ role: 'admin', csrf: 'mock-csrf' }));
        dispatch(actions.app.setBooting(false));
        return;
      }
      try {
        const { response, data } = await authApi.loadRole();
        if (!response.ok) {
          dispatch(actions.app.setRole({ role: 'guest', csrf: '' }));
          dispatch(actions.app.setBooting(false));
          return;
        }
        dispatch(actions.app.setRole(data));
      } catch (_) {
        dispatch(actions.app.setRole({ role: 'guest', csrf: '' }));
      } finally {
        dispatch(actions.app.setBooting(false));
      }
    },
    loadExplorer: () => async (dispatch, getState) => {
      const state = getState();
      dispatch(actions.explorer.setLoading(true));
      dispatch(actions.explorer.setSelection(''));
      const path = normalizeKey(state.explorer.path);
      const query = state.explorer.query.trim();
      dispatch(actions.explorer.setSearching(Boolean(query) && !state.explorer.trashMode));

      if (mock) {
        dispatch(actions.explorer.setData({
          folders: query ? [] : mockFolders,
          files: query
            ? mockFiles.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
            : mockFiles,
          storageId: 'r2',
        }));
        dispatch(actions.explorer.setSearching(false));
        syncHomeUrl(path, query);
        return;
      }

      try {
        if (state.explorer.trashMode) {
          const { response, data } = await trashApi.list(query);
          if (!response.ok) throw new Error(data?.message || '回收站加载失败');
          dispatch(actions.explorer.setData({ trashItems: data.items || [] }));
          return;
        }

        if (query) {
          const scope = path ? `/${path}` : '/';
          const { filterKind, filterMinSize, filterMaxSize, filterDateFrom, filterDateTo } = state.explorer;
          const { response, data } = await fileApi.search(query, scope, '', {
            kind: filterKind !== 'all' ? filterKind : '',
            minSize: filterMinSize || '',
            maxSize: filterMaxSize || '',
            modifiedAfter: filterDateFrom || '',
            modifiedBefore: filterDateTo || '',
          });
          if (!response.ok) throw new Error(data?.message || '搜索失败');
          dispatch(actions.explorer.setSearchData({ files: data.files || [], cursor: data.nextCursor || '', hasMore: Boolean(data.nextCursor) }));
          return;
        }

        const { response, data } = await fileApi.list(path);
        if (!response.ok) throw new Error(data?.message || '目录加载失败');
        dispatch(actions.explorer.setData({
          folders: data.folders || [],
          files: data.files || [],
          storageId: data.storageId || 'r2',
        }));
        syncHomeUrl(path, query);
      } catch (error) {
        dispatch(actions.explorer.setError(error.message || '加载失败'));
      } finally {
        dispatch(actions.explorer.setSearching(false));
      }
    },
    loadAdminStats: () => async dispatch => {
      dispatch(actions.admin.setLoading(true));
      if (mock) {
        dispatch(actions.admin.setStats(mockAdminStats));
        return;
      }
      try {
        const { response, data } = await adminApi.stats();
        if (!response.ok) throw new Error(data?.message || '后台概览加载失败');
        dispatch(actions.admin.setStats(data));
      } catch (error) {
        dispatch(actions.admin.setError(error.message || '后台概览加载失败'));
      }
    },
    loadAdminShares: () => async dispatch => {
      dispatch(actions.admin.setSharesLoading(true));
      if (mock) {
        dispatch(actions.admin.setShares(mockAdminShares));
        return;
      }
      try {
        const { response, data } = await shareApi.list();
        if (!response.ok) throw new Error(data?.message || '分享列表加载失败');
        dispatch(actions.admin.setShares(data?.items || []));
      } catch (error) {
        dispatch(actions.admin.setSharesError(error.message || '分享列表加载失败'));
      }
    },
    loadShare: () => async (dispatch, getState) => {
      const token = getState().share.token.trim();
      if (!token && !mock) {
        dispatch(actions.share.setError('请提供分享 token。'));
        return;
      }

      dispatch(actions.share.setLoading(true));
      if (mock) {
        dispatch(actions.share.setData(mockShareItem));
        if (!token) dispatch(actions.share.setToken('mock-share-token'));
        return;
      }
      try {
        const { response, data } = await shareApi.info(token);
        if (response.status === 403 && data?.code === 'SHARE_PASSWORD_REQUIRED') {
          dispatch(actions.share.setPasswordRequired('该分享需要访问密码。'));
          return;
        }
        if (!response.ok) throw new Error(data?.message || '分享信息加载失败');
        dispatch(actions.share.setData(data.item));
      } catch (error) {
        dispatch(actions.share.setError(error.message || '分享信息加载失败'));
      }
    },
    login: credentials => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      dispatch(actions.app.setModal({ type: 'login', loading: true, error: '', values: credentials }));
      try {
        const { response, data } = await authApi.login(credentials);
        if (!response.ok || !data?.success) {
          dispatch(actions.app.setModal({
            type: 'login',
            loading: false,
            error: data?.message || '用户名或密码错误',
            values: credentials,
          }));
          return;
        }

        dispatch(actions.app.setModal(null));
        await dispatch(thunks.loadRole());
        dispatchToast('success', '管理员登录成功');

        if (page === 'admin') {
          await Promise.all([
            dispatch(thunks.loadAdminStats()),
            dispatch(thunks.loadAdminShares()),
          ]);
          return;
        }

        await dispatch(thunks.loadExplorer());
      } catch (_) {
        dispatch(actions.app.setModal({
          type: 'login',
          loading: false,
          error: '登录请求失败',
          values: credentials,
        }));
      }
    },
    logout: () => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        await authApi.logout();
        dispatch(actions.app.setRole({ role: 'guest', csrf: '' }));
        dispatchToast('success', '已退出管理员账户');
        if (page === 'admin') {
          dispatch(actions.admin.setError('当前未登录管理员账户。'));
          dispatch(actions.admin.setShares([]));
          dispatch(actions.admin.setSharesError(''));
        }
        if (page === 'home') {
          dispatch(actions.explorer.setTrashMode(false));
          await dispatch(thunks.loadExplorer());
        }
      } catch (_) {
        dispatchToast('error', '退出失败');
      }
    },
    createFolder: folderName => async (dispatch, getState) => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      const name = String(folderName || '').trim();
      if (!name) return;

      const state = getState();
      const path = normalizeKey(state.explorer.path);
      try {
        const { response, data } = await fileApi.createFolder(path, name, state.explorer.storageId || 'r2');
        if (!response.ok || !data?.success) throw new Error(data?.message || '创建文件夹失败');
        dispatch(actions.app.setModal(null));
        dispatchToast('success', `已创建文件夹“${name}”`);
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        dispatch(actions.app.setModal({
          type: 'folder',
          loading: false,
          error: error.message || '创建文件夹失败',
          values: { folderName: name },
        }));
      }
    },
    uploadFiles: files => async (dispatch, getState) => {
      const state = getState();
      const list = uploadService.prepareFiles(files, normalizeKey(state.explorer.path));
      if (!list.length) return;

      const queued = list.map(item => ({
        item,
        id: nextUploadId(),
        name: item.relativeDir ? `${item.relativeDir}/${item.file.name}` : item.file.name,
        multipart: item.file.size > CHUNK_SIZE,
      }));

      dispatch(actions.uploads.enqueue(queued.map(q => ({
        id: q.id,
        name: q.name,
        status: 'pending',
        progress: 0,
        error: '',
        multipart: q.multipart,
      }))));

      if (mock) {
        for (const q of queued) {
          dispatch(actions.uploads.update({ id: q.id, status: 'uploading', progress: 0 }));
          for (const pct of [25, 55, 80, 100]) {
            await delay(160);
            dispatch(actions.uploads.update({ id: q.id, progress: pct }));
          }
          dispatch(actions.uploads.update({ id: q.id, status: 'success', progress: 100 }));
        }
        dispatchToast('success', `已模拟上传 ${queued.length} 个文件（设计预览模式）`);
        return;
      }

      let uploaded = 0;
      let failed = 0;
      let cancelledItems = [];

      for (const q of queued) {
        const { item, multipart } = q;
        dispatch(actions.uploads.update({ id: q.id, status: 'uploading', progress: 0 }));

        try {
          const stateNow = getState();
          const currentItem = stateNow.uploads.items.find(i => i.id === q.id);
          if (currentItem?.status === 'cancelling') throw new Error('UPLOAD_CANCELLED');

          if (item.relativeDir) {
            await uploadService.ensureDirectoryTree(item.targetDir);
          }

          const conflictMode = getState().uploads.conflictMode;

          if (multipart) {
            let cancelled = false;
            await uploadService.multipartUpload(item, pct => {
              const s = getState();
              const ci = s.uploads.items.find(i => i.id === q.id);
              if (ci?.status === 'cancelling') { cancelled = true; return; }
              dispatch(actions.uploads.update({ id: q.id, progress: pct }));
            }, null, conflictMode);
            if (cancelled) throw new Error('UPLOAD_CANCELLED');
          } else {
            const { response, data } = await uploadService.uploadSingle(item, pct => {
              const s = getState();
              const ci = s.uploads.items.find(i => i.id === q.id);
              if (ci?.status === 'cancelling') throw new Error('UPLOAD_CANCELLED');
              dispatch(actions.uploads.update({ id: q.id, progress: pct }));
            }, conflictMode);
            if (!response.ok || !data?.success) {
              throw new Error(data?.message || `上传 ${item.file.name} 失败`);
            }
          }

          uploaded += 1;
          dispatch(actions.uploads.update({ id: q.id, status: 'success', progress: 100 }));
        } catch (error) {
          if (error.message === 'UPLOAD_CANCELLED') {
            cancelledItems.push(q.id);
            dispatch(actions.uploads.setCancelled(q.id));
          } else {
            failed += 1;
            dispatch(actions.uploads.update({ id: q.id, status: 'error', error: error.message || '上传失败' }));
          }
        }
      }

      if (failed === 0 && cancelledItems.length === 0) {
        dispatchToast('success', `已上传 ${uploaded} 个文件`);
      } else if (uploaded === 0 && failed === 0) {
        dispatchToast('info', `已取消 ${cancelledItems.length} 个文件`);
      } else if (uploaded === 0) {
        dispatchToast('error', `上传失败 ${failed} 个文件`);
      } else {
        dispatchToast('error', `成功 ${uploaded} 个，失败 ${failed} 个`);
      }
      await dispatch(thunks.loadExplorer());
    },
    loadMoreSearchResults: () => async (dispatch, getState) => {
      const state = getState();
      const cursor = state.explorer.searchCursor;
      if (!cursor || state.explorer.loading) return;
      const query = state.explorer.query.trim();
      const path = normalizeKey(state.explorer.path);
      const scope = path ? `/${path}` : '/';
      const { filterKind, filterMinSize, filterMaxSize, filterDateFrom, filterDateTo } = state.explorer;
      dispatch(actions.explorer.setLoading(true));
      try {
        const { response, data } = await fileApi.search(query, scope, cursor, {
          kind: filterKind !== 'all' ? filterKind : '',
          minSize: filterMinSize || '',
          maxSize: filterMaxSize || '',
          modifiedAfter: filterDateFrom || '',
          modifiedBefore: filterDateTo || '',
        });
        if (!response.ok) throw new Error(data?.message || '搜索失败');
        dispatch(actions.explorer.appendSearchResults({ files: data.files || [], cursor: data.nextCursor || '', hasMore: Boolean(data.nextCursor) }));
      } catch (error) {
        dispatchToast('error', error.message || '加载更多结果失败');
        dispatch(actions.explorer.setLoading(false));
      }
    },
    cancelFileUpload: id => async dispatch => {
      dispatch(actions.uploads.cancelItem(id));
    },
    retryFileUpload: id => async (dispatch, getState) => {
      const state = getState();
      const item = state.uploads.items.find(i => i.id === id);
      if (!item) return;
      dispatch(actions.uploads.retryItem(id));
      const files = state.explorer.files || [];
      const folders = state.explorer.folders || [];
      const entry = [...folders, ...files].find(e => e.name === item.name);
      if (entry) {
        dispatchToast('info', `重新上传 ${item.name}`);
        return;
      }
    },
    previewEntry: entry => async dispatch => {
      if (!entry || !getEntryPath(entry)) return;

      if (requiresProtectedUnlock(entry)) {
        openProtectedUnlockModal(getEntryPath(entry), createDeferredAction('preview', { path: getEntryPath(entry) }));
        return;
      }

      const baseModal = previewService.createModal(entry);
      dispatch(actions.app.setModal(baseModal));
      if (baseModal.contentMode !== 'text') {
        dispatch(actions.app.setModal({ ...baseModal, loading: false }));
        return;
      }

      if (mock) {
        dispatch(actions.app.setModal({ ...baseModal, loading: false, content: mockTextContent(entry) }));
        return;
      }

      try {
        const { response, text } = await previewService.fetchText(entry);
        if (!response.ok) throw new Error(`读取失败 (${response.status})`);
        dispatch(actions.app.setModal({ ...baseModal, loading: false, content: text }));
      } catch (error) {
        dispatch(actions.app.setModal({ ...baseModal, loading: false, error: error.message || '预览失败' }));
      }
    },
    savePreviewText: content => async (dispatch, getState) => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      const modal = getState().app.modal;
      const path = modal?.entry ? getEntryPath(modal.entry) : '';
      if (!path) return;

      try {
        const { response, data } = await fileApi.saveText(path, content);
        if (!response.ok || data?.success === false) throw new Error(humanError(response, data, '保存失败'));
        const { draftContent: _, ...cleanModal } = modal;
        dispatch(actions.app.setModal({ ...cleanModal, editing: false, content }));
        dispatchToast('success', '文本内容已保存');
      } catch (error) {
        dispatchToast('error', error.message || '保存失败');
      }
    },
    createShare: entry => async dispatch => {
      if (!entry || !getEntryPath(entry)) return;
      dispatch(actions.app.setModal({
        type: 'share',
        loading: false,
        error: '',
        entry,
        values: {
          expiresInDays: '7',
          maxDownloads: '0',
          password: '',
          allowPreview: true,
          allowDownload: true,
        },
      }));
    },
    submitShare: values => async (dispatch, getState) => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      const modal = getState().app.modal;
      const entry = modal?.entry;
      const path = entry ? getEntryPath(entry) : '';
      if (!path) return;

      try {
        const payload = {
          path,
          expiresInDays: Number(values.expiresInDays || 0),
          maxDownloads: Number(values.maxDownloads || 0),
          password: String(values.password || '').trim(),
          allowPreview: Boolean(values.allowPreview),
          allowDownload: Boolean(values.allowDownload),
        };
        const { response, data } = await shareApi.create(payload);
        if (!response.ok || !data?.item?.token) throw new Error(humanError(response, data, '创建分享失败'));

        const link = `${window.location.origin}/share.html?token=${encodeURIComponent(data.item.token)}`;
        await copyText(link, '分享链接已创建并复制');
        dispatch(actions.app.setModal(null));

        if (page === 'admin') {
          await dispatch(thunks.loadAdminShares());
        }
      } catch (error) {
        dispatch(actions.app.setModal({ ...modal, error: error.message || '创建分享失败', values }));
      }
    },
    deleteShare: token => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      if (!token) return;

      dispatch(actions.admin.setShareBusyToken(token));
      try {
        const { response, data } = await shareApi.remove(token);
        if (!response.ok || data?.success === false) {
          throw new Error(humanError(response, data, '删除分享失败'));
        }
        dispatchToast('success', '分享已删除');
        await dispatch(thunks.loadAdminShares());
      } catch (error) {
        dispatchToast('error', error.message || '删除分享失败');
      } finally {
        dispatch(actions.admin.setShareBusyToken(''));
      }
    },
    deleteShareWithModal: token => async (dispatch, getState) => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      if (!token) return;

      const modal = getState().app.modal;
      dispatch(actions.app.setModal({ ...modal, loading: true, error: '' }));
      try {
        const { response, data } = await shareApi.remove(token);
        if (!response.ok || data?.success === false) {
          throw new Error(humanError(response, data, '删除分享失败'));
        }
        dispatch(actions.app.setModal(null));
        dispatchToast('success', '分享已删除');
        await dispatch(thunks.loadAdminShares());
      } catch (error) {
        dispatch(actions.app.setModal({ ...modal, loading: false, error: error.message || '删除分享失败' }));
      }
    },
    cleanupExpiredShares: () => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      dispatch(actions.admin.setShareBusyToken('__cleanup__'));
      try {
        const { response, data } = await shareApi.cleanupExpired();
        if (!response.ok || data?.success === false) {
          throw new Error(humanError(response, data, '清理过期分享失败'));
        }
        dispatchToast('success', '已清理过期分享');
        await dispatch(thunks.loadAdminShares());
      } catch (error) {
        dispatchToast('error', error.message || '清理过期分享失败');
      } finally {
        dispatch(actions.admin.setShareBusyToken(''));
      }
    },
    cleanupExpiredSharesWithModal: () => async (dispatch, getState) => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }

      const modal = getState().app.modal;
      dispatch(actions.app.setModal({ ...modal, loading: true, error: '' }));
      try {
        const { response, data } = await shareApi.cleanupExpired();
        if (!response.ok || data?.success === false) {
          throw new Error(humanError(response, data, '清理过期分享失败'));
        }
        dispatch(actions.app.setModal(null));
        dispatchToast('success', '已清理过期分享');
        await dispatch(thunks.loadAdminShares());
      } catch (error) {
        dispatch(actions.app.setModal({ ...modal, loading: false, error: error.message || '清理过期分享失败' }));
      }
    },
    restoreTrash: trashId => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await trashApi.restore(trashId);
        if (!response.ok || data?.success === false) throw new Error(humanError(response, data, '恢复失败'));
        dispatchToast('success', '已从回收站恢复');
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        dispatchToast('error', error.message || '恢复失败');
      }
    },
    deleteTrash: trashId => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await trashApi.remove(trashId);
        if (!response.ok || data?.success === false) throw new Error(humanError(response, data, '彻底删除失败'));
        dispatchToast('success', '回收站记录已彻底删除');
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        dispatchToast('error', error.message || '彻底删除失败');
      }
    },
    clearTrash: () => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await trashApi.clear();
        if (!response.ok) throw new Error(humanError(response, data, '清空回收站失败'));
        dispatchToast('success', '回收站已清空');
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        dispatchToast('error', error.message || '清空回收站失败');
      }
    },
    clearTrashWithModal: () => async (dispatch, getState) => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }

      try {
        const { response, data } = await trashApi.clear();
        if (!response.ok) throw new Error(humanError(response, data, '清空回收站失败'));
        dispatch(actions.app.setModal(null));
        dispatchToast('success', '回收站已清空');
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        const modal = getState().app.modal;
        dispatch(actions.app.setModal({ ...modal, loading: false, error: error.message || '清空回收站失败' }));
      }
    },
    batchDelete: paths => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      if (!paths?.length) return;

      dispatch(actions.explorer.setBatchBusy(true));
      try {
        const { response, data } = await fileApi.batchDelete(paths);
        if ((!response.ok || data?.success === false) && !data?.completed) {
          throw new Error(humanError(response, data, '删除失败'));
        }
        dispatch(actions.explorer.setSelectedKeys([]));
        dispatchToast('success', data?.completed ? `已处理 ${data.completed} 项` : '已移入回收站');
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        dispatchToast('error', error.message || '删除失败');
      } finally {
        dispatch(actions.explorer.setBatchBusy(false));
      }
    },
    renameEntry: (path, newName) => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      if (!path || !newName) return;

      try {
        const { response, data } = await fileApi.rename(path, newName);
        if (!response.ok) throw new Error(humanError(response, data, '重命名失败'));
        dispatch(actions.app.setModal(null));
        dispatchToast('success', '已完成重命名');
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        const modal = getStore().getState().app.modal;
        dispatch(actions.app.setModal({ ...modal, error: error.message || '重命名失败', values: { newName } }));
      }
    },
    pasteClipboard: () => async (dispatch, getState) => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      const clipboard = getState().explorer.clipboard;
      if (!clipboard?.paths?.length) return;

      dispatch(actions.explorer.setBatchBusy(true));
      try {
        const { response, data } = await fileApi.paste(
          clipboard.action,
          clipboard.paths,
          `/${normalizeKey(getState().explorer.path)}`.replace(/\/$/, '') || '/',
        );
        if ((!response.ok || data?.success === false) && !data?.completed) {
          throw new Error(humanError(response, data, '粘贴失败'));
        }
        dispatch(actions.explorer.setClipboard(null));
        dispatch(actions.explorer.setSelectedKeys([]));
        dispatchToast('success', clipboard.action === 'move' ? '已执行移动' : '已执行复制');
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        dispatchToast('error', error.message || '粘贴失败');
      } finally {
        dispatch(actions.explorer.setBatchBusy(false));
      }
    },
    batchRestoreTrash: trashIds => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      if (!trashIds?.length) return;

      dispatch(actions.explorer.setBatchBusy(true));
      try {
        for (const id of trashIds) {
          const { response, data } = await trashApi.restore(id);
          if (!response.ok || data?.success === false) {
            throw new Error(humanError(response, data, '批量恢复失败'));
          }
        }
        dispatch(actions.explorer.setSelectedKeys([]));
        dispatchToast('success', `已恢复 ${trashIds.length} 条记录`);
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        dispatchToast('error', error.message || '批量恢复失败');
      } finally {
        dispatch(actions.explorer.setBatchBusy(false));
      }
    },
    batchDeleteTrash: trashIds => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      if (!trashIds?.length) return;

      dispatch(actions.explorer.setBatchBusy(true));
      try {
        for (const id of trashIds) {
          const { response, data } = await trashApi.remove(id);
          if (!response.ok || data?.success === false) {
            throw new Error(humanError(response, data, '批量彻底删除失败'));
          }
        }
        dispatch(actions.explorer.setSelectedKeys([]));
        dispatchToast('success', `已彻底删除 ${trashIds.length} 条记录`);
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        dispatchToast('error', error.message || '批量彻底删除失败');
      } finally {
        dispatch(actions.explorer.setBatchBusy(false));
      }
    },
    loadAdminHealth: () => async dispatch => {
      dispatch(actions.admin.setHealthLoading(true));
      if (mock) {
        dispatch(actions.admin.setHealth(mockAdminHealth));
        return;
      }
      try {
        const { response, data } = await adminApi.health();
        if (!response.ok) throw new Error(data?.message || '健康检查加载失败');
        dispatch(actions.admin.setHealth(data));
      } catch (error) {
        dispatch(actions.admin.setHealthError(error.message || '健康检查加载失败'));
      }
    },
    loadAdminLogs: (page = 1) => async (dispatch, getState) => {
      dispatch(actions.admin.setLogsLoading(true));
      const filter = getState().admin.logsFilter;
      if (mock) {
        dispatch(actions.admin.setLogs(mockAdminLogs(page)));
        return;
      }
      try {
        const params = { page, size: 20, ...filter };
        const { response, data } = await adminApi.logs(params);
        if (!response.ok) throw new Error(data?.message || '操作日志加载失败');
        dispatch(actions.admin.setLogs({ items: data.items || [], page: data.page || 1, totalPages: data.totalPages || 0 }));
      } catch (error) {
        dispatch(actions.admin.setLogsError(error.message || '操作日志加载失败'));
      }
    },
    loadAdminQuota: () => async dispatch => {
      dispatch(actions.admin.setQuotaLoading(true));
      if (mock) {
        dispatch(actions.admin.setQuota(mockAdminQuota));
        return;
      }
      try {
        const { response, data } = await adminApi.quota();
        if (!response.ok) throw new Error(data?.message || '存储配额加载失败');
        dispatch(actions.admin.setQuota(data));
      } catch (error) {
        dispatch(actions.admin.setQuotaError(error.message || '存储配额加载失败'));
      }
    },
    setAdminQuota: bytes => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await adminApi.setQuota(bytes);
        if (!response.ok) throw new Error(data?.message || '设置存储配额失败');
        dispatchToast('success', '存储配额已更新');
        await dispatch(thunks.loadAdminQuota());
      } catch (error) {
        dispatchToast('error', error.message || '设置存储配额失败');
      }
    },
    loadAdminProtectedPaths: () => async dispatch => {
      dispatch(actions.admin.setProtectedPathsLoading(true));
      if (mock) {
        dispatch(actions.admin.setProtectedPaths(mockProtectedPaths));
        return;
      }
      try {
        const { response, data } = await adminApi.protectedPaths();
        if (!response.ok) throw new Error(data?.message || '受保护路径加载失败');
        dispatch(actions.admin.setProtectedPaths(data.items || []));
      } catch (error) {
        dispatch(actions.admin.setProtectedPathsError(error.message || '受保护路径加载失败'));
      }
    },
    createAdminProtectedPath: path => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      const modal = getStore().getState().app.modal;
      if (!modal) return;
      try {
        const { response, data } = await adminApi.createProtectedPath(path, modal.password, modal.note, modal.showName);
        if (!response.ok) throw new Error(data?.message || '创建受保护路径失败');
        dispatch(actions.app.setModal(null));
        dispatchToast('success', '受保护路径已创建');
        await dispatch(thunks.loadAdminProtectedPaths());
      } catch (error) {
        dispatch(actions.app.setModal({ ...modal, error: error.message || '创建受保护路径失败' }));
      }
    },
    deleteAdminProtectedPath: path => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await adminApi.deleteProtectedPath(path);
        if (!response.ok) throw new Error(data?.message || '删除受保护路径失败');
        dispatchToast('success', '受保护路径已删除');
        await dispatch(thunks.loadAdminProtectedPaths());
      } catch (error) {
        dispatchToast('error', error.message || '删除受保护路径失败');
      }
    },
    loadAdminHiddenPaths: () => async dispatch => {
      dispatch(actions.admin.setHiddenPathsLoading(true));
      if (mock) {
        dispatch(actions.admin.setHiddenPaths(mockHiddenPaths));
        return;
      }
      try {
        const { response, data } = await adminApi.hiddenPaths();
        if (!response.ok) throw new Error(data?.message || '隐藏路径加载失败');
        dispatch(actions.admin.setHiddenPaths(data.list || []));
      } catch (error) {
        dispatch(actions.admin.setHiddenPathsError(error.message || '隐藏路径加载失败'));
      }
    },
    createAdminHiddenPath: targetPath => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await adminApi.createHiddenPath(targetPath);
        if (!response.ok) throw new Error(data?.message || '添加隐藏路径失败');
        dispatchToast('success', '隐藏路径已添加');
        await dispatch(thunks.loadAdminHiddenPaths());
      } catch (error) {
        dispatchToast('error', error.message || '添加隐藏路径失败');
      }
    },
    deleteAdminHiddenPath: path => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await adminApi.deleteHiddenPath(path);
        if (!response.ok) throw new Error(data?.message || '删除隐藏路径失败');
        dispatchToast('success', '隐藏路径已删除');
        await dispatch(thunks.loadAdminHiddenPaths());
      } catch (error) {
        dispatchToast('error', error.message || '删除隐藏路径失败');
      }
    },
    loadAdminStorageConfig: () => async dispatch => {
      dispatch(actions.admin.setStorageConfigLoading(true));
      if (mock) {
        dispatch(actions.admin.setStorageConfig(mockStorageConfig));
        return;
      }
      try {
        const { response, data } = await adminApi.storageConfig();
        if (!response.ok) throw new Error(data?.message || '存储配置加载失败');
        dispatch(actions.admin.setStorageConfig(data));
      } catch (error) {
        dispatch(actions.admin.setStorageConfigError(error.message || '存储配置加载失败'));
      }
    },
    saveAdminStorageConfig: config => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      dispatch(actions.admin.setStorageConfigSaving(true));
      try {
        const { response, data } = await adminApi.saveStorageConfig(config);
        if (!response.ok) throw new Error(data?.message || '保存存储配置失败');
        dispatchToast('success', '存储配置已更新');
        dispatch(actions.admin.setStorageConfig(data));
      } catch (error) {
        dispatchToast('error', error.message || '保存存储配置失败');
        dispatch(actions.admin.setStorageConfigSaving(false));
      }
    },
    testAdminStorageSpace: space => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await adminApi.testStorageSpace(space);
        if (!response.ok) throw new Error(data?.message || '连接测试失败');
        dispatchToast(data.success ? 'success' : 'error', data.success ? `连接成功（${data.durationMs}ms）` : `连接失败: ${data.error || ''}`);
      } catch (error) {
        dispatchToast('error', error.message || '连接测试失败');
      }
    },
    loadAdminWebhooks: () => async dispatch => {
      dispatch(actions.admin.setWebhooksLoading(true));
      if (mock) {
        dispatch(actions.admin.setWebhooks(mockWebhooks));
        return;
      }
      try {
        const { response, data } = await adminApi.webhooks();
        if (!response.ok) throw new Error(data?.message || 'Webhook 配置加载失败');
        dispatch(actions.admin.setWebhooks(data.items || []));
      } catch (error) {
        dispatch(actions.admin.setWebhooksError(error.message || 'Webhook 配置加载失败'));
      }
    },
    saveAdminWebhooks: items => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await adminApi.saveWebhooks(items);
        if (!response.ok) throw new Error(data?.message || '保存 Webhook 配置失败');
        dispatchToast('success', 'Webhook 配置已更新');
        dispatch(actions.admin.setWebhooks(data.items || []));
      } catch (error) {
        dispatchToast('error', error.message || '保存 Webhook 配置失败');
      }
    },
    testAdminWebhook: endpoint => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      try {
        const { response, data } = await adminApi.testWebhook(endpoint);
        if (!response.ok) throw new Error(data?.message || '测试投递失败');
        dispatchToast(data.success ? 'success' : 'error',
          data.success
            ? `${data.name || 'Webhook'} 测试成功（${data.durationMs || 0}ms）：${data.message || ''}`
            : `测试失败：${data.message || data.error || '未知错误'}`);
      } catch (error) {
        dispatchToast('error', error.message || '测试投递失败');
      }
    },
    loadAdminWebhookDeliveries: () => async dispatch => {
      dispatch(actions.admin.setWebhookDeliveriesLoading(true));
      if (mock) {
        dispatch(actions.admin.setWebhookDeliveries(mockWebhookDeliveries));
        return;
      }
      try {
        const { response, data } = await adminApi.webhookDeliveries();
        if (!response.ok) throw new Error(data?.message || '投递记录加载失败');
        dispatch(actions.admin.setWebhookDeliveries(data.items || []));
      } catch (error) {
        dispatch(actions.admin.setWebhookDeliveriesLoading(false));
        dispatchToast('error', error.message || '投递记录加载失败');
      }
    },
    unlockProtectedPath: password => async (dispatch, getState) => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      const modal = getState().app.modal;
      const path = modal?.path || '';
      if (!path) return;

      try {
        const { response, data } = await authApi.unlockProtectedPath(path, password);
        if (!response.ok || data?.success === false) {
          dispatch(actions.app.setModal({ ...modal, error: data?.message || '密码错误' }));
          return;
        }

        const deferred = modal.deferredAction;
        dispatch(actions.app.setModal(null));
        dispatchToast('success', '路径已解锁');

        if (deferred?.kind === 'preview') {
          const unlockedEntry = findCurrentEntryByPath(deferred.path);
          if (unlockedEntry) {
            await dispatch(thunks.previewEntry({ ...unlockedEntry, protected: false }));
          }
          return;
        }

        if (deferred?.kind === 'download') {
          const unlockedEntry = findCurrentEntryByPath(deferred.path);
          if (unlockedEntry) openDownload({ ...unlockedEntry, protected: false });
          return;
        }

        if (deferred?.kind === 'navigate') {
          dispatch(actions.explorer.setTrashMode(false));
          dispatch(actions.explorer.setPath(normalizeKey(deferred.path)));
          dispatch(actions.explorer.setQuery(''));
          dispatch(actions.explorer.setQueryDraft(''));
          await dispatch(thunks.loadExplorer());
        }
      } catch (error) {
        dispatch(actions.app.setModal({ ...modal, error: error.message || '解锁失败' }));
      }
    },
    unlockShare: password => async (dispatch, getState) => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      const token = getState().share.token.trim();
      if (!token) return;

      dispatch(actions.share.setLoading(true));
      try {
        const { response, data } = await shareApi.unlock(token, password);
        if (!response.ok || !data?.success) throw new Error(data?.message || '密码错误');
        dispatchToast('success', '分享已解锁');
        dispatch(actions.share.setPassword(''));
        await dispatch(thunks.loadShare());
      } catch (error) {
        dispatch(actions.share.setPasswordRequired(error.message || '密码错误'));
      }
    },
  };

  return thunks;
}
