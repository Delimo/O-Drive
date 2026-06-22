import { createSlice } from "../create-slice.js";

export const uploadsInitialState = {
  items: [],
  conflictMode: "rename",
  pendingFiles: null,
};

export function createUploadsSlice(initialState) {
  return createSlice({
    name: "uploads",
    initialState,
    reducers: {
      enqueue(state, action) {
        return { ...state, items: [...state.items, ...(action.payload || [])] };
      },
      update(state, action) {
        const { id, ...patch } = action.payload || {};
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        };
      },
      remove(state, action) {
        return {
          ...state,
          items: state.items.filter((item) => item.id !== action.payload),
        };
      },
      clearFinished(state) {
        return {
          ...state,
          items: state.items.filter(
            (item) => item.status === "pending" || item.status === "uploading",
          ),
        };
      },
      clearAll(state) {
        return { ...state, items: [] };
      },
      cancelItem(state, action) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload
              ? { ...item, status: "cancelling" }
              : item,
          ),
        };
      },
      setCancelled(state, action) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload
              ? { ...item, status: "cancelled", progress: 0 }
              : item,
          ),
        };
      },
      pauseItem(state, action) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload ? { ...item, status: "paused" } : item,
          ),
        };
      },
      pauseAll(state) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.status === "pending" || item.status === "uploading"
              ? { ...item, status: "paused" }
              : item,
          ),
        };
      },
      resumeAll(state) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.status === "paused"
              ? { ...item, status: "pending" }
              : item,
          ),
        };
      },
      resumeItem(state, action) {
        const resumeData = action.payload?.resumeData;
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload?.id
              ? { ...item, status: "pending", ...(resumeData || {}) }
              : item,
          ),
        };
      },
      retryItem(state, action) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === action.payload
              ? { ...item, status: "pending", progress: 0, error: "" }
              : item,
          ),
        };
      },
      setConflictMode(state, action) {
        return { ...state, conflictMode: action.payload || "rename" };
      },
      setPendingFiles(state, action) {
        return { ...state, pendingFiles: action.payload };
      },
      clearPendingFiles(state) {
        return { ...state, pendingFiles: null };
      },
    },
  });
}
