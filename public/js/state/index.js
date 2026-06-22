import { combineReducers, createStore } from "./create-slice.js";
import { createAppSlice, appInitialState } from "./slices/app-slice.js";
import { createExplorerSlice, explorerInitialState } from "./slices/explorer-slice.js";
import { createAdminSlice, adminInitialState } from "./slices/admin-slice.js";
import { createShareSlice, shareInitialState } from "./slices/share-slice.js";
import { createUploadsSlice, uploadsInitialState } from "./slices/uploads-slice.js";

export function createRootStore({ page }) {
  const appSlice = createAppSlice({ ...appInitialState, page, now: Date.now() });
  const explorerSlice = createExplorerSlice(explorerInitialState);
  const adminSlice = createAdminSlice(adminInitialState);
  const shareSlice = createShareSlice(shareInitialState);
  const uploadsSlice = createUploadsSlice(uploadsInitialState);

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
