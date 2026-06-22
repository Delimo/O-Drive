import { combineReducers, createStore } from "./create-slice.js";
import { createAppSlice } from "./slices/app-slice.js";
import { createExplorerSlice } from "./slices/explorer-slice.js";
import { createAdminSlice } from "./slices/admin-slice.js";
import { createShareSlice } from "./slices/share-slice.js";
import { createUploadsSlice } from "./slices/uploads-slice.js";

export function createRootStore({ page }) {
  const appSlice = createAppSlice({ page, role: "guest", csrf: "", booting: true, toast: null, modal: null, now: Date.now(), dragging: false });
  const explorerSlice = createExplorerSlice(undefined);
  const adminSlice = createAdminSlice(undefined);
  const shareSlice = createShareSlice(undefined);
  const uploadsSlice = createUploadsSlice(undefined);

  const actions = {
    app: appSlice.actions,
    explorer: explorerSlice.actions,
    admin: adminSlice.actions,
    share: shareSlice.actions,
    uploads: uploadsSlice.actions,
  };

  const store = createStore(
    combineReducers({
      app: appSlice.reducer,
      explorer: explorerSlice.reducer,
      admin: adminSlice.reducer,
      share: shareSlice.reducer,
      uploads: uploadsSlice.reducer,
    }),
    {
      app: appSlice.reducer(undefined, { type: "@@INIT" }),
      explorer: explorerSlice.reducer(undefined, { type: "@@INIT" }),
      admin: adminSlice.reducer(undefined, { type: "@@INIT" }),
      share: shareSlice.reducer(undefined, { type: "@@INIT" }),
      uploads: uploadsSlice.reducer(undefined, { type: "@@INIT" }),
    },
  );

  return { store, actions };
}
