import { createSlice } from "../create-slice.js";
import { getInitialPath, getInitialSearch } from "../../utils/path.js";

export const explorerInitialState = {
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
}
