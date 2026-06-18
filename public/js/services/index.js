export function createServices(deps) {
  const {
    detectContentMode,
    getState,
    getEntryPath,
    splitUploadTarget,
    ensureRemoteDirectoryTree,
    fileApi,
  } = deps;

  const previewService = {
    resolveMode(entry) {
      return detectContentMode(entry);
    },
    createModal(entry) {
      const contentMode = this.resolveMode(entry);
      return {
        type: 'preview',
        loading: true,
        error: '',
        entry,
        contentMode,
        content: '',
        editable: getState().app.role === 'admin' && contentMode === 'text',
        editing: false,
      };
    },
    fetchText(entry) {
      return fileApi.previewText(getEntryPath(entry));
    },
  };

  const uploadService = {
    prepareFiles(files, basePath) {
      return Array.from(files || []).map(file => ({
        file,
        ...splitUploadTarget(file, basePath),
      }));
    },
    async ensureDirectoryTree(targetDir) {
      await ensureRemoteDirectoryTree(targetDir);
    },
    uploadSingle(item, onProgress) {
      return fileApi.uploadWithProgress(item.targetDir, item.file, item.targetName, onProgress);
    },
  };

  return {
    previewService,
    uploadService,
  };
}
