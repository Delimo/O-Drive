import { createUiComponents } from "../components.js";
import { createAdminModalRenderers } from "./admin-modals.js";
import { createConfirmationModalRenderers } from "./confirmations.js";
import { createFileModalRenderers } from "./file-modals.js";
import { createPreviewModalRenderers } from "./preview-editor.js";
import { createShareModalRenderers } from "./share-modals.js";
import { createModalCustomSelectRenderer } from "./select.js";

export function createModalRenderers(deps) {
  const { escapeHtml } = deps;
  const { renderFormFeedback } = createUiComponents({ escapeHtml });
  const renderOptionalFormFeedback = (error, helperText, style = "") =>
    error || helperText ? renderFormFeedback(error, helperText, style) : "";
  const renderModalCustomSelect = createModalCustomSelectRenderer({ escapeHtml });
  const context = {
    ...deps,
    renderFormFeedback,
    renderOptionalFormFeedback,
    renderModalCustomSelect,
  };

  const { renderPreviewModal, renderPreviewModalBody } = createPreviewModalRenderers(context);
  const modalRenderers = {
    ...createFileModalRenderers(context),
    ...createShareModalRenderers(context),
    ...createConfirmationModalRenderers(context),
    ...createAdminModalRenderers(context),
    preview: renderPreviewModal,
  };

  function renderModal(state) {
    const modal = state.app.modal;
    if (!modal) return "";
    return modalRenderers[modal.type]?.(modal) || "";
  }

  function renderToast(state) {
    if (!state.app.toast) return "";
    return `
      <div class="toast-wrap">
        <div class="toast" role="${state.app.toast.type === "error" ? "alert" : "status"}" aria-atomic="true" data-type="${escapeHtml(state.app.toast.type || "info")}">${escapeHtml(state.app.toast.message || "")}</div>
      </div>
    `;
  }

  return {
    renderModal,
    renderPreviewModalBody,
    renderToast,
  };
}
