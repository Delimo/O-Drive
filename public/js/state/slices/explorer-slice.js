import { createSlice } from "../create-slice.js";
import { getInitialPath, getInitialSearch } from "../../utils/path.js";

export const EXPLORER_DISPLAY_PAGE = 500;

export const explorerInitialState = {
  path: getInitialPath(),
  storageId: "r2",
  loading: false,
  query: getInitialSearch(),
  queryDraft: getInitialSearch(),
  showFilters: false,
  // 服务端搜索条件：仅在 query 非空时作为 API kind 参数提交。
  filterKind: "all",
  filterMinSize: "",
  filterMaxSize: "",
  filterDateFrom: "",
  filterDateTo: "",
  searchCursor: "",
  hasMore: false,
  searchScanned: 0,
  searchScanLimitReached: false,
  view: "grid",
  // 当前文件集合的实际排序模式，由 selector 同时服务网格和列表视图。
  sort: "smart",
  // 列表表头交互状态：记录激活列和箭头方向，并映射到上面的 sort 模式。
  sortField: "name",
  sortDir: "asc",
  // 当前已加载结果的本地快捷类型筛选，不会作为搜索 API 参数提交。
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
  folderStats: {},
  folderStatsLoadingKey: "",
  folderStatsErrors: {},
  loadSeq: 0,
  // 大目录窗口化渲染：一次只渲染前 displayLimit 项，"显示更多"按钮递增。
  displayLimit: EXPLORER_DISPLAY_PAGE,
};

export function createExplorerSlice(initialState) {
  return createSlice({
    name: "explorer",
    initialState,
    reducers: {
      setLoading(state, action) {
        return { ...state, loading: action.payload };
      },
      setPath(state, action) {
        return { ...state, path: action.payload };
      },
      startNavigation(state, action) {
        return {
          ...state,
          trashMode: false,
          path: action.payload || "",
          query: "",
          queryDraft: "",
          loading: true,
          error: "",
          selectedKey: "",
          selectedKeys: [],
          trashSelectedKeys: [],
          displayLimit: EXPLORER_DISPLAY_PAGE,
        };
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
      setFolderStatsLoading(state, action) {
        const path = action.payload || "";
        const nextErrors = { ...(state.folderStatsErrors || {}) };
        if (path) delete nextErrors[path];
        return {
          ...state,
          folderStatsLoadingKey: path,
          folderStatsErrors: nextErrors,
        };
      },
      setFolderStats(state, action) {
        const { path, stats } = action.payload || {};
        if (!path) return { ...state, folderStatsLoadingKey: "" };
        return {
          ...state,
          folderStatsLoadingKey:
            state.folderStatsLoadingKey === path ? "" : state.folderStatsLoadingKey,
          folderStats: {
            ...(state.folderStats || {}),
            [path]: stats,
          },
        };
      },
      setFolderStatsError(state, action) {
        const { path, error } = action.payload || {};
        if (!path) return { ...state, folderStatsLoadingKey: "" };
        return {
          ...state,
          folderStatsLoadingKey:
            state.folderStatsLoadingKey === path ? "" : state.folderStatsLoadingKey,
          folderStatsErrors: {
            ...(state.folderStatsErrors || {}),
            [path]: error || "加载失败",
          },
        };
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
          searchCursor: "",
          hasMore: false,
          searchScanned: 0,
          searchScanLimitReached: false,
          selectedKeys: [],
          displayLimit: EXPLORER_DISPLAY_PAGE,
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
          searchScanned: Number(action.payload.scanned || 0),
          searchScanLimitReached: Boolean(action.payload.scanLimitReached),
          selectedKeys: [],
          displayLimit: EXPLORER_DISPLAY_PAGE,
        };
      },
      appendSearchResults(state, action) {
        const { files, cursor, hasMore, scanned, scanLimitReached } =
          action.payload || {};
        const existing = state.files || [];
        return {
          ...state,
          loading: false,
          error: "",
          files: [...existing, ...(files || [])],
          searchCursor: cursor || "",
          hasMore: hasMore || false,
          searchScanned:
            Number(state.searchScanned || 0) + Number(scanned || 0),
          searchScanLimitReached: Boolean(scanLimitReached),
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
      raiseDisplayLimit(state, action) {
        return {
          ...state,
          displayLimit:
            (state.displayLimit || EXPLORER_DISPLAY_PAGE) +
            (Number(action.payload) || EXPLORER_DISPLAY_PAGE),
        };
      },
      incrementLoadSeq(state, action) {
        return { ...state, loadSeq: state.loadSeq + 1 };
      },
    },
  });
}
