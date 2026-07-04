import { assertApiOk } from "./errors.js";

export function createExplorerThunks(deps, context) {
  const {
    actions,
    fileApi,
    trashApi,
    taskApi,
    normalizeKey,
    syncHomeUrl,
    previewService,
    getEntryPath,
    requiresProtectedUnlock,
    openProtectedUnlockModal,
    createDeferredAction,
    getStore,
    dispatchToast,
    humanError,
    copyText,
    openDownload,
    findCurrentEntryByPath,
  } = deps;

  const { mock, getThunks } = context;

  async function createBackgroundFileTask(dispatch, type, payload, message) {
    const { response, data } = await taskApi.create(type, payload);
    assertApiOk(response, data, "创建后台任务失败", humanError, {
      isValid: (result) => result?.success === true && result?.item?.id,
    });
    dispatchToast("success", message);
    await dispatch(getThunks().loadTasks());
    await dispatch(getThunks().loadNotifications());
    return data.item;
  }

  return {
    loadExplorer: () => async (dispatch, getState) => {
      const state = getState();
      dispatch(actions.explorer.incrementLoadSeq());
      const seq = getState().explorer.loadSeq;
      function isStale() { return getState().explorer.loadSeq !== seq; }
      dispatch(actions.explorer.setLoading(true));
      dispatch(actions.explorer.setSelection(""));
      const path = normalizeKey(state.explorer.path);
      const query = state.explorer.query.trim();
      dispatch(
        actions.explorer.setSearching(
          Boolean(query) && !state.explorer.trashMode,
        ),
      );

      if (mock) {
        const m = await context.getMockModule();
        dispatch(
          actions.explorer.setData({
            folders: query ? [] : m.mockFolders,
            files: query
              ? m.mockFiles.filter((f) =>
                  f.name.toLowerCase().includes(query.toLowerCase()),
                )
              : m.mockFiles,
            storageId: "r2",
          }),
        );
        dispatch(actions.explorer.setSearching(false));
        syncHomeUrl(path, query);
        return;
      }

      try {
        if (state.explorer.trashMode) {
          const { response, data } = await trashApi.list(query);
          assertApiOk(response, data, "回收站加载失败", humanError);
          if (!isStale()) dispatch(actions.explorer.setData({ trashItems: data.items || [] }));
          return;
        }

        if (query) {
          const scope = path ? `/${path}` : "/";
          const {
            filterKind,
            filterMinSize,
            filterMaxSize,
            filterDateFrom,
            filterDateTo,
          } = state.explorer;
          const { response, data } = await fileApi.search(query, scope, "", {
            kind: filterKind !== "all" ? filterKind : "",
            minSize: filterMinSize || "",
            maxSize: filterMaxSize || "",
            modifiedAfter: filterDateFrom || "",
            modifiedBefore: filterDateTo || "",
          });
          assertApiOk(response, data, "搜索失败", humanError);
          if (!isStale()) {
            dispatch(
              actions.explorer.setSearchData({
                files: data.files || [],
                cursor: data.nextCursor || "",
                hasMore: Boolean(data.nextCursor),
                scanned: data.scanned || 0,
                scanLimitReached: Boolean(data.scanLimitReached),
              }),
            );
          }
          return;
        }

        const { response, data } = await fileApi.list(path);
        assertApiOk(response, data, "目录加载失败", humanError);
        if (!isStale()) {
          dispatch(
            actions.explorer.setData({
              folders: data.folders || [],
              files: data.files || [],
              storageId: data.storageId || "r2",
            }),
          );
          syncHomeUrl(path, query);
        }
      } catch (error) {
        if (!isStale()) dispatch(actions.explorer.setError(error.message || "加载失败"));
      } finally {
        if (!isStale()) dispatch(actions.explorer.setSearching(false));
      }
    },

    loadMoreSearchResults: () => async (dispatch, getState) => {
      const state = getState();
      const cursor = state.explorer.searchCursor;
      if (!cursor || state.explorer.loading) return;
      const query = state.explorer.query.trim();
      const path = normalizeKey(state.explorer.path);
      const scope = path ? `/${path}` : "/";
      const {
        filterKind,
        filterMinSize,
        filterMaxSize,
        filterDateFrom,
        filterDateTo,
      } = state.explorer;
      dispatch(actions.explorer.incrementLoadSeq());
      const seq = getState().explorer.loadSeq;
      function isStale() { return getState().explorer.loadSeq !== seq; }
      dispatch(actions.explorer.setLoading(true));
      try {
        const { response, data } = await fileApi.search(query, scope, cursor, {
          kind: filterKind !== "all" ? filterKind : "",
          minSize: filterMinSize || "",
          maxSize: filterMaxSize || "",
          modifiedAfter: filterDateFrom || "",
          modifiedBefore: filterDateTo || "",
        });
        assertApiOk(response, data, "搜索失败", humanError);
        if (!isStale()) {
          dispatch(
            actions.explorer.appendSearchResults({
              files: data.files || [],
              cursor: data.nextCursor || "",
              hasMore: Boolean(data.nextCursor),
              scanned: data.scanned || 0,
              scanLimitReached: Boolean(data.scanLimitReached),
            }),
          );
        }
      } catch (error) {
        if (!isStale()) {
          dispatchToast("error", error.message || "加载更多结果失败");
          dispatch(actions.explorer.setLoading(false));
        }
      }
    },

    loadFolderStats: (entry) => async (dispatch, getState) => {
      const path = normalizeKey(getEntryPath(entry));
      if (!path) return;
      const state = getState();
      if (state.explorer.folderStats?.[path]) return;
      if (state.explorer.folderStatsLoadingKey === path) return;

      dispatch(actions.explorer.setFolderStatsLoading(path));

      if (mock) {
        dispatch(
          actions.explorer.setFolderStats({
            path,
            stats: {
              path,
              fileCount: 0,
              folderCount: 0,
              directFileCount: 0,
              directFolderCount: 0,
              totalSize: 0,
              sizeFormatted: "0 B",
              latestTime: 0,
              truncated: false,
            },
          }),
        );
        return;
      }

      try {
        const { response, data } = await fileApi.folderStats(path);
        assertApiOk(response, data, "文件夹统计加载失败", humanError);
        dispatch(
          actions.explorer.setFolderStats({
            path,
            stats: { ...data, path },
          }),
        );
      } catch (error) {
        dispatch(
          actions.explorer.setFolderStatsError({
            path,
            error: error.message || "文件夹统计加载失败",
          }),
        );
      }
    },

    createFolder: (folderName) => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const name = String(folderName || "").trim();
      if (!name) return;

      const state = getState();
      const path = normalizeKey(state.explorer.path);
      try {
        const { response, data } = await fileApi.createFolder(
          path,
          name,
          state.explorer.storageId || "r2",
        );
        assertApiOk(response, data, "创建文件夹失败", humanError, {
          isValid: (result) => result?.success === true,
        });
        dispatch(actions.app.setModal(null));
        dispatchToast("success", `已创建文件夹"${name}"`);
        await dispatch(getThunks().loadExplorer());
      } catch (error) {
        dispatch(
          actions.app.setModal({
            type: "folder",
            loading: false,
            error: error.message || "创建文件夹失败",
            values: { folderName: name },
          }),
        );
      }
    },

    previewEntry: (entry) => async (dispatch) => {
      if (!entry || !getEntryPath(entry)) return;

      if (requiresProtectedUnlock(entry)) {
        openProtectedUnlockModal(
          getEntryPath(entry),
          createDeferredAction("preview", { path: getEntryPath(entry) }),
        );
        return;
      }

      const baseModal = previewService.createModal(entry);
      dispatch(actions.app.setModal(baseModal));
      if (baseModal.contentMode !== "text") {
        dispatch(actions.app.setModal({ ...baseModal, loading: false }));
        return;
      }

      if (mock) {
        const m = await context.getMockModule();
        dispatch(
          actions.app.setModal({
            ...baseModal,
            loading: false,
            content: m.mockTextContent(entry),
          }),
        );
        return;
      }

      try {
        const { response, text } = await previewService.fetchText(entry);
        if (!response.ok) throw new Error(`读取失败 (${response.status})`);
        dispatch(
          actions.app.setModal({ ...baseModal, loading: false, content: text }),
        );
      } catch (error) {
        dispatch(
          actions.app.setModal({
            ...baseModal,
            loading: false,
            error: error.message || "预览失败",
          }),
        );
      }
    },

    savePreviewText: (content) => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const modal = getState().app.modal;
      const path = modal?.entry ? getEntryPath(modal.entry) : "";
      if (!path) return;

      try {
        const { response, data } = await fileApi.saveText(path, content);
        assertApiOk(response, data, "保存失败", humanError);
        const { draftContent: _, ...cleanModal } = modal;
        dispatch(
          actions.app.setModal({ ...cleanModal, editing: false, content }),
        );
        dispatchToast("success", "文本内容已保存");
      } catch (error) {
        dispatchToast("error", error.message || "保存失败");
      }
    },

    batchDownloadZip: (paths) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      if (!paths?.length) return;
      try {
        const response = await fileApi.downloadZipResponse(paths);
        if (response.status === 202) {
          const data = await response.json().catch(() => ({}));
          dispatchToast("success", "目录较大，已转入后台打包任务");
          if (data?.item?.id) {
            dispatch(getThunks().loadTasks());
            dispatch(getThunks().loadNotifications());
          }
          return;
        }
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.message || "下载失败");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cd = response.headers.get("Content-Disposition") || "";
        const match = cd.match(/filename\*=UTF-8''(.+?)(?:;|$)/);
        a.download = match ? decodeURIComponent(match[1]) : "archive.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        dispatchToast("error", error.message || "下载失败");
      }
    },

    batchDelete: (paths, options = {}) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      if (!paths?.length) return;

      dispatch(actions.explorer.setBatchBusy(true));
      try {
        if (options.background) {
          await createBackgroundFileTask(
            dispatch,
            "delete",
            { paths },
            "操作规模较大，已转入后台删除任务",
          );
          dispatch(actions.explorer.setSelectedKeys([]));
          return;
        }
        const { response, data } = await fileApi.batchDelete(paths);
        assertApiOk(response, data, "删除失败", humanError, {
          allowCompleted: true,
        });
        dispatch(actions.explorer.setSelectedKeys([]));
        dispatchToast(
          "success",
          data?.completed ? `已处理 ${data.completed} 项` : "已移入回收站",
        );
        await dispatch(getThunks().loadExplorer());
      } catch (error) {
        dispatchToast("error", error.message || "删除失败");
      } finally {
        dispatch(actions.explorer.setBatchBusy(false));
      }
    },

    renameEntry: (path, newName) => async (dispatch) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      if (!path || !newName) return;

      try {
        const { response, data } = await fileApi.rename(path, newName);
        assertApiOk(response, data, "重命名失败", humanError);
        dispatch(actions.app.setModal(null));
        dispatchToast("success", "已完成重命名");
        await dispatch(getThunks().loadExplorer());
      } catch (error) {
        const modal = getStore().getState().app.modal;
        dispatch(
          actions.app.setModal({
            ...modal,
            error: error.message || "重命名失败",
            values: { newName },
          }),
        );
      }
    },

    pasteClipboard: (options = {}) => async (dispatch, getState) => {
      if (mock) {
        dispatchToast("error", "设计预览模式下不可操作");
        return;
      }
      const clipboard = getState().explorer.clipboard;
      if (!clipboard?.paths?.length) return;

      dispatch(actions.explorer.setBatchBusy(true));
      try {
        const targetDir =
          `/${normalizeKey(getState().explorer.path)}`.replace(/\/$/, "") ||
          "/";
        if (options.background) {
          await createBackgroundFileTask(
            dispatch,
            "paste",
            {
              action: clipboard.action,
              paths: clipboard.paths,
              targetDir,
            },
            clipboard.action === "move"
              ? "操作规模较大，已转入后台移动任务"
              : "操作规模较大，已转入后台复制任务",
          );
          dispatch(actions.explorer.setClipboard(null));
          dispatch(actions.explorer.setSelectedKeys([]));
          return;
        }
        const { response, data } = await fileApi.paste(
          clipboard.action,
          clipboard.paths,
          targetDir,
        );
        assertApiOk(response, data, "粘贴失败", humanError, {
          allowCompleted: true,
        });
        dispatch(actions.explorer.setClipboard(null));
        dispatch(actions.explorer.setSelectedKeys([]));
        dispatchToast(
          "success",
          clipboard.action === "move" ? "已执行移动" : "已执行复制",
        );
        await dispatch(getThunks().loadExplorer());
      } catch (error) {
        dispatchToast("error", error.message || "粘贴失败");
      } finally {
        dispatch(actions.explorer.setBatchBusy(false));
      }
    },
  };
}
