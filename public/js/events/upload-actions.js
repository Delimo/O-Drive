export function registerUploadActions(documentRef, store, actions, thunks, dispatchToast) {
  return (event) => {
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode) return;

    const { action, key } = actionNode.dataset;

    if (action === "confirm-upload") {
      const modal = store.getState().app.modal;
      if (modal && modal.type === "upload-confirm" && modal.files) {
        store.dispatch(actions.uploads.setConflictMode(modal.conflictMode || "rename"));
        store.dispatch(thunks.uploadFiles(modal.files));
        store.dispatch(actions.app.setModal(null));
      }
      return;
    }

    if (action === "cancel-upload-confirm") {
      store.dispatch(actions.app.setModal(null));
      return;
    }

    if (action === "remove-pending-file") {
      const modal = store.getState().app.modal;
      if (modal && modal.type === "upload-confirm" && modal.files) {
        const idx = parseInt(actionNode.dataset.index, 10);
        const newFiles = modal.files.filter((_, i) => i !== idx);
        store.dispatch(actions.app.setModal({ ...modal, files: newFiles }));
      }
      return;
    }

    if (action === "add-more-files") {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.addEventListener("change", () => {
        const modal = store.getState().app.modal;
        if (modal && modal.type === "upload-confirm") {
          const newFiles = Array.from(input.files || []);
          if (newFiles.length) {
            store.dispatch(actions.app.setModal({ ...modal, files: [...modal.files, ...newFiles] }));
          }
        }
      });
      input.click();
      return;
    }

    if (action === "upload") {
      const input = documentRef.getElementById("upload-input");
      if (input) input.click();
      return;
    }

    if (action === "upload-folder") {
      const input = documentRef.getElementById("folder-upload-input");
      if (input) input.click();
      return;
    }

    if (action === "dismiss-upload") {
      store.dispatch(actions.uploads.remove(key || ""));
      return;
    }

    if (action === "cancel-upload") {
      const uploadId = actionNode.dataset.id || key;
      store.dispatch(thunks.cancelFileUpload(uploadId));
      return;
    }

    if (action === "pause-upload") {
      const uploadId = actionNode.dataset.id || key;
      store.dispatch(thunks.pauseFileUpload(uploadId));
      return;
    }

    if (action === "resume-upload") {
      const uploadId = actionNode.dataset.id || key;
      store.dispatch(thunks.resumeFileUpload(uploadId));
      return;
    }

    if (action === "retry-upload") {
      const uploadId = actionNode.dataset.id || key;
      store.dispatch(thunks.retryFileUpload(uploadId));
      return;
    }

    if (action === "clear-finished-uploads") {
      store.dispatch(actions.uploads.clearFinished());
      return;
    }

    if (action === "dismiss-uploads") {
      store.dispatch(actions.uploads.clearAll());
      return;
    }
  };
}
