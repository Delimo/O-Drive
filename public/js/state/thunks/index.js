import { createExplorerThunks } from "./explorer.js";
import { createAdminThunks, cleanupAudioContext } from "./admin.js";
import { createUploadThunks } from "./upload.js";
import { createShareThunks } from "./share.js";
import { createMaintenanceThunks } from "./maintenance.js";

export { cleanupAudioContext };

const _isMock = new URLSearchParams(window.location.search).get("mock") === "1";
const _mockModule = _isMock ? import("../../mock/index.js") : null;

export function createThunks(deps) {
  const mock = _isMock;

  const getMockModule = () => _mockModule;

  let thunks;

  const context = {
    mock,
    getMockModule,
    getThunks: () => thunks,
  };

  thunks = {
    ...createExplorerThunks(deps, context),
    ...createAdminThunks(deps, context),
    ...createUploadThunks(deps, context),
    ...createShareThunks(deps, context),
    ...createMaintenanceThunks(deps, context),
  };

  return thunks;
}
