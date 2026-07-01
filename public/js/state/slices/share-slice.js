import { createSlice } from "../create-slice.js";
import { getSharePath, getShareToken } from "../../utils/path.js";

const initialShareToken = getShareToken();

export const shareInitialState = {
  token: initialShareToken,
  path: getSharePath(),
  loading: Boolean(initialShareToken),
  item: null,
  directory: null,
  error: "",
  requiresPassword: false,
  password: "",
};

export function createShareSlice(initialState) {
  return createSlice({
    name: "share",
    initialState,
    reducers: {
      setLoading(state, action) {
        return { ...state, loading: action.payload };
      },
      setToken(state, action) {
        return { ...state, token: action.payload };
      },
      setPath(state, action) {
        return { ...state, path: action.payload || "" };
      },
      setPassword(state, action) {
        return { ...state, password: action.payload };
      },
      setData(state, action) {
        const payload = action.payload || {};
        const item =
          payload.item || (payload.token || payload.path ? payload : null);
        return {
          ...state,
          loading: false,
          item,
          directory: payload.directory || null,
          error: "",
          requiresPassword: false,
        };
      },
      setPasswordRequired(state, action) {
        return {
          ...state,
          loading: false,
          requiresPassword: true,
          error: action.payload || "",
          directory: null,
        };
      },
      setError(state, action) {
        return {
          ...state,
          loading: false,
          error: action.payload,
          directory: null,
        };
      },
    },
  });
}
