import { createSlice } from "../create-slice.js";

export const appInitialState = {
  page: "home",
  role: "guest",
  csrf: "",
  guestMode: false,
  booting: true,
  toast: null,
  modal: null,
  now: Date.now(),
  dragging: false,
};

export function createAppSlice(initialState) {
  return createSlice({
    name: "app",
    initialState,
    reducers: {
      setBooting(state, action) {
        return { ...state, booting: action.payload };
      },
      setRole(state, action) {
        return {
          ...state,
          role: action.payload.role,
          csrf: action.payload.csrf || "",
          guestMode: action.payload.guestMode ?? false,
        };
      },
      setToast(state, action) {
        return { ...state, toast: action.payload };
      },
      clearToast(state) {
        return { ...state, toast: null };
      },
      setModal(state, action) {
        return { ...state, modal: action.payload };
      },
      setNow(state, action) {
        return { ...state, now: action.payload };
      },
      setDragging(state, action) {
        return { ...state, dragging: action.payload };
      },
    },
  });
}
