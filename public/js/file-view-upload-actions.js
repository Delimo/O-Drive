import { state } from './state.js';
import { UI } from './ui.js';
import { UploadQueue } from './uploader.js';

export function createFileViewUploadActions() {
  return {
    toggleViewMode() {
      state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
      localStorage.setItem('viewMode', state.viewMode);
      UI.updateFileList();
      UI.closeMobileActions();
    },

    toggleSortMode() {
      const idx = state.sortModes.indexOf(state.sortBy);
      state.sortBy = state.sortModes[(idx + 1) % state.sortModes.length];
      localStorage.setItem('sortBy', state.sortBy);
      UI.updateFileList();
      UI.closeMobileActions();
    },

    async uploadFiles(files, options = {}) {
      if (state.userRole !== 'admin') return;
      const incoming = [...files].map(file => {
        if (!options.preserveRelativePath || !file.webkitRelativePath) return file;
        const parts = file.webkitRelativePath.split('/').filter(Boolean);
        const name = parts.pop() || file.name;
        const relativeDir = parts.join('/');
        const base = state.currentPath.replace(/^\/|\/$/g, '');
        file.uploadName = name;
        file.targetDir = '/' + [base, relativeDir].filter(Boolean).join('/');
        file.displayName = file.webkitRelativePath;
        return file;
      });
      const existing = new Set((state.fileData.files || []).map(file => file.name));
      const conflicts = incoming.filter(file => !file.webkitRelativePath && existing.has(file.name));
      let conflictMode = 'error';
      if (conflicts.length) {
        const answer = prompt(
          `检测到 ${conflicts.length} 个同名文件。请输入处理方式：overwrite 覆盖，rename 自动重命名，skip 跳过。`,
          'rename',
        );
        conflictMode = String(answer || 'skip').trim().toLowerCase();
        if (!['overwrite', 'rename', 'skip'].includes(conflictMode)) conflictMode = 'skip';
      }
      if (!this.uploadQueue) this.uploadQueue = new UploadQueue({ onComplete: () => this.loadFiles() });
      this.uploadQueue.add(incoming, state.currentPath, { conflictMode });
    },
  };
}
