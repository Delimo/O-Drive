import { state } from './state.js';
import { UI, Message } from './ui.js';
import { Actions } from './actions.js';

window.state = state;
window.UI = UI;
window.Message = Message;
window.Actions = Actions;

function readArgs(el) {
  const raw = el.dataset.args || '[]';
  try {
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (target.id === 'previewModal' && event.target !== target) return;
  const action = target.dataset.action;
  const args = readArgs(target);
  switch (action) {
    case 'logout': return Actions.logout();
    case 'show-modal': return UI.showModal(args[0]);
    case 'close-modal': return UI.closeModal(args[0]);
    case 'close-preview': return UI.closePreview();
    case 'close-details': return UI.closeDrawer('detailsPanel');
    case 'close-upload-manager': return UI.closeUploadManager();
    case 'close-mobile-actions': return UI.closeMobileActions();
    case 'toggle-mobile-actions': return UI.toggleMobileActions();
    case 'open-file-input': return document.getElementById('fileInput')?.click();
    case 'open-folder-input': return document.getElementById('folderInput')?.click();
    case 'toggle-view': return Actions.toggleViewMode();
    case 'toggle-sort': return Actions.toggleSortMode();
    case 'search': return Actions.handleSearch();
    case 'select-all': return Actions.toggleSelectAll();
    case 'clear-selection': return Actions.clearSelection();
    case 'set-clipboard': return Actions.setClipboard(args[0]);
    case 'start-rename': return Actions.startRenameSelected();
    case 'batch-delete': return Actions.batchDelete();
    case 'execute-paste': return Actions.executePaste();
    case 'clear-clipboard': return Actions.clearClipboard();
    case 'open-filters': return Actions.openFilters();
    case 'open-trash': return Actions.openTrash();
    case 'submit-mkdir': return Actions.submitMkdir();
    case 'submit-unlock': return Actions.submitUnlock();
    case 'toggle-edit': return Actions.toggleEditMode();
    case 'save-text': return Actions.saveTextContent();
    case 'reset-filters': return Actions.resetFilters();
    case 'apply-filters': return Actions.applyFilters();
    case 'apply-trash-filters': return Actions.applyTrashFilters();
    case 'reset-trash-filters': return Actions.resetTrashFilters();
    case 'trash-page': return Actions.trashPage(Number(args[0] || 0));
    case 'restore-trash': return Actions.restoreTrash(args[0]);
    case 'purge-trash': return Actions.purgeTrash(args[0]);
    case 'clear-trash': return Actions.clearTrash();
    case 'cleanup-trash': return Actions.cleanupTrash();
    case 'save-trash-retention': return Actions.saveTrashRetention();
    case 'copy-path': return Actions.copyPath(args[0]);
    case 'navigate': return Actions.navigateTo(args[0]);
    case 'open-preview': return Actions.openPreview(args[0], args[1], Boolean(args[2]));
    case 'download-file': return Actions.downloadFile(args[0]);
    case 'open-details': return Actions.openDetails(args[0]);
    case 'load-more-search': return Actions.loadMoreSearch();
    case 'retry-failed-upload': return Actions.uploadQueue?.retryFailed();
    case 'open-entry': {
      const [path, name, isFolder, protectedItem] = args;
      if (isFolder) {
        if (protectedItem && state.userRole !== 'admin') {
          Actions.handlePasswordRequired({ path }, () => Actions.navigateTo(path));
          return;
        }
        Actions.navigateTo(path);
        return;
      }
      if (name) Actions.openPreview(path, name, Boolean(protectedItem));
      return;
    }
    case 'toggle-select':
      event.preventDefault();
      event.stopPropagation();
      return Actions.toggleSelect(args[0], target, event);
  }
  if (target.closest('#mobileActionSheet')) UI.closeMobileActions();
});

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-submit-action]');
  if (!form) return;
  event.preventDefault();
  const action = form.dataset.submitAction;
  switch (action) {
    case 'login': return Actions.doLogin();
  }
});

document.addEventListener('keydown', event => {
  const input = event.target.closest('[data-enter-action]');
  if (!input || event.key !== 'Enter') return;
  event.preventDefault();
  const action = input.dataset.enterAction;
  switch (action) {
    case 'search': return Actions.handleSearch();
    case 'mkdir': return Actions.submitMkdir();
    case 'unlock': return Actions.submitUnlock();
  }
});

document.getElementById('fileInput')?.addEventListener('change', event => {
  Actions.uploadFiles(event.target.files);
  event.target.value = '';
});

document.getElementById('folderInput')?.addEventListener('change', event => {
  Actions.uploadFiles(event.target.files, { preserveRelativePath: true });
  event.target.value = '';
});

Actions.init();
