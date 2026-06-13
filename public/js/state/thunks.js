import { isMockMode, mockFolders, mockFiles, mockAdminStats, mockAdminShares, mockShareItem } from '../mock/index.js';

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

      if (mock) {
        dispatch(actions.explorer.setData({
          folders: mockFolders,
          files: mockFiles,
          storageId: 'r2',
        }));
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
          const { response, data } = await fileApi.search(query, scope);
          if (!response.ok) throw new Error(data?.message || '搜索失败');
          dispatch(actions.explorer.setData({ folders: [], files: data.files || [] }));
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
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      const state = getState();
      const list = uploadService.prepareFiles(files, normalizeKey(state.explorer.path));
      if (!list.length) return;

      let uploaded = 0;
      try {
        for (const item of list) {
          const { file, targetDir, relativeDir } = item;
          if (relativeDir) {
            await uploadService.ensureDirectoryTree(targetDir);
          }
          const { response, data } = await uploadService.uploadSingle(item);
          if (!response.ok || !data?.success) {
            throw new Error(data?.message || `上传 ${file.name} 失败`);
          }
          uploaded += 1;
        }
        dispatchToast('success', `已上传 ${uploaded} 个文件`);
        await dispatch(thunks.loadExplorer());
      } catch (error) {
        dispatchToast('error', error.message || '上传失败');
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
        dispatch(actions.app.setModal({ ...modal, editing: false, content }));
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
    batchDelete: paths => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      if (!paths?.length) return;

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
      }
    },
    batchRestoreTrash: trashIds => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      if (!trashIds?.length) return;

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
      }
    },
    batchDeleteTrash: trashIds => async dispatch => {
      if (mock) { dispatchToast('error', '设计预览模式下不可操作'); return; }
      if (!trashIds?.length) return;

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
