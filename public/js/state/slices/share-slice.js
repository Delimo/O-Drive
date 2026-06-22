import { createSlice } from "../create-slice.js";
import { getShareToken } from "../../utils/path.js";

export const shareInitialState = {
  token: getShareToken(),
  loading: false,
  item: null,
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
      setPassword(state, action) {
        return { ...state, password: action.payload };
      },
      setData(state, action) {
        return {
          ...state,
          loading: false,
          item: action.payload,
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
        };
      },
      setError(state, action) {
        return { ...state, loading: false, error: action.payload };
      },
    },
  });
}
