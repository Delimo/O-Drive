import { createSystemRenderer } from "./system.js";
import { createStorageRenderer } from "./storage.js";
import { createPathsRenderer } from "./paths.js";
import { createNotificationsRenderer } from "./notifications.js";
import { createMaintenanceRenderer } from "./maintenance.js";

export function createSettingsRenderer(deps) {
  const system = createSystemRenderer(deps);
  const storage = createStorageRenderer(deps);
  const paths = createPathsRenderer(deps);
  const notifications = createNotificationsRenderer(deps);
  const maintenance = createMaintenanceRenderer(deps);

  return {
    renderAdminHealthSection: system.renderAdminHealthSection,
    renderAdminQuotaSection: system.renderAdminQuotaSection,
    renderAdminProtectedPathsSection: paths.renderAdminProtectedPathsSection,
    renderAdminHiddenPathsSection: paths.renderAdminHiddenPathsSection,
    renderAdminStorageSection: storage.renderAdminStorageSection,
    renderAdminNotificationsSection: notifications.renderAdminNotificationsSection,
    MAINTENANCE_ACTIONS: maintenance.MAINTENANCE_ACTIONS,
    renderAdminMaintenanceSection: maintenance.renderAdminMaintenanceSection,
    renderAdminTaskListSection: maintenance.renderAdminTaskListSection,
    renderSystemStatusSection: system.renderSystemStatusSection,
    renderSystemSection: system.renderSystemSection,
    renderStorageSection: storage.renderStorageSection,
    renderPathManagementSection: paths.renderPathManagementSection,
  };
}
